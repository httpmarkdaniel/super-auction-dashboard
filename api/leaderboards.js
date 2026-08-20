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

          WHERE b.bid_created_at >= {from:Date}
            AND b.bid_created_at < addDays({to:Date}, 1)

            AND (
              {store:String} = ''
              OR s.store_name = {store:String}
            )

            AND b.email IS NOT NULL
            AND trim(b.email) != ''

          GROUP BY bidder_key
        )

        SELECT
          countIf(f.first_bid_at >= {from:Date}) AS new_bidders,
          countIf(f.first_bid_at < {from:Date}) AS returning_bidders,

          sumIf(
            p.bid_amount,
            f.first_bid_at >= {from:Date}
          ) AS new_bidders_bid_amount,

          sumIf(
            p.bid_amount,
            f.first_bid_at < {from:Date}
          ) AS returning_bidders_bid_amount

        FROM period_bidders p

        INNER JOIN bidder_first_bid f
          ON p.bidder_key = f.bidder_key
      `,
      query_params: {
        from,
        to,
        store,
      },
      format: "JSONEachRow",
    });

    const perAuctionResult = await client.query({
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

        period_bidder_auction AS (
          SELECT
            b.auction_number,
            s.store_name,
            lowerUTF8(trim(b.email)) AS bidder_key,
            min(b.bid_created_at) AS first_bid_in_auction,
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

            AND b.email IS NOT NULL
            AND trim(b.email) != ''
            AND b.auction_number IS NOT NULL

          GROUP BY
            b.auction_number,
            s.store_name,
            bidder_key
        )

        SELECT
          p.auction_number,
          p.store_name,

          countIf(
            f.first_bid_at = p.first_bid_in_auction
          ) AS new_bidders,

          countIf(
            f.first_bid_at < p.first_bid_in_auction
          ) AS returning_bidders,

          sumIf(
            p.bid_amount,
            f.first_bid_at = p.first_bid_in_auction
          ) AS new_bidders_bid_amount,

          sumIf(
            p.bid_amount,
            f.first_bid_at < p.first_bid_in_auction
          ) AS returning_bidders_bid_amount

        FROM period_bidder_auction p

        INNER JOIN bidder_first_bid f
          ON p.bidder_key = f.bidder_key

        GROUP BY
          p.auction_number,
          p.store_name

        ORDER BY p.auction_number
      `,
      query_params: {
        from,
        to,
        store,
      },
      format: "JSONEachRow",
    });

    const compositionRows = await compositionResult.json();
    const auctionRows = await perAuctionResult.json();

    const composition = compositionRows[0] ?? {};

    return res.status(200).json({
      composition: {
        new_bidders: Number(composition.new_bidders ?? 0),
        returning_bidders: Number(composition.returning_bidders ?? 0),
        new_bidders_bid_amount: Number(
          composition.new_bidders_bid_amount ?? 0
        ),
        returning_bidders_bid_amount: Number(
          composition.returning_bidders_bid_amount ?? 0
        ),
      },

      perAuctionComposition: auctionRows.map((row) => ({
        auction_number: row.auction_number,
        store_name: row.store_name,
        new_bidders: Number(row.new_bidders ?? 0),
        returning_bidders: Number(row.returning_bidders ?? 0),
        new_bidders_bid_amount: Number(
          row.new_bidders_bid_amount ?? 0
        ),
        returning_bidders_bid_amount: Number(
          row.returning_bidders_bid_amount ?? 0
        ),
      })),
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Failed to load bidder leaderboards",
    });
  }
}