import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition } from "./_util.js";

// Below/at/above reserve breakdown for lots that actually received a bid
// (bid_amount > 0 excludes the Unsold ones, where bid_amount is NULL) AND
// actually have a real reserve set (reserved_price > 0) — it's 0/unset for
// ~95% of lots, and counting those as trivially "above" a reserve of 0
// isn't a real reserve comparison, just an artifact of missing data.
export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }
  const { store } = req.query;

  const where = buildWhere("date_created", from, to, [
    "bid_amount > 0",
    "reserved_price > 0",
    storeCondition("branch", store),
  ].filter(Boolean));

  try {
    const rows = await chQuery(`
      SELECT
        countIf(bid_amount < reserved_price) AS below_count,
        sumIf(bid_amount, bid_amount < reserved_price) AS below_value,
        countIf(bid_amount = reserved_price) AS at_count,
        sumIf(bid_amount, bid_amount = reserved_price) AS at_value,
        countIf(bid_amount > reserved_price) AS above_count,
        sumIf(bid_amount, bid_amount > reserved_price) AS above_value
      FROM mart_auction_vendor_analysis
      ${where}
      FORMAT JSON
    `);
    res.status(200).json(rows[0] ?? {});
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
