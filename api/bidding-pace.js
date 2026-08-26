import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// =========================================================
// BIDDING PACE — hourly bid ACTIVITY (every real bid event from
// cms.mart_cms_bid_history_report, regardless of settlement status),
// Asia/Manila hour-of-day. Deliberately NOT Total Bid Amount and never
// forced to reconcile with it — this is the same "activity" concept
// already established for Vendor Payables' Participating Bidders and
// Full Auction Detail's Participating card.
//
// This is an ISOLATED DUPLICATE of api/overview.js's own hourlyResult
// query (same tables, same joins, same date/store scoping, same
// toHour(bid_created_at, 'Asia/Manila') timezone handling — bid_created_at
// is stored in server-local UTC, confirmed empirically there) — not a
// second methodology. api/overview.js is a large, multi-purpose endpoint;
// calling its full default response just to read one `hourly` field would
// be wasteful, so this tab gets its own small, fast endpoint instead,
// matching every other "wire to real data" tab this session (Vendor
// Payables, Full Auction Detail, Revenue Breakdown all did the same).
//
// No category filter/join here (Bidding Pace has no category selector —
// see useBiddingPace.js's header comment) — the original query's category
// clause is a no-op when category is always '', so omitting the join
// entirely produces byte-identical results to calling Overview with no
// category selected, just lighter.
//
// The Participating/Winning bidder breakdown is NOT computed here — see
// useBiddingPace.js, which reuses /api/leaderboards's already-real global
// `composition` (winning) and `bidding_activity_composition`
// (participating) fields unmodified, rather than duplicating any bidder
// identity logic in a third place.
// =========================================================

export default async function handler(req, res) {
  try {
    const { from, to, store = "" } = req.query;
    const queryParams = { from, to, store };

    const result = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        )

        SELECT
          toHour(b.bid_created_at, 'Asia/Manila') AS hour,
          sum(ifNull(b.bid_amount, 0)) AS bid_amount

        FROM cms.mart_cms_bid_history_report b

        INNER JOIN auction_store s
          ON b.auction_number = s.auction_number

        WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)

          AND (
            {store:String} = ''
            OR s.store_name = {store:String}
          )

        GROUP BY hour
        ORDER BY hour
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const rows = await result.json();

    return res.status(200).json({
      hourly: rows.map((row) => ({
        hour: Number(row.hour),
        bid_amount: Number(row.bid_amount ?? 0),
      })),
    });
  } catch (err) {
    console.error("Bidding pace API error:", err);

    return res.status(500).json({
      error: "Failed to load bidding pace",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
