import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition, escapeSqlString } from "./_util.js";

// Category-drill-down KPIs for CategoryView — mart_auction_productivity_
// report is auction-level with no item-category dimension, so this whole
// branch works from mart_auction_vendor_analysis instead (the only table
// that carries item category), rather than trying to retrofit the regular
// (auction-level) query above.
async function fetchCategoryOverview(category, from, to, store) {
  const topCategory = `splitByString(' - ', assumeNotNull(category))[1]`;
  const categoryMatch = `${topCategory} = '${escapeSqlString(category)}'`;
  const vendorWhere = buildWhere("date_created", from, to, [
    categoryMatch,
    storeCondition("branch", store),
  ].filter(Boolean));

  const endedAuctionsSubquery = `
    SELECT auction_number FROM mart_auction_productivity_report
    ${buildWhere("starting_time", from, to, [storeCondition("store_name", store), "ending_time <= now()"].filter(Boolean))}
  `;

  const [statsRows, endedRows, reserveRows, hourlyRows] = await Promise.all([
    chQuery(`
      SELECT
        uniqExact(auction_number) AS total_auctions,
        count() AS total_lots,
        sum(bid_amount) AS total_bid_amount,
        sum(bid_amount * buyers_premium / 100) AS buyers_premium_amount,
        sum(bid_amount * commission / 100) AS service_fee_amount,
        avg(buyers_premium) AS avg_buyers_premium_pct,
        avg(commission) AS avg_commission_pct,
        countIf(status = 'Unsold') AS unsold_count,
        sumIf(reserved_price, status = 'Unsold') AS unsold_value
      FROM mart_auction_vendor_analysis
      ${vendorWhere}
      FORMAT JSON
    `),
    // Sell-through, same definition as the main Overview endpoint: scoped
    // to ended auctions, anything past "Unsold" counts as sold.
    chQuery(`
      SELECT
        count() AS ended_lots_listed,
        countIf(status IN ('Outstanding', 'Released', 'Paid')) AS ended_lots_sold
      FROM mart_auction_vendor_analysis
      WHERE ${categoryMatch} AND auction_number IN (${endedAuctionsSubquery})
      FORMAT JSON
    `),
    // Reserve performance, only for lots with a real reserve set (same fix
    // as the Overview page — reserved_price is 0/unset for ~95% of lots).
    chQuery(`
      SELECT
        countIf(bid_amount <= reserved_price) AS sold_at_or_below,
        countIf(bid_amount > reserved_price) AS sold_above,
        avg((bid_amount - reserved_price) / reserved_price * 100) AS avg_premium_over_reserve_pct
      FROM mart_auction_vendor_analysis
      ${buildWhere("date_created", from, to, [
        categoryMatch,
        "bid_amount > 0",
        "reserved_price > 0",
        storeCondition("branch", store),
      ].filter(Boolean))}
      FORMAT JSON
    `),
    chQuery(`
      SELECT toHour(date_created) AS hour, sum(bid_amount) AS bid_amount
      FROM mart_auction_vendor_analysis
      ${vendorWhere}
      GROUP BY hour
      ORDER BY hour
      FORMAT JSON
    `),
  ]);

  return {
    ...(statsRows[0] ?? {}),
    ...(endedRows[0] ?? {}),
    ...(reserveRows[0] ?? {}),
    hourly: hourlyRows,
  };
}

