import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition, escapeSqlString } from "./_util.js";

// Vendor payables backlog: amounts still owed to vendors, from
// mart_auction_payables. "Remitted"/"Released" = already paid out;
// "On Process"/"Available" = still outstanding (the backlog).
// Deliberately NOT scoped to the date-range picker — this is a running
// balance (a stock, not a per-period flow), so filtering generate_date to
// e.g. "last 30 days" would make the 31-60/60+ aging buckets impossible
// by construction. from/to are accepted but only apply if explicitly
// passed; the frontend calls this without them.
export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  const { store, category } = req.query;
  const where = buildWhere(
    "generate_date",
    from,
    to,
    ["payment_status IN ('On Process', 'Available')", storeCondition("store_name", store)].filter(Boolean),
    { dateOnly: true }
  );

  // mart_auction_payables has no item-category column — bridged via
  // (auction_number, lot_number), the same keys vendor_analysis uses.
  const categoryJoin = category
    ? `
      INNER JOIN (
        SELECT DISTINCT auction_number, lot_number FROM mart_auction_vendor_analysis
        WHERE splitByString(' - ', assumeNotNull(category))[1] = '${escapeSqlString(category)}'
      ) c ON p.auction_number = c.auction_number AND p.lot_number = c.lot_number
    `
    : "";

  try {
    // mart_auction_payables has one row per line-item, but payable_amount/
    // generate_date/payment_status are voucher-level values fanned out onto
    // every item row on that voucher (avg ~143 rows/voucher). Summing
    // payable_amount directly over-counts each voucher by its item count.
    // Dedupe to one row per payable_id first, then aggregate.
    const rows = await chQuery(`
      SELECT
        sum(payable_amount) AS total_backlog,
        sumIf(payable_amount, dateDiff('day', generate_date, today()) <= 30) AS aged_0_30,
        sumIf(payable_amount, dateDiff('day', generate_date, today()) > 30 AND dateDiff('day', generate_date, today()) <= 60) AS aged_31_60,
        sumIf(payable_amount, dateDiff('day', generate_date, today()) > 60) AS aged_60_plus
      FROM (
        SELECT
          payable_id,
          any(payable_amount) AS payable_amount,
          any(generate_date) AS generate_date,
          any(auction_number) AS auction_number,
          any(lot_number) AS lot_number
        FROM mart_auction_payables
        ${where}
        GROUP BY payable_id
      ) p
      ${categoryJoin}
      FORMAT JSON
    `);
    res.status(200).json(rows[0] ?? {});
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
