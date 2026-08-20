import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export default async function handler(req, res) {
  try {
    const { from, to, store = "" } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    const queryParams = { from, to, store };

    // ---------------------------------------------------------
    // TOTAL BID AMOUNT
    // ---------------------------------------------------------
    const totalResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        )

        SELECT
          sum(b.bid_amount) AS total_bid_amount
        FROM cms.mart_cms_bid_history_report b

        INNER JOIN auction_store s
          ON b.auction_number = s.auction_number

        WHERE b.bid_created_at >= {from:Date}
          AND b.bid_created_at < addDays({to:Date}, 1)

          AND (
            {store:String} = ''
            OR s.store_name = {store:String}
          )
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const totalRows = await totalResult.json();
    const total = totalRows[0] ?? {};

    // ---------------------------------------------------------
    // BID AMOUNT BY BRANCH
    // ---------------------------------------------------------
    const branchResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        )

        SELECT
          s.store_name AS branch,
          sum(b.bid_amount) AS bid_amount

        FROM cms.mart_cms_bid_history_report b

        INNER JOIN auction_store s
          ON b.auction_number = s.auction_number

        WHERE b.bid_created_at >= {from:Date}
          AND b.bid_created_at < addDays({to:Date}, 1)

          AND (
            {store:String} = ''
            OR s.store_name = {store:String}
          )

        GROUP BY s.store_name
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const branchRows = await branchResult.json();

    // ---------------------------------------------------------
    // BID AMOUNT BY CATEGORY
    // auction_tags is calculated from Vendor Analysis name
    // ---------------------------------------------------------
    const categoryResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        ),

        lot_category AS (
          SELECT
            auction_number,
            lot_number,

            any(
              CASE
                WHEN name ILIKE '%bulk%'
                  OR name ILIKE '%pallet%'
                  THEN 'Bulk Auction'

                WHEN name ILIKE '%vehicle%'
                  OR name ILIKE '%motorcycle%'
                  OR name ILIKE '%car%'
                  OR name ILIKE '%truck%'
                  OR name ILIKE '%van%'
                  OR name ILIKE '%electric vehicle%'
                  THEN 'Vehicles and Automotive'

                WHEN name ILIKE '%equipment%'
                  OR name ILIKE '%industrial%'
                  OR name ILIKE '%generator%'
                  OR name ILIKE '%backhoe%'
                  OR name ILIKE '%excavator%'
                  OR name ILIKE '%construction%'
                  THEN 'Equipment and Industrial'

                ELSE 'General Merchandise'
              END
            ) AS auction_tags

          FROM xv3.mart_auction_vendor_analysis

          WHERE auction_number IS NOT NULL
            AND lot_number IS NOT NULL

          GROUP BY
            auction_number,
            lot_number
        )

        SELECT
          lc.auction_tags AS category,
          sum(b.bid_amount) AS bid_amount

        FROM cms.mart_cms_bid_history_report b

        INNER JOIN auction_store s
          ON b.auction_number = s.auction_number

        INNER JOIN lot_category lc
          ON b.auction_number = lc.auction_number
         AND b.lot_number = lc.lot_number

        WHERE b.bid_created_at >= {from:Date}
          AND b.bid_created_at < addDays({to:Date}, 1)

          AND (
            {store:String} = ''
            OR s.store_name = {store:String}
          )

        GROUP BY lc.auction_tags
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const categoryRows = await categoryResult.json();

    // ---------------------------------------------------------
    // ACTIVE AUCTIONS RIGHT NOW
    // This is a live/current-state KPI.
    // ---------------------------------------------------------
    const activeAuctionResult = await client.query({
      query: `
        SELECT
          countDistinct(auction_number) AS active_auctions
        FROM xv3.mart_auction_productivity_report

        WHERE starting_time <= now()
          AND ending_time >= now()

          AND (
            {store:String} = ''
            OR store_name = {store:String}
          )
      `,
      query_params: { store },
      format: "JSONEachRow",
    });

    const activeAuctionRows = await activeAuctionResult.json();
    const activeAuction = activeAuctionRows[0] ?? {};

    // ---------------------------------------------------------
    // LOT STATUS KPIs
    //
    // Sold = Outstanding + Paid + Unpaid + Released
    // Unsold = Unsold
    //
    // We scope auctions by productivity report so the same date/store
    // filters apply consistently.
    // ---------------------------------------------------------
    const lotStatusResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number
          FROM xv3.mart_auction_productivity_report

          WHERE starting_time >= {from:Date}
            AND starting_time < addDays({to:Date}, 1)

            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
        ),

        lots AS (
          SELECT
            v.auction_number,
            v.lot_number,
            any(v.status) AS status,
            max(ifNull(v.reserved_price, 0)) AS reserved_price

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number
        )

        SELECT
          count() AS listed_lots,

          countIf(
            status IN (
              'Outstanding',
              'Paid',
              'Unpaid',
              'Released'
            )
          ) AS sold_lots,

          countIf(
            status = 'Unsold'
          ) AS unsold_lots,

          sumIf(
            reserved_price,
            status = 'Unsold'
          ) AS unsold_value

        FROM lots
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const lotStatusRows = await lotStatusResult.json();
    const lotStatus = lotStatusRows[0] ?? {};

    const listedLots = Number(lotStatus.listed_lots ?? 0);
    const soldLots = Number(lotStatus.sold_lots ?? 0);
    const unsoldLots = Number(lotStatus.unsold_lots ?? 0);

    const sellThroughRate =
      listedLots > 0
        ? Number(((soldLots / listedLots) * 100).toFixed(1))
        : 0;

    // ---------------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------------
    return res.status(200).json({
      total_bid_amount: Number(total.total_bid_amount ?? 0),

      active_auctions: Number(activeAuction.active_auctions ?? 0),

      listed_lots: listedLots,
      sold_lots: soldLots,
      unsold_lots: unsoldLots,
      sell_through_rate: sellThroughRate,
      unsold_value: Number(lotStatus.unsold_value ?? 0),

      branches: branchRows.map((row) => ({
        branch: row.branch,
        bid_amount: Number(row.bid_amount ?? 0),
      })),

      categories: categoryRows.map((row) => ({
        category: row.category,
        bid_amount: Number(row.bid_amount ?? 0),
      })),
    });
  } catch (err) {
    console.error("Overview API error:", err);

    return res.status(500).json({
      error: "Failed to load overview",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}