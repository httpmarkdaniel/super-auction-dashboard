import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export default async function handler(req, res) {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    const result = await client.query({
      query: `
        WITH bidder_first_bid AS (
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
            lowerUTF8(trim(email)) AS bidder_key,
            sum(bid_amount) AS bid_amount
          FROM cms.mart_cms_bid_history_report
          WHERE bid_created_at >= {from:Date}
            AND bid_created_at < addDays({to:Date}, 1)
            AND email IS NOT NULL
            AND trim(email) != ''
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
      },
      format: "JSONEachRow",
    });

    const rows = await result.json();
    const row = rows[0] ?? {};

    return res.status(200).json({
      composition: {
        new_bidders: Number(row.new_bidders ?? 0),
        returning_bidders: Number(row.returning_bidders ?? 0),
        new_bidders_bid_amount: Number(row.new_bidders_bid_amount ?? 0),
        returning_bidders_bid_amount: Number(
          row.returning_bidders_bid_amount ?? 0
        ),
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Failed to load bidder composition",
    });
  }
}