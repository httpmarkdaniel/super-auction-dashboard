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

    // =========================================================
    // OVERALL BIDDER COMPOSITION
    // Keeps the existing working dashboard definition.
    // =========================================================
    const compositionResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        ),

        bidder_first_bid AS (
          SELECT
            lowerUTF8(trim(email)) AS bidder_key,
            min(bid_created_at) AS first_bid_at

          FROM cms.mart_cms_bid_history_report

          WHERE bid_created_at IS NOT NULL
            AND email IS NOT NULL
            AND trim(email) != ''

          GROUP BY bidder_key
        ),

        period_bidders AS (
          SELECT
            lowerUTF8(trim(b.email)) AS bidder_key,
            sum(b.bid_amount) AS bid_amount

          FROM cms.mart_cms_bid_history_report b

          INNER JOIN auction_store s
            ON b.auction_number = s.auction_number

          WHERE b.bid_created_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )

            AND b.bid_created_at < addDays(
              toDateTime(
                concat({to:String}, ' 00:00:00'),
                'Asia/Manila'
              ),
              1
            )

            AND (
              {store:String} = ''
              OR s.store_name = {store:String}
            )

            AND b.email IS NOT NULL
            AND trim(b.email) != ''

          GROUP BY bidder_key
        )

        SELECT
          countIf(
            f.first_bid_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS new_bidders,

          countIf(
            f.first_bid_at < toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS returning_bidders,

          sumIf(
            p.bid_amount,
            f.first_bid_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS new_bidders_bid_amount,

          sumIf(
            p.bid_amount,
            f.first_bid_at < toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS returning_bidders_bid_amount

        FROM period_bidders p

        INNER JOIN bidder_first_bid f
          ON p.bidder_key = f.bidder_key
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // =========================================================
    // PER-AUCTION PARTICIPATING BIDDERS
    //
    // Grain:
    // auction_number + bidder
    //
    // A bidder participating in 3 auctions is therefore counted
    // once in EACH of those 3 auctions.
    // =========================================================
    const perAuctionResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name

          FROM xv3.mart_auction_productivity_report

          WHERE auction_number IS NOT NULL
        ),

        bidder_first_ever_bid AS (
          SELECT
            lowerUTF8(trim(email)) AS bidder_key,
            min(bid_created_at) AS first_ever_bid_at

          FROM cms.mart_cms_bid_history_report

          WHERE bid_created_at IS NOT NULL
            AND email IS NOT NULL
            AND trim(email) != ''

          GROUP BY bidder_key
        ),

        auction_bidder_activity AS (
          SELECT
            b.auction_number,
            any(s.store_name) AS auction_store_name,

            lowerUTF8(trim(b.email)) AS bidder_key,

            sum(b.bid_amount) AS bidder_auction_bid_amount

          FROM cms.mart_cms_bid_history_report b

          INNER JOIN auction_store s
            ON b.auction_number = s.auction_number

          WHERE b.bid_created_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )

            AND b.bid_created_at < addDays(
              toDateTime(
                concat({to:String}, ' 00:00:00'),
                'Asia/Manila'
              ),
              1
            )

            AND (
              {store:String} = ''
              OR s.store_name = {store:String}
            )

            AND b.email IS NOT NULL
            AND trim(b.email) != ''

            AND b.auction_number IS NOT NULL

          GROUP BY
            b.auction_number,
            bidder_key
        ),

        classified_auction_bidders AS (
          SELECT
            a.auction_number,
            a.auction_store_name,
            a.bidder_key,
            a.bidder_auction_bid_amount,

            if(
              f.first_ever_bid_at >= toDateTime(
                concat({from:String}, ' 00:00:00'),
                'Asia/Manila'
              )
              AND f.first_ever_bid_at < addDays(
                toDateTime(
                  concat({to:String}, ' 00:00:00'),
                  'Asia/Manila'
                ),
                1
              ),
              'New',
              'Returning'
            ) AS bidder_status

          FROM auction_bidder_activity a

          INNER JOIN bidder_first_ever_bid f
            ON a.bidder_key = f.bidder_key
        )

        SELECT
          auction_number,

          any(auction_store_name) AS auction_store_name,

          count() AS participating_bidders,

          sum(
            bidder_auction_bid_amount
          ) AS participating_bid_amount,

          countIf(
            bidder_status = 'New'
          ) AS participating_new_bidders,

          sumIf(
            bidder_auction_bid_amount,
            bidder_status = 'New'
          ) AS participating_new_bid_amount,

          countIf(
            bidder_status = 'Returning'
          ) AS participating_returning_bidders,

          sumIf(
            bidder_auction_bid_amount,
            bidder_status = 'Returning'
          ) AS participating_returning_bid_amount

        FROM classified_auction_bidders

        GROUP BY auction_number

        ORDER BY auction_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const compositionRows = await compositionResult.json();
    const auctionRows = await perAuctionResult.json();

    const composition = compositionRows[0] ?? {};

    return res.status(200).json({
      composition: {
        new_bidders: Number(
          composition.new_bidders ?? 0,
        ),

        returning_bidders: Number(
          composition.returning_bidders ?? 0,
        ),

        new_bidders_bid_amount: Number(
          composition.new_bidders_bid_amount ?? 0,
        ),

        returning_bidders_bid_amount: Number(
          composition.returning_bidders_bid_amount ?? 0,
        ),
      },

      perAuctionComposition: auctionRows.map((row) => ({
        auction_number: row.auction_number,

        store_name: row.auction_store_name,

        // ---------------------------------------------
        // PARTICIPATING BIDDERS
        // ---------------------------------------------
        participating_bidders: Number(
          row.participating_bidders ?? 0,
        ),

        participating_bid_amount: Number(
          row.participating_bid_amount ?? 0,
        ),

        participating_new_bidders: Number(
          row.participating_new_bidders ?? 0,
        ),

        participating_new_bid_amount: Number(
          row.participating_new_bid_amount ?? 0,
        ),

        participating_returning_bidders: Number(
          row.participating_returning_bidders ?? 0,
        ),

        participating_returning_bid_amount: Number(
          row.participating_returning_bid_amount ?? 0,
        ),

        // Keep these names too so the existing
        // Bidder Composition component remains compatible.
        new_bidders: Number(
          row.participating_new_bidders ?? 0,
        ),

        returning_bidders: Number(
          row.participating_returning_bidders ?? 0,
        ),

        new_bidders_bid_amount: Number(
          row.participating_new_bid_amount ?? 0,
        ),

        returning_bidders_bid_amount: Number(
          row.participating_returning_bid_amount ?? 0,
        ),
      })),
    });
  } catch (err) {
    console.error(
      "Leaderboards API error:",
      err,
    );

    return res.status(500).json({
      error: "Failed to load bidder leaderboards",

      message:
        err instanceof Error
          ? err.message
          : String(err),
    });
  }
}