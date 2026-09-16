import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions.
// api/hrh-sales-analytics.js dispatches here on `?report=barcodeAnalytics`.
// Consumed by Orders & Fulfillment's "Warehouse Operations" sub-tab (see
// src/hrh-online/pages/OrdersFulfillment.jsx) — this used to be its own
// standalone "Barcode Analytics" sidebar page, moved in since it's the
// same warehouse-ops data as the rest of that page, just a different
// angle (picker/QC/dispatch timing instead of order-level completion).
// The report name (`barcodeAnalytics`) is kept as-is to avoid an
// unrelated rename of this file/dispatch key.
//
// REBUILT on xv3.mart_order_fulfilment_journey (real warehouse-ops
// timestamps: picker, QC station, pick/pack/dispatch durations) —
// replaces the old xv3.mart_level_of_inventory-based version (barcoded/
// posted/sold funnel). No store_name/sales_channel column exists on this
// table at all, but freshly re-verified (not just inherited from the old
// Orders & Fulfillment comment) that it's exclusively HRH Online's own
// fulfillment operations across all 3 channels:
//   - The 6-digit order_ids (HMRPH Online's own website orders) match
//     xv3.mart_xv3_order_report.order_number at 100% (1,532 of 1,532,
//     zero exceptions) — that table is itself already established
//     elsewhere as HMRPH Online-only.
//   - The 18-digit order_ids (TikTok/Shopee's own external order-ID
//     format, which never populate order_report) can't be checked that
//     way, but their staging_location is the SAME physical warehouse
//     code as the confirmed HRH Online orders — "HMR01-Dispatch-HMR-01"
//     (a Shopee-courier subset shows "HMR01-Dispatch-SPX-01", SPX =
//     Shopee Xpress) — i.e. picked/packed/dispatched out of the exact
//     same facility, not a different store or branch.
// So no store filter is needed or possible. Respects the page's Date
// Range filter via order_placed_at; ignores the Channel filter (no
// channel dimension exists here).
//
// "Pick Rate" / picking_status from xv3.mart_xv3_order_pickability is
// still intentionally excluded (see Orders & Fulfillment's methodology
// note — HMR MART runs its own WMS, that field isn't meaningful). Picker
// performance and QC throughput here are a DIFFERENT, real signal: named
// pickers/QC stations with real timestamped durations, not that flag.
//
// Also returns `lifecycleFunnel` (ASN -> Barcoded -> Posted -> Sold, on
// xv3.mart_level_of_inventory + cms.mart_cms_posted_inventory_report +
// xv3.mart_net_sales) — see computeLifecycleFunnel()'s own comment below
// for the validation this was built on.
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function manilaTodayISODate() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function mondayOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
function firstOfMonthISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { from, to };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  // Full prior calendar week/month/year — NOT "to date" (see the shared
  // preset added to src/hrh-online/dateRange.js): Previous Week is
  // Monday-Sunday of the week before this one; Previous Month is the 1st
  // through the last day of the month before this one; Previous Year is
  // Jan 1 - Dec 31 of last year.
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  }
  if (range === "prevMonth") {
    const lastDayPrevMonth = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(lastDayPrevMonth), to: lastDayPrevMonth };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today }; // wtd (default)
}

