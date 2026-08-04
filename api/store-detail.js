import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition } from "./_util.js";

// Single-store KPIs + top vendors for the Stores tab — same shape of query
// as /api/overview and /api/leaderboards, just always scoped to one store
// (required, not optional, since "all stores" doesn't make sense here).
export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }
  const { store } = req.query;
  if (!store) return res.status(400).json({ error: "store is required" });

  const productivityWhere = buildWhere("starting_time", from, to, [storeCondition("store_name", store)].filter(Boolean));
  const vendorWhere = buildWhere("date_created", from, to, [
    storeCondition("branch", store),
    "vendor != ''",
    "vendor IS NOT NULL",
  ].filter(Boolean));
  try {
    const [productivityRows, auctionRows, vendorRows, sellThroughRows] = await Promise.all([
      chQuery(`
        SELECT
          COUNT(DISTINCT auction_id) AS total_auctions,
          SUM(lot_count) AS total_lots,
          SUM(paid_count) AS total_paid,
          SUM(total_bid_amount) AS total_bid_amount,
          sumIf(lot_count, ending_time <= now()) AS ended_lots_listed
        FROM mart_auction_productivity_report
        ${productivityWhere}
        FORMAT JSON
      `),
      chQuery(`
        SELECT auction_number, total_bid_amount
        FROM mart_auction_productivity_report
        ${productivityWhere}
        FORMAT JSON
      `),
      chQuery(`
        SELECT vendor, sum(bid_amount) AS bid_amount, count(*) AS lots
        FROM mart_auction_vendor_analysis
        ${vendorWhere}
        GROUP BY vendor
        ORDER BY bid_amount DESC
        LIMIT 5
        FORMAT JSON
      `),
      // Sell-through, done right — see overview.js's identical comment.
      // Scoped to auctions that have actually ended, and counts anything
      // past "Unsold" (Outstanding/Released/Paid) as sold.
      chQuery(`
        SELECT countIf(status IN ('Outstanding', 'Released', 'Paid')) AS ended_lots_sold
        FROM mart_auction_vendor_analysis
        WHERE auction_number IN (
          SELECT auction_number FROM mart_auction_productivity_report
          ${buildWhere("starting_time", from, to, [storeCondition("store_name", store), "ending_time <= now()"].filter(Boolean))}
        )
        FORMAT JSON
      `),
    ]);

    // See overview.js — total_bid_amount is ClickHouse's own snapshot, which
    // can be stale or unpopulated for any auction regardless of live status;
    // `auctions` lets the frontend correct it against cms.hmr.ph after this
    // fast response has already rendered, rather than blocking on it here.
    res.status(200).json({
      ...(productivityRows[0] ?? {}),
      ...(sellThroughRows[0] ?? {}),
      topVendors: vendorRows,
      auctions: auctionRows,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
