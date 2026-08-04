import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition, escapeSqlString } from "./_util.js";

// Top vendors (consignors) and top bidders by bid amount, from
// mart_auction_vendor_analysis — one row per lot, so this is a simple
// group-by rather than needing a join.
export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }
  const { store, category } = req.query;
  const categoryExtra = category
    ? [`splitByString(' - ', assumeNotNull(category))[1] = '${escapeSqlString(category)}'`]
    : [];
  const storeExtra = [storeCondition("branch", store), ...categoryExtra].filter(Boolean);

  const vendorWhere = buildWhere("date_created", from, to, ["vendor != ''", "vendor IS NOT NULL", ...storeExtra]);
  const bidderWhere = buildWhere("date_created", from, to, ["bidder_name != ''", "bidder_name IS NOT NULL", ...storeExtra]);

  // New vs returning bidders: a bidder is "new" if their earliest-ever
  // record (searched across all history, not just this window) falls
  // inside the selected range — i.e. this is the first time we've ever
  // seen them, not just the first time in an arbitrary lookback window.
  // Without a `from` bound there's no baseline to call anyone "new"
  // against, so that case just reports everyone active as returning.
  const compositionQuery = from
    ? `
      WITH active AS (
        SELECT DISTINCT bidder_name FROM mart_auction_vendor_analysis ${bidderWhere}
      ),
      fs AS (
        SELECT bidder_name, min(date_created) AS first_seen
        FROM mart_auction_vendor_analysis
        WHERE bidder_name IN (SELECT bidder_name FROM active)
        GROUP BY bidder_name
      )
      SELECT
        countIf(first_seen >= '${from} 00:00:00') AS new_bidders,
        countIf(first_seen < '${from} 00:00:00') AS returning_bidders
      FROM fs
      FORMAT JSON
    `
    : `
      SELECT 0 AS new_bidders, uniqExact(bidder_name) AS returning_bidders
      FROM mart_auction_vendor_analysis
      ${bidderWhere}
      FORMAT JSON
    `;

  const trendQuery = from
    ? `
      WITH active AS (
        SELECT DISTINCT bidder_name FROM mart_auction_vendor_analysis ${bidderWhere}
      ),
      fs AS (
        SELECT bidder_name, min(date_created) AS first_seen
        FROM mart_auction_vendor_analysis
        WHERE bidder_name IN (SELECT bidder_name FROM active)
        GROUP BY bidder_name
      )
      SELECT toDate(first_seen) AS day, count() AS new_bidders
      FROM fs
      WHERE first_seen >= '${from} 00:00:00'
      GROUP BY day ORDER BY day
      FORMAT JSON
    `
    : null;

  try {
    const [vendors, bidders, compositionRows, trendRows] = await Promise.all([
      chQuery(`
        SELECT vendor, sum(bid_amount) AS bid_amount, count(*) AS lots
        FROM mart_auction_vendor_analysis
        ${vendorWhere}
        GROUP BY vendor
        ORDER BY bid_amount DESC
        LIMIT 5
        FORMAT JSON
      `),
      chQuery(`
        SELECT bidder_name, sum(bid_amount) AS bid_amount, count(*) AS wins
        FROM mart_auction_vendor_analysis
        ${bidderWhere}
        GROUP BY bidder_name
        ORDER BY bid_amount DESC
        LIMIT 5
        FORMAT JSON
      `),
      chQuery(compositionQuery),
      trendQuery ? chQuery(trendQuery) : Promise.resolve([]),
    ]);
    res.status(200).json({
      vendors,
      bidders,
      composition: compositionRows[0] ?? {},
      newBidderTrend: trendRows,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
