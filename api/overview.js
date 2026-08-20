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
        SELECT
          sum(total_bid_amount) AS total_bid_amount
        FROM xv3.mart_auction_productivity_report
        WHERE starting_time >= {from:Date}
          AND starting_time < addDays({to:Date}, 1)
          AND (
            {store:String} = ''
            OR store_name = {store:String}
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