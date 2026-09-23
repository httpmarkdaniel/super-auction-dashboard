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
// Also returns `lifecycleFunnel` (Barcoded -> ASN -> Received/Put-away ->
// Posted -> Sold, on xv3.mart_level_of_inventory +
// xv3.stg_outbound_slip_items + cms.mart_cms_posted_inventory_report +
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
// INVENTORY LIFECYCLE FUNNEL — Barcoded → ASN → Received/Put-away → Posted → Sold
// ============================================================================
// Additive to this file only; does not touch the pick/QC/dispatch KPIs above.
// Grain: ONE ROW = ONE PHYSICAL BARCODED UNIT in xv3.mart_level_of_inventory
// (store_name = 'HRH ONLINE'). item_qty on that table is a live on-hand
// counter (drops to 0 once sold), not an ASN/received quantity — so it is
// NOT used for the funnel's quantities; unit counts (rows) are used instead,
// which is the same thing at this grain (1 barcode = 1 unit).
//
// REBUILT 2026-09-17 once a real ASN/receiving signal was found —
// xv3.stg_outbound_slip_items (backing xv3.stg_outbound_slips, whose
// slip_no is literally "ASN-YYMMDDHHMMSS-NNN" — an ASN despite the
// "outbound" table name). The old version started at "ASN (Received)"
// because mart_level_of_inventory's date_received/created_time were the
// only signal available and are effectively the same event (see point 2
// below, still true). Validated before writing this (read-only queries
// against production ClickHouse, not assumed):
//
// 1. STAGE ORDER IS BARCODED -> ASN, NOT ASN -> BARCODED. For the 9,054
//    barcodes present in both mart_level_of_inventory (HRH ONLINE) and
//    stg_outbound_slip_items, the ASN row's created_at comes AFTER the
//    barcode's created_time in 9,052 of them (99.98%). The barcode is
//    created first (item enters the system); the ASN is raised against it
//    afterward, to move/register it for the online warehouse.
//
// 2. ASN AND BARCODED ARE STILL EFFECTIVELY THE SAME POPULATION AT THIS
//    GRAIN — mart_level_of_inventory only contains items that already have
//    a barcode, so "Barcoded" (created_time in range) is the true cohort
//    anchor, and ASN coverage against it is real (not ~100% pass-through
//    the way the old ASN/Barcoded pairing was), since not every barcoded
//    unit has an ASN raised (yet, or ever, for this table's population).
//
// 3. "RECEIVED / PUT-AWAY" USES ASN STATUS, NOT A SEPARATE TIMESTAMP.
//    status on stg_outbound_slip_items moves PENDING -> PARTIAL -> RECEIVED
//    as received_quantity climbs toward quantity. No table (this one or
//    xv3.mart_slip_report, a different general inter-store transfer table,
//    not HRH-Online-specific) carries a distinct "put-away" event apart
//    from "fully received" — so this stage reports ASN status = RECEIVED
//    (received_quantity has caught up to quantity) as the real proxy for
//    putaway-complete. PENDING/PARTIAL count as not-yet-complete rather
//    than being folded in — a real, if small, population (236 of 9,055
//    barcodes, 2.6%), not a degenerate near-100% pass-through.
//
// 4. RECEIVED RELIABLY PRECEDES POSTING. For 5,050 barcodes with both a
//    RECEIVED status and a CMS posting record, the receive timestamp
//    precedes first_published in 5,049 of them (99.98%), avg ~252 hours
//    (10.5 days) before — a real, validated ordering.
//
// 5. "POSTED" DOES NOT MEAN cms_hmrph_posting_quantity. That field
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
// 6. SOLD uses the already-validated xv3.mart_net_sales relationship
//    (`ct.item_id` = mart_level_of_inventory.product_id, store_name = 'HRH
//    ONLINE', net_sales_amount > 0) — the same join Inventory Aging already
//    uses, reused here rather than re-derived.
//
// Cohort semantics (not same-period event counts): the cohort is the set of
// units BARCODED (created_time) in the selected range — the true first
// event. ASN/Received/Posted/Sold are then answered as "has this unit EVER
// reached that stage, as of now" (cohort progress-to-date), not "did this
// happen in that same date window" — units barcoded near the end of a
// period legitimately have not had time to progress yet, so a same-window
// count would understate true conversion.
async function computeLifecycleFunnel(from, to) {
  const HRH_STORE = "HRH ONLINE";

  // These 4 queries are fully independent of each other (cohort is scoped
  // by created_time, the rest are scoped by store/table only, with no
  // dependency on cohort's own results) — run concurrently instead of one
  // round-trip at a time.
  const [cohortRows, asnRows, postedRows, soldRows] = await Promise.all([
    client
      .query({
        query: `
          SELECT barcode, toString(product_id) AS product_id, created_time,
            product_name, item_qty, current_srp, total_current_srp
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
            AND created_time IS NOT NULL
            AND toDate(created_time) BETWEEN {from:String} AND {to:String}
        `,
        query_params: { store: HRH_STORE, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // ASN status per barcode, as-of-now. min(created_at) is when the ASN
    // was first raised for that barcode; latest_status/latest_status_at
    // come from whichever ASN item row was updated most recently (a
    // barcode can in principle have more than one ASN row, though
    // distinct barcodes ≈ distinct item_ids in practice, so this is
    // mostly 1:1).
    client
      .query({
        query: `
          SELECT
            product_barcode,
            min(created_at) AS asn_created_at,
            argMax(status, updated_at) AS latest_status,
            argMax(updated_at, updated_at) AS latest_status_at
          FROM xv3.stg_outbound_slip_items
          WHERE product_barcode IS NOT NULL
          GROUP BY product_barcode
        `,
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
  const asnMap = new Map(asnRows.map((r) => [r.product_barcode, r]));
  const postedMap = new Map(postedRows.map((r) => [r.sku, r.first_published]));
  const soldMap = new Map(soldRows.map((r) => [String(r.product_id), r.first_sale]));

  const barcodedQty = cohortRows.length;
  let asnQty = 0;
  let receivedQty = 0;
  let postedQty = 0;
  let soldQty = 0;
  let soldNotPosted = 0;

  // Per-stage item detail lists — for the funnel's click-through modal
  // (barcode/item name/amount/qty/stock value per unit, so a stage's count
  // isn't just a number with no way to see WHICH units it covers, same
  // idea as Weekly Business Review's SKU Movement modal). current_srp is
  // the unit's current selling price ("amount"); item_qty is its current
  // on-hand stock; total_current_srp is stock value — verified 100% equal
  // to item_qty * current_srp, so the stored field is used as-is rather
  // than recomputed.
  // stageAt is the real timestamp the unit reached THAT specific stage
  // (not always the same field) — barcode created_time for Barcoded, the
  // ASN's own created_at for ASN Raised, the ASN row's updated_at (when
  // status flipped to RECEIVED) for Received/Put-away, published_date for
  // Posted, first transaction_date for Sold. transaction_date is a plain
  // Date (no time-of-day) so Sold's Timestamp column reads the same as its
  // Date column — a real limitation of that source, not a display bug.
  const stageItems = { barcoded: [], asn: [], received: [], posted: [], sold: [] };
  function toItemDetail(r, stageAt) {
    return {
      barcode: r.barcode,
      product: r.product_name || r.barcode,
      amount: toNum(r.current_srp),
      qty: toNum(r.item_qty),
      stockValue: toNum(r.total_current_srp),
      stageAt: stageAt || null,
    };
  }

  let barcodedToAsnHoursSum = 0;
  let barcodedToAsnHoursN = 0;
  let asnToReceivedDaysSum = 0;
  let asnToReceivedDaysN = 0;
  let receivedToPostedDaysSum = 0;
  let receivedToPostedDaysN = 0;
  let postedToSoldDaysSum = 0;
  let postedToSoldDaysN = 0;

  for (const r of cohortRows) {
    stageItems.barcoded.push(toItemDetail(r, r.created_time));

    const asn = asnMap.get(r.barcode);
    const isAsn = !!asn;
    if (isAsn) {
      asnQty++;
      stageItems.asn.push(toItemDetail(r, asn.asn_created_at));
    }

    const isReceived = isAsn && asn.latest_status === "RECEIVED";
    if (isReceived) {
      receivedQty++;
      stageItems.received.push(toItemDetail(r, asn.latest_status_at));
    }

    const firstPublished = postedMap.get(r.barcode);
    const isPosted = !!firstPublished;
    if (isPosted) {
      postedQty++;
      stageItems.posted.push(toItemDetail(r, firstPublished));
    }

    const firstSale = soldMap.get(r.product_id);
    const isSold = !!firstSale;
    if (isSold) {
      soldQty++;
      stageItems.sold.push(toItemDetail(r, firstSale));
    }
    if (isSold && !isPosted) soldNotPosted++;

    if (isAsn && r.created_time) {
      const hrs = (new Date(asn.asn_created_at) - new Date(r.created_time)) / 3600000;
      if (hrs >= 0) {
        barcodedToAsnHoursSum += hrs;
        barcodedToAsnHoursN++;
      }
    }
    if (isReceived) {
      const days = (new Date(asn.latest_status_at) - new Date(asn.asn_created_at)) / 86400000;
      if (days >= 0) {
        asnToReceivedDaysSum += days;
        asnToReceivedDaysN++;
      }
    }
    if (isReceived && isPosted) {
      const days = (new Date(firstPublished) - new Date(asn.latest_status_at)) / 86400000;
      if (days >= 0) {
        receivedToPostedDaysSum += days;
        receivedToPostedDaysN++;
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
    cohort: { from, to, basis: "created_time (Barcoded) within range; ASN/Received/Posted/Sold measured as-of-now for this cohort" },
    stages: [
      { key: "barcoded", label: "Barcoded", qty: barcodedQty, items: stageItems.barcoded },
      { key: "asn", label: "ASN Raised", qty: asnQty, conversionFromPrev: safeDiv(asnQty, barcodedQty), items: stageItems.asn },
      { key: "received", label: "Received / Put-away", qty: receivedQty, conversionFromPrev: safeDiv(receivedQty, asnQty), items: stageItems.received },
      { key: "posted", label: "Posted (Listed for Sale)", qty: postedQty, conversionFromPrev: safeDiv(postedQty, receivedQty), items: stageItems.posted },
      { key: "sold", label: "Sold", qty: soldQty, conversionFromPrev: safeDiv(soldQty, postedQty), items: stageItems.sold },
    ],
    cycleTimeDays: {
      barcodedToAsnHours: barcodedToAsnHoursN > 0 ? barcodedToAsnHoursSum / barcodedToAsnHoursN : null,
      asnToReceivedDays: asnToReceivedDaysN > 0 ? asnToReceivedDaysSum / asnToReceivedDaysN : null,
      receivedToPostedDays: receivedToPostedDaysN > 0 ? receivedToPostedDaysSum / receivedToPostedDaysN : null,
      postedToFirstSaleDays: postedToSoldDaysN > 0 ? postedToSoldDaysSum / postedToSoldDaysN : null,
    },
    unmatched: {
      soldButNeverPosted: soldNotPosted,
    },
    dataQuality: [
      "Stage order is Barcoded → ASN, not ASN → Barcoded: verified against production that the ASN item's created_at comes after the barcode's created_time for 99.98% of matched units (9,052 of 9,054) — the barcode is created first, the ASN is raised against it after.",
      "\"Received / Put-away\" uses ASN status = RECEIVED (received_quantity has caught up to quantity) — there is no separate put-away timestamp anywhere in this data; PENDING/PARTIAL count as not-yet-complete rather than being folded in.",
      "\"Posted\" uses cms.mart_cms_posted_inventory_report (status/published_date), not cms_hmrph_posting_quantity on mart_level_of_inventory — that field was checked against real sales and did not hold up (81% of items with confirmed sales show it at 0).",
      "ASN/Received/Posted/Sold are cohort-to-date (has it ever happened, as of now), not same-window counts — items barcoded near the end of the selected range have not had time to progress yet.",
      "ASN coverage is real but incomplete and swings by month, not a bug: xv3.stg_outbound_slip_items only has data from 2026-02-20 onward (items barcoded before that show 0% ASN by construction), then ramped to 80-90%+ coverage March-June 2026, before dipping to ~55% (July) and ~36% (August) — overall 9,054 of 12,341 HRH ONLINE barcodes (73%) have ever had an ASN raised against them.",
      "cms.mart_cms_posted_inventory_report only has data from 2026-02-25 onward, so items barcoded before that date can't show a posting record even if they really were posted. That alone doesn't explain the full gap, though — e.g. of items received in April 2026 (well inside the covered window) that went on to sell, 840 of 972 (86%) still have no matching posting record. \"Sold but never posted\" below is likely undercounted CMS posting capture, not proof those items were sold unlisted.",
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

// ============================================================================
// ON-HAND STOCK — current qty + value per product, right now
// ============================================================================
// A live snapshot, not scoped to the page's Date Range filter at all — "on
// hand" means right now, not "as of the selected period" (same convention
// as e.g. Executive Overview's trailing Sales Trend being independent of
// the Date Range filter). Same source table as the lifecycle funnel's
// per-item modal (xv3.mart_level_of_inventory, store_name = 'HRH ONLINE'):
// item_qty is the live on-hand counter (drops to 0 once sold — see
// computeLifecycleFunnel's header comment), current_srp the unit's current
// selling price, total_current_srp the stock value (verified there to
// equal item_qty * current_srp). Grouped by product (product_id), summing
// across every barcode row for that product, and filtered to item_qty > 0
// so sold-out products don't clutter the table with a 0 row.
async function computeOnHandStock() {
  const HRH_STORE = "HRH ONLINE";
  const rows = await client
    .query({
      query: `
        SELECT
          toString(product_id) AS product_id,
          any(product_name) AS product_name,
          sum(item_qty) AS qty,
          sum(total_current_srp) AS stock_value
        FROM xv3.mart_level_of_inventory
        WHERE store_name = {store:String} AND item_qty > 0
        GROUP BY product_id
        HAVING qty > 0
        ORDER BY stock_value DESC
      `,
      query_params: { store: HRH_STORE },
      format: "JSONEachRow",
    })
    .then((r) => r.json());
  const items = rows.map((r) => ({
    productId: r.product_id,
    product: r.product_name,
    qty: toNum(r.qty),
    stockValue: toNum(r.stock_value),
  }));
  const totals = items.reduce(
    (acc, r) => ({ qty: acc.qty + r.qty, stockValue: acc.stockValue + r.stockValue }),
    { qty: 0, stockValue: 0 },
  );
  return { items, totals };
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
    const [kCur, kPrev, pickerRows, qcRows, distRows, dailyRows, lifecycleFunnel, onHandStock] = await Promise.all([
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
      computeOnHandStock(),
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

    res.setHeader("Cache-Control", "no-store");
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
      onHandStock,
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
