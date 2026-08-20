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

    const result = await client.query({
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

      query_params: {
        from,
        to,
        store,
      },

      format: "JSONEachRow",
    });

    const rows = await result.json();
    const row = rows[0] ?? {};

    return res.status(200).json({
      total_bid_amount: Number(row.total_bid_amount ?? 0),
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Failed to load overview",
    });
  }
}