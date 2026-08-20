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

    const queryParams = {
      from,
      to,
      store,
    };

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
            any(auction_tags) AS auction_tags
          FROM xv3.mart_auction_vendor_analysis
          WHERE auction_number IS NOT NULL
            AND lot_number IS NOT NULL
            AND auction_tags IS NOT NULL
            AND trim(auction_tags) != ''
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

    const [totalRows, branchRows, categoryRows] = await Promise.all([
      totalResult.json(),
      branchResult.json(),
      categoryResult.json(),
    ]);

    const total = totalRows[0] ?? {};

    return res.status(200).json({
      total_bid_amount: Number(total.total_bid_amount ?? 0),

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
    });
  }
}