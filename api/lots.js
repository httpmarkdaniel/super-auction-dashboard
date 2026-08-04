import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition, escapeSqlString } from "./_util.js";

// Real lot rows for the Order Workbench table. Capped at 200 most-recent
// rows for the selected range (not a full paginated browse yet) — enough
// to replace the 5-row mock table with something real without querying
// unbounded row counts per request.
const STATUS_MAP = {
  Paid: "Sold",
  Released: "Sold",
  Unpaid: "For Approval",
  // Won at auction but payment hasn't cleared yet — same bucket as Unpaid,
  // not "Unsold". This is a large share of real rows (often ~half in a
  // given window), so leaving it unmapped meant most lots showed up with
  // no status color and weren't reachable from any tab except "All".
  Outstanding: "For Approval",
  Unsold: "Unsold",
  // Sale was reversed after the fact — back to effectively unsold.
  Returned: "Unsold",
  // Buyer paid, then was refunded — the sale still happened.
  Refunded: "Sold",
};

export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  const { store, category } = req.query;
  const where = buildWhere("date_created", from, to, [
    "lot_number != ''",
    storeCondition("branch", store),
    category ? `splitByString(' - ', assumeNotNull(category))[1] = '${escapeSqlString(category)}'` : null,
  ].filter(Boolean));

  try {
    // buyers_premium and commission are RATE percentages on this table (e.g.
    // 15, 18), not dollar amounts — confirmed via sold_price = bid_amount *
    // (1 + buyers_premium/100). There's no dedicated per-lot service-fee
    // column; per the business, service fee is bid_amount * commission%
    // (commission doubles as the service-fee rate here).
    const rows = await chQuery(`
      SELECT
        lot_number AS lotNumber,
        coalesce(name, '') AS item,
        vendor,
        category,
        status,
        if(sold_price > 0, toFloat64(sold_price), toFloat64(coalesce(bid_amount, 0))) AS soldPrice,
        coalesce(for_approval_status, '') AS approval,
        toFloat64(coalesce(bid_amount, 0)) AS totalBidAmount,
        toFloat64(coalesce(bid_amount, 0)) * toFloat64(coalesce(buyers_premium, 0)) / 100 AS buyersPremium,
        toFloat64(coalesce(bid_amount, 0)) * toFloat64(coalesce(commission, 0)) / 100 AS serviceFee,
        branch,
        auction_number AS auctionNumber
      FROM mart_auction_vendor_analysis
      ${where}
      ORDER BY date_created DESC
      LIMIT 200
      FORMAT JSON
    `);
    const mapped = rows.map((r) => ({ ...r, status: STATUS_MAP[r.status] ?? r.status }));
    res.status(200).json({ lots: mapped });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
