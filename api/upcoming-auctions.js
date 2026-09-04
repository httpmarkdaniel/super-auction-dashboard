import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Upcoming Auctions — the broader future auction calendar, deliberately
// NOT restricted to category='Online Bidding' (that's Online Bidding's own
// definition, a separate section). Population: starting_time > now(),
// verified against real data to need no further gating — published_date
// is NULL on many legitimate upcoming auctions (excluding them would hide
// real events) and finalized_date is never set on a future auction anyway.
// Warehouse-only: no cms.hmr.ph call, no live correction — an auction that
// hasn't started has no live bidding to correct against.
//
// No GROUP BY/dedup needed: xv3.mart_auction_productivity_report was
// confirmed to be genuinely one row per auction_number (0 duplicates
// across the full table), unlike xv3.mart_auction_vendor_analysis's
// item-barcode fan-out elsewhere in this codebase.
export default async function handler(req, res) {
  try {
    const { store = "" } = req.query;

    const result = await client.query({
      query: `
        SELECT
          auction_number,
          name,
          category,
          sub_type,
          store_name,
          starting_time,
          ending_time,
          lot_count,
          published_date

        FROM xv3.mart_auction_productivity_report

        WHERE starting_time > now()
          AND (
            {store:String} = ''
            OR store_name = {store:String}
          )

        ORDER BY
          starting_time ASC,
          auction_number ASC
      `,
      query_params: { store },
      format: "JSONEachRow",
    });

    const rows = await result.json();

    // Vercel P0 usage fix (round 2): Upcoming Auctions is historical/
    // filter-driven (see useUpcomingAuctions.js — no automatic timer calls
    // this any more, only mount/store change/manual refresh; the "Starts
    // in …" countdown itself now advances client-side, see
    // UpcomingAuctionsView.jsx), and the response is a shared,
    // unauthenticated warehouse aggregate — safe to cache at the CDN.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({
      auctions: rows.map((row) => ({
        auction_number: row.auction_number,
        name: row.name,
        category: row.category,
        sub_type: row.sub_type,
        store_name: row.store_name,
        starting_time: row.starting_time,
        ending_time: row.ending_time,
        lot_count: Number(row.lot_count ?? 0),
        published_date: row.published_date ?? null,
      })),
    });
  } catch (err) {
    console.error("upcoming-auctions API error:", err);
    return res.status(500).json({
      error: "Failed to load upcoming auctions",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