// "Compare to" — same Day/Week/Month comparison-window logic as
// api/_hrh-customer-analytics.js's resolveComparisonWindow, duplicated
// per this codebase's convention (each api/hrh-*.js file keeps its own
// small self-contained date helpers).
function daysInMonth(year, month1Based) {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}
function shiftMonthsClampedISO(iso, deltaMonths) {
  const [y, m, d] = iso.split("-").map(Number);
  const total0 = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total0 / 12);
  const nm1 = (((total0 % 12) + 12) % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm1));
  return `${ny}-${String(nm1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}
function resolveComparisonWindow(current, compareTo) {
  const { from, to } = current;
  if (compareTo === "day") return { from: addDaysISO(from, -1), to: addDaysISO(to, -1) };
  if (compareTo === "month") return { from: shiftMonthsClampedISO(from, -1), to: shiftMonthsClampedISO(to, -1) };
  return { from: addDaysISO(from, -7), to: addDaysISO(to, -7) }; // "week" (default)
}
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const DIST_BUCKETS = [
  { label: "≤1h", where: "hrs <= 1" },
  { label: "1-6h", where: "hrs > 1 AND hrs <= 6" },
  { label: "6-24h", where: "hrs > 6 AND hrs <= 24" },
  { label: "24-48h", where: "hrs > 24 AND hrs <= 48" },
  { label: "48h+", where: "hrs > 48" },
];

// ============================================================================
// INVENTORY LIFECYCLE FUNNEL — ASN → Barcoded → Posted → Sold
// ============================================================================
// Additive to this file only; does not touch the pick/QC/dispatch KPIs above.
// Grain: ONE ROW = ONE PHYSICAL BARCODED UNIT in xv3.mart_level_of_inventory
// (store_name = 'HRH ONLINE'). item_qty on that table is a live on-hand
// counter (drops to 0 once sold), not an ASN/received quantity — so it is
// NOT used for the funnel's quantities; unit counts (rows) are used instead,
// which is the same thing at this grain (1 barcode = 1 unit).
//
// Validated before writing this (read-only queries against production
// ClickHouse, not assumed):
//
// 1. PUT-AWAY IS OMITTED. The only candidate with anything resembling
//    location/allocation semantics is xv3.store_allocations (po_id, store_id,
//    store_allocation_status, store_allocation_total_barcoded). Tested
//    directly against HRH Online (store_id = '160'):
//      - Of 1,407 distinct POs allocated to store 160, only 182 (13%) even
//        resolve to a po_number that appears in mart_level_of_inventory's
//        HRH ONLINE population (via store_allocations.po_id ->
//        mart_po_summary.po_id -> po_number — po_id is NOT the same value
//        space as mart_level_of_inventory.po_number, so a direct join would
//        have silently returned zero rows).
//      - Of those 182, allocation happened AFTER the item's barcode was
//        already created 106 times (58%) and BEFORE only 34 times (19%) —
//        i.e. no consistent ASN->Barcode->Putaway sequence.
//      - store_allocation_total_barcoded (the only quantity field on that
//        table) was nonzero in just 4 of 6,103 HRH Online allocation rows.
//    This does not behave like a real, populated put-away step for HRH
//    Online — it is omitted rather than forced/fabricated.
//
// 2. "POSTED" DOES NOT MEAN cms_hmrph_posting_quantity. That field
//    (on mart_level_of_inventory) was checked against actual sales: 2,481 of
//    3,064 HRH Online items with real sales history (81%) show
//    cms_hmrph_posting_quantity = 0, which is not plausible for something
//    that means "listed for sale". The real source is a separate table,
//    cms.mart_cms_posted_inventory_report — a genuine CMS listing record
//    with status ('Published'/'Unpublished'), published_date and
//    unpublished_date. Its `sku` column matches mart_level_of_inventory's
//    `barcode` at 100% (8,716/8,716 distinct HRH ONLINE skus found), so
//    barcode is used as the join key for this specific relationship only —
//    it was proven, not assumed. `sku` does NOT match product_id or UPC
//    (0% overlap on both), so this is barcode-specific, not "join everything
//    on barcode."
//
// 3. ASN AND BARCODED ARE THE SAME POPULATION, BY CONSTRUCTION. There is no
//    mart/table capturing items received-but-not-yet-barcoded — a row only
//    exists in mart_level_of_inventory once it has a barcode. So "ASN Qty"
//    (date_received in range) and "Barcoded Qty" (created_time in range,
//    same rows) will normally read ~100% conversion. That is reported below
//    as-is rather than hidden, with an explicit note that it is not a real
//    operational signal — just a receipt-to-barcode timestamp gap where one
//    exists (po_created_at precedes created_time in 12,169/12,169 = 100% of
//    rows checked; date_received precedes created_time in 8,630/12,169 =
//    71%, the remainder being same-day receiving+barcoding).
//
// 4. SOLD uses the already-validated xv3.mart_net_sales relationship
//    (`ct.item_id` = mart_level_of_inventory.product_id, store_name = 'HRH
//    ONLINE', net_sales_amount > 0) — the same join Inventory Aging already
//    uses, reused here rather than re-derived.
//
// Cohort semantics (not same-period event counts): the cohort is the set of
// units whose date_received falls in the selected range. Posted/Sold are
// then answered as "has this unit EVER been posted / sold as of now" (cohort
// progress-to-date), not "was it posted/sold in that same date window" —
// items received near the end of a period legitimately have not had time to
// sell yet, so a same-window Sold count would understate true conversion.
async function computeLifecycleFunnel(from, to) {
  const HRH_STORE = "HRH ONLINE";

  // These 3 queries are fully independent of each other (cohort is scoped
  // by date_received, posted/sold are scoped by store only, with no
  // dependency on cohort's own results) — run concurrently instead of one
  // round-trip at a time.
  const [cohortRows, postedRows, soldRows] = await Promise.all([
    client
      .query({
        query: `
          SELECT barcode, toString(product_id) AS product_id, date_received, created_time
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
            AND date_received IS NOT NULL
            AND toDate(date_received) BETWEEN {from:String} AND {to:String}
        `,
        query_params: { store: HRH_STORE, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    client
      .query({
        query: `
          SELECT sku, min(published_date) AS first_published
          FROM cms.mart_cms_posted_inventory_report
          WHERE store_name = {store:String} AND published_date IS NOT NULL
          GROUP BY sku
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    client
      .query({
        query: `
          SELECT \`ct.item_id\` AS product_id, min(transaction_date) AS first_sale
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND net_sales_amount > 0 AND \`ct.item_id\` IS NOT NULL
          GROUP BY product_id
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);
  const postedMap = new Map(postedRows.map((r) => [r.sku, r.first_published]));
  const soldMap = new Map(soldRows.map((r) => [String(r.product_id), r.first_sale]));

  const asnQty = cohortRows.length;
  let barcodedQty = 0;
  let postedQty = 0;
  let soldQty = 0;
  let soldNotPosted = 0;

  let receivedToBarcodedHoursSum = 0;
  let receivedToBarcodedHoursN = 0;
  let barcodedToPostedDaysSum = 0;
  let barcodedToPostedDaysN = 0;
  let postedToSoldDaysSum = 0;
  let postedToSoldDaysN = 0;

  for (const r of cohortRows) {
    const isBarcoded = !!r.created_time; // always true in practice — see note above
    if (isBarcoded) barcodedQty++;

    const firstPublished = postedMap.get(r.barcode);
    const isPosted = !!firstPublished;
    if (isPosted) postedQty++;

    const firstSale = soldMap.get(r.product_id);
    const isSold = !!firstSale;
    if (isSold) soldQty++;
    if (isSold && !isPosted) soldNotPosted++;

    if (r.date_received && r.created_time) {
      const hrs = (new Date(r.created_time) - new Date(r.date_received)) / 3600000;
      if (hrs >= 0) {
        receivedToBarcodedHoursSum += hrs;
        receivedToBarcodedHoursN++;
      }
    }
    if (isPosted && r.created_time) {
      const days = (new Date(firstPublished) - new Date(r.created_time)) / 86400000;
      if (days >= 0) {
        barcodedToPostedDaysSum += days;
        barcodedToPostedDaysN++;
      }
    }
    if (isPosted && isSold) {
      const days = (new Date(firstSale) - new Date(firstPublished)) / 86400000;
      if (days >= 0) {
        postedToSoldDaysSum += days;
        postedToSoldDaysN++;
      }
    }
  }

  // *100 — every other percentage this codebase sends the frontend
  // (completionRate, cancellationRate, returnRateByCount, sharePct, ...in
  // api/_hrh-orders-fulfillment.js) is pre-multiplied server-side, since
  // formatPct() just appends "%" to whatever number it's given rather than
  // multiplying by 100 itself. This was missed here originally, which
  // rendered a true 100% conversion as "1.0%".
  const safeDiv = (a, b) => (b > 0 ? (a / b) * 100 : null);

  return {
    grain: "1 row = 1 barcoded unit (xv3.mart_level_of_inventory, store_name = 'HRH ONLINE')",
    cohort: { from, to, basis: "date_received (ASN) within range; Posted/Sold measured as-of-now for this cohort" },
    stages: [
      { key: "asn", label: "ASN (Received)", qty: asnQty },
      { key: "barcoded", label: "Barcoded", qty: barcodedQty, conversionFromPrev: safeDiv(barcodedQty, asnQty) },
      { key: "posted", label: "Posted (Listed for Sale)", qty: postedQty, conversionFromPrev: safeDiv(postedQty, barcodedQty) },
      { key: "sold", label: "Sold", qty: soldQty, conversionFromPrev: safeDiv(soldQty, postedQty) },
    ],
    cycleTimeDays: {
      receivedToBarcodedHours: receivedToBarcodedHoursN > 0 ? receivedToBarcodedHoursSum / receivedToBarcodedHoursN : null,
      barcodedToPostedDays: barcodedToPostedDaysN > 0 ? barcodedToPostedDaysSum / barcodedToPostedDaysN : null,
      postedToFirstSaleDays: postedToSoldDaysN > 0 ? postedToSoldDaysSum / postedToSoldDaysN : null,
    },
    unmatched: {
      soldButNeverPosted: soldNotPosted,
    },
    dataQuality: [
      "Put-away is omitted: xv3.store_allocations (the only location/allocation table found) only resolves to 13% of this cohort's POs for HRH Online, and its timing does not consistently precede barcoding — it does not behave like a real, populated put-away step here.",
      "ASN and Barcoded are the same underlying record: mart_level_of_inventory only contains items that already have a barcode, so there is no way to see received-but-not-yet-barcoded stock. Their near-100% conversion reflects that, not a bottleneck-free process.",
      "\"Posted\" uses cms.mart_cms_posted_inventory_report (status/published_date), not cms_hmrph_posting_quantity on mart_level_of_inventory — that field was checked against real sales and did not hold up (81% of items with confirmed sales show it at 0).",
      "Posted/Sold are cohort-to-date (has it ever happened, as of now), not same-window counts — items received near the end of the selected range have not had time to sell yet.",
      "cms.mart_cms_posted_inventory_report only has data from 2026-02-25 onward, so items received before that date can't show a posting record even if they really were posted. That alone doesn't explain the full gap, though — e.g. of items received in April 2026 (well inside the covered window) that went on to sell, 840 of 972 (86%) still have no matching posting record. \"Sold but never posted\" below is likely undercounted CMS posting capture, not proof those items were sold unlisted.",
    ],
  };
}

// Orders processed in the window (by order_placed_at) plus avg duration
// for each real stage: pick→QC, QC→waybill, and total pick→dispatch
// (picking_started_at to dispatch_finalized_at, computed directly rather
// than summed from the intermediate stage columns, so it can't drift from
// nulls in any one intermediate stage). Extracted into its own function so
// the "Compare to" previous period can call it a second time with a
// shifted window instead of duplicating the query inline.
async function fetchWarehouseKpis(from, to) {
  const rows = await client
    .query({
      query: `
        SELECT
          count() AS orders,
          avgIf(picking_to_qc_seconds, picking_to_qc_seconds IS NOT NULL) AS avg_pick_seconds,
          avgIf(qc_to_waybill_seconds, qc_to_waybill_seconds IS NOT NULL) AS avg_qc_seconds,
          avgIf(
            dateDiff('second', picking_started_at, dispatch_finalized_at),
            picking_started_at IS NOT NULL AND dispatch_finalized_at IS NOT NULL
          ) AS avg_pick_to_dispatch_seconds
        FROM xv3.mart_order_fulfilment_journey
        WHERE toDate(order_placed_at) BETWEEN {from:String} AND {to:String}
      `,
      query_params: { from, to },
      format: "JSONEachRow",
    })
    .then((r) => r.json());
  const k = rows[0] || {};
  return {
    orders: toNum(k.orders),
    avgPickSeconds: toNum(k.avg_pick_seconds),
    avgQcSeconds: toNum(k.avg_qc_seconds),
    avgPickToDispatchSeconds: toNum(k.avg_pick_to_dispatch_seconds),
  };
}

export async function handleBarcodeAnalytics(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const compareTo = ["day", "week", "month"].includes(req.query.compareTo) ? req.query.compareTo : "week";

    let range_;
    try {
      range_ = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const comparison = resolveComparisonWindow(range_, compareTo);

    // All 6 queries below (plus the lifecycle funnel's own 3) are
    // independent of each other — same date range, different tables/
    // aggregations, nothing depends on another's result — so they're fired
    // together via Promise.all instead of one round-trip at a time.
    const [kCur, kPrev, pickerRows, qcRows, distRows, dailyRows, lifecycleFunnel] = await Promise.all([
      fetchWarehouseKpis(range_.from, range_.to),
      fetchWarehouseKpis(comparison.from, comparison.to),
      // Picker Performance — real named pickers, ranked by volume. Excludes
      // null picker_name (a single row store-wide, verified) rather than
      // showing an "Unassigned" bucket with nothing meaningful in it.
      client
        .query({
          query: `
            SELECT
              picker_name,
              count() AS orders,
              sum(coalesce(picked_item_count, 0)) AS items,
              avgIf(picking_to_qc_seconds, picking_to_qc_seconds IS NOT NULL) AS avg_pick_seconds
            FROM xv3.mart_order_fulfilment_journey
            WHERE toDate(order_placed_at) BETWEEN {from:String} AND {to:String}
              AND picker_name IS NOT NULL
            GROUP BY picker_name
            ORDER BY orders DESC
            LIMIT 20
          `,
          query_params: { from: range_.from, to: range_.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // QC Station Throughput — same idea, per QC station.
      client
        .query({
          query: `
            SELECT
              qc_station,
              count() AS orders,
              avgIf(qc_to_waybill_seconds, qc_to_waybill_seconds IS NOT NULL) AS avg_qc_seconds
            FROM xv3.mart_order_fulfilment_journey
            WHERE toDate(order_placed_at) BETWEEN {from:String} AND {to:String}
              AND qc_station IS NOT NULL
            GROUP BY qc_station
            ORDER BY orders DESC
          `,
          query_params: { from: range_.from, to: range_.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Pick-to-Dispatch Time Distribution — same bucketing shape the old
      // Orders & Fulfillment page used for this same table, before that
      // page was rebuilt on the invoice-matching methodology.
      client
        .query({
          query: `
            SELECT ${DIST_BUCKETS.map((b, i) => `countIf(${b.where}) AS b${i}`).join(", ")}
            FROM (
              SELECT dateDiff('second', picking_started_at, dispatch_finalized_at) / 3600.0 AS hrs
              FROM xv3.mart_order_fulfilment_journey
              WHERE toDate(order_placed_at) BETWEEN {from:String} AND {to:String}
                AND picking_started_at IS NOT NULL AND dispatch_finalized_at IS NOT NULL
            )
          `,
          query_params: { from: range_.from, to: range_.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Daily volume — orders placed / picked / packed / shipped per day,
      // for the frontend's Day/Week/Month bucketing (same client-side
      // pattern as Executive Overview's Sales Trend).
      client
        .query({
          query: `
            SELECT
              toDate(order_placed_at) AS d,
              count() AS orders,
              countIf(picking_started_at IS NOT NULL) AS picked,
              countIf(is_packed = 1) AS packed,
              countIf(is_shipped = 1) AS shipped
            FROM xv3.mart_order_fulfilment_journey
            WHERE toDate(order_placed_at) BETWEEN {from:String} AND {to:String}
            GROUP BY d
          `,
          query_params: { from: range_.from, to: range_.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      computeLifecycleFunnel(range_.from, range_.to),
    ]);
    const pickerPerformance = pickerRows.map((r) => ({
      picker: r.picker_name,
      orders: toNum(r.orders),
      items: toNum(r.items),
      avgPickSeconds: toNum(r.avg_pick_seconds),
    }));
    const qcThroughput = qcRows.map((r) => ({
      station: r.qc_station,
      orders: toNum(r.orders),
      avgQcSeconds: toNum(r.avg_qc_seconds),
    }));
    const distRow = distRows[0] || {};
    const pickToDispatchDistribution = DIST_BUCKETS.map((b, i) => ({ label: b.label, value: toNum(distRow[`b${i}`]) }));
    const dailyMap = new Map(dailyRows.map((r) => [String(r.d), r]));
    const dailyVolume = [];
    for (let d = range_.from; d <= range_.to; d = addDaysISO(d, 1)) {
      const r = dailyMap.get(d);
      dailyVolume.push({
        date: d,
        orders: toNum(r?.orders),
        picked: toNum(r?.picked),
        packed: toNum(r?.packed),
        shipped: toNum(r?.shipped),
      });
    }

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current: { from: range_.from, to: range_.to },
        previous: { from: comparison.from, to: comparison.to },
        compareTo,
        methodologyNote:
          "Real warehouse-ops timestamps from xv3.mart_order_fulfilment_journey (picking, QC, packing, dispatch) — HRH Online's own fulfillment operations across all 3 channels (this table has no store/channel column, but is exclusively HRH Online's, verified elsewhere). Pick Rate / picking_status from a different table is intentionally excluded — HMR MART runs its own WMS.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        ordersProcessed: { value: kCur.orders, previous: kPrev.orders, delta: pctDelta(kCur.orders, kPrev.orders) },
        // Lower is better for these 3 durations — delta is still a plain
        // %-change (current vs previous), the frontend decides how to
        // color/arrow it, same as every other timing metric elsewhere.
        avgPickTime: { value: kCur.avgPickSeconds, previous: kPrev.avgPickSeconds, delta: pctDelta(kCur.avgPickSeconds, kPrev.avgPickSeconds) },
        avgQcTime: { value: kCur.avgQcSeconds, previous: kPrev.avgQcSeconds, delta: pctDelta(kCur.avgQcSeconds, kPrev.avgQcSeconds) },
        avgPickToDispatch: {
          value: kCur.avgPickToDispatchSeconds,
          previous: kPrev.avgPickToDispatchSeconds,
          delta: pctDelta(kCur.avgPickToDispatchSeconds, kPrev.avgPickToDispatchSeconds),
        },
      },
      pickerPerformance,
      qcThroughput,
      pickToDispatchDistribution,
      dailyVolume,
      lifecycleFunnel,
      dataQuality: [
        "picker_name/qc_station are excluded when null (1 order store-wide has no picker logged) rather than shown as a meaningless \"Unassigned\" row.",
        "Pick-to-Dispatch duration is picking_started_at → dispatch_finalized_at, computed directly (not summed from intermediate stage columns), so a null in any one intermediate stage can't silently understate it.",
        "This table has no store_name or sales_channel column — scoped to HRH Online implicitly (verified: this warehouse's own fulfillment ops, all 3 channels), not filterable by the page's Channel control.",
      ],
    });
  } catch (err) {
    console.error("HRH Barcode Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Barcode Analytics data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