// Aggregate KPI numbers for the Overview page, sourced from
// mart_auction_productivity_report (already pre-aggregated per auction, so
// this is a cheap SUM/COUNT rather than a row-level scan). `from`/`to` are
// optional YYYY-MM-DD query params — omit both for an all-time total.
export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }
  const { store, category } = req.query;

  if (category) {
    try {
      return res.status(200).json(await fetchCategoryOverview(category, from, to, store));
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  const productivityWhere = buildWhere(
    "starting_time",
    from,
    to,
    [storeCondition("store_name", store)].filter(Boolean)
  );

  // Lot status comes straight from the `status` column (Unsold / Unpaid /
  // Paid / Released / Returned / Refunded / Outstanding) — far more
  // reliable than inferring from bid_amount/sold_price, which go NULL
  // (not 0) for unsold lots. Scoped on date_created since end_date/
  // start_date are NULL for a large share of rows (including ~66% of
  // "Released" rows) while date_created is never null. vendor_analysis
  // calls the same field `branch` rather than `store_name`.
  const vendorWhere = buildWhere(
    "date_created",
    from,
    to,
    [storeCondition("branch", store)].filter(Boolean)
  );

  // Unsold-inventory age is a snapshot of current stock, not a per-period
  // flow — deliberately NOT scoped to date_created/from/to (a lot listed
  // in 2024 and still unsold today is exactly what we want to catch here,
  // and it would be excluded if we filtered by date_created like the rest
  // of this endpoint does). Store filter still applies.
  const storeOnly = storeCondition("branch", store);
  const agingWhere = storeOnly ? `WHERE ${storeOnly}` : "";

  // Branch/store comparison for the "By Branch" card — always company-wide
  // regardless of the store filter (that's what StoreView is for), folded
  // into this endpoint rather than its own route to stay under Vercel's
  // 12-serverless-function cap on the Hobby plan.
  const branchWhere = buildWhere("date_created", from, to, ["branch != ''", "branch IS NOT NULL"]);

  try {
    const [productivityRows, auctionRows, lotStatusRows, agingRows, sellThroughRows, branchRows, hourlyRows] = await Promise.all([
      chQuery(`
        SELECT
          COUNT(DISTINCT auction_id) AS total_auctions,
          SUM(lot_count) AS total_lots,
          SUM(paid_count) AS total_paid,
          SUM(total_bid_amount) AS total_bid_amount,
          SUM(total_buyers_premium) AS total_buyers_premium,
          SUM(total_service_fee) AS total_service_fee,
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
        SELECT
          countIf(status IN ('Unpaid', 'Outstanding')) AS pending_payment_count,
          sumIf(bid_amount, status IN ('Unpaid', 'Outstanding')) AS pending_payment_value,
          countIf(status IN ('Paid', 'Released')) AS vendor_paid_count,
          sum(commission) AS total_commission
        FROM mart_auction_vendor_analysis
        ${vendorWhere}
        FORMAT JSON
      `),
      // Unsold count/value/aging are all the same "current stock" snapshot
      // (see agingWhere's comment) — kept in one query so the card built
      // from these numbers is always internally consistent regardless of
      // the date-range picker, instead of pairing a date-scoped count with
      // a never-date-scoped aging breakdown.
      chQuery(`
        SELECT
          countIf(status = 'Unsold') AS unsold_count,
          sumIf(reserved_price, status = 'Unsold') AS unsold_value,
          count() AS total_inventory,
          avgIf(dateDiff('day', date_created, now()), status = 'Unsold') AS unsold_avg_age_days,
          countIf(status = 'Unsold' AND dateDiff('day', date_created, now()) <= 30) AS unsold_fresh,
          countIf(status = 'Unsold' AND dateDiff('day', date_created, now()) > 30 AND dateDiff('day', date_created, now()) <= 90) AS unsold_aging,
          countIf(status = 'Unsold' AND dateDiff('day', date_created, now()) > 90) AS unsold_stale
        FROM mart_auction_vendor_analysis
        ${agingWhere}
        FORMAT JSON
      `),
      // Sell-through, done right: "Unsold" is also what a lot shows while its
      // auction is simply still running (no winner decided yet), and a lot
      // that's won but not yet paid shows "Outstanding" rather than "Unsold"
      // — neither should count against sell-through. So this scopes to lots
      // whose auction has actually ended, and counts anything past the
      // "Unsold" stage (Outstanding/Released/Paid) as sold, not just Paid.
      chQuery(`
        SELECT countIf(status IN ('Outstanding', 'Released', 'Paid')) AS ended_lots_sold
        FROM mart_auction_vendor_analysis
        WHERE auction_number IN (
          SELECT auction_number FROM mart_auction_productivity_report
          ${buildWhere("starting_time", from, to, [storeCondition("store_name", store), "ending_time <= now()"].filter(Boolean))}
        )
        FORMAT JSON
      `),
      chQuery(`
        SELECT branch, sum(bid_amount) AS bid_amount
        FROM mart_auction_vendor_analysis
        ${branchWhere}
        GROUP BY branch
        ORDER BY bid_amount DESC
        FORMAT JSON
      `),
      // Pace by hour-of-day, summed across every day in the selected range
      // (not literally "today" — the card label reflects whatever range is
      // picked, same as the rest of this page).
      chQuery(`
        SELECT toHour(date_created) AS hour, sum(bid_amount) AS bid_amount
        FROM mart_auction_vendor_analysis
        ${vendorWhere}
        GROUP BY hour
        ORDER BY hour
        FORMAT JSON
      `),
    ]);

    // total_bid_amount here is ClickHouse's own periodic snapshot, which can
    // be stale or simply never populated for a given auction regardless of
    // whether it's still open — cms.hmr.ph answers for ended auctions too
    // (confirmed directly), so every auction in scope gets a shot at being
    // corrected, not just ones ClickHouse currently calls "live". Correction
    // itself happens client-side *after* this fast response has already
    // rendered, rather than this endpoint blocking on cms.hmr.ph itself (it
    // hangs/500s often enough that doing so held up the whole page behind it).
    res.status(200).json({
      ...(productivityRows[0] ?? {}),
      ...(lotStatusRows[0] ?? {}),
      ...(agingRows[0] ?? {}),
      ...(sellThroughRows[0] ?? {}),
      auctions: auctionRows,
      branches: branchRows,
      hourly: hourlyRows,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
