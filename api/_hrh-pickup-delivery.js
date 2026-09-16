import { createClient } from "@clickhouse/client";
import { computeHmrphOnlineLifecycle } from "./_hrh-orders-fulfillment.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) --
// dispatched from api/hrh-sales-analytics.js via ?report=pickupDelivery.
//
// Rebuilt 2026-09-16 to match a supplied mockup ("Fulfillment Operations")
// as closely as real data allows. Rather than pre-aggregating in SQL, this
// returns FLAT per-order rows (this window + a live "in progress" set +
// a fixed trailing-90-day set) and lets the frontend
// (src/hrh-online/pickupDeliveryCompute.js) compute every median/
// percentile/breakdown/filter combination instantly, client-side, off the
// same real rows -- see that file's own comments for the aggregation
// logic and the reasoning behind each derived metric.
//
// Three pieces of the mockup are NOT real, verified via system.columns +
// distinct-value checks, and were adapted rather than copied verbatim:
//   - `current_status` on the journey table is 99.8% "COMPLETED" in this
//     window (1095/1097) -- not a usable live-status filter. The Live
//     Fulfillment Tracker and Orders Requiring Attention derive real-time
//     stage from which timestamps are actually filled instead.
//   - `staging_location` has exactly one real value in this data (a
//     single dispatch location) -- dropped as a filter, it would be a
//     one-option no-op.
//   - `courier_service` has exactly one real courier (Gogo Express) in
//     this data, not the 5 shown in the mockup -- the Courier panel shows
//     whatever couriers actually appear (today, one) instead of a
//     multi-row comparison that doesn't exist.
// The mockup's fixed "SLA Target (60m)" is also not real -- there's no
// SLA policy field anywhere in this data. Per explicit direction, it's
// replaced with each method's own trailing-90-day median Order-Placed-to-
// Shipped time as a self-derived pace reference (see computeKpis /
// computeMethodComparison in pickupDeliveryCompute.js), never called an
// "SLA".
const HRH_STORE = "HRH ONLINE";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toNumOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

// xv3.mart_xv3_order_report has a handful of duplicate order_number rows
// for HRH ONLINE (verified: 4, e.g. order 251228 has 2 identical rows). A
// plain INNER JOIN on order_number fans those out, silently doubling that
// order's contribution to every downstream count/median. Every join here
// goes through this pre-collapsed one-row-per-order_number subquery
// instead of the raw table so that can never happen again -- `any()`
// picks an arbitrary but consistent value, fine since checkout_method is
// the only column ever read off it.
const ORDER_REPORT_DEDUPED = `(SELECT order_number, any(checkout_method) AS checkout_method FROM xv3.mart_xv3_order_report WHERE store_name = {store:String} GROUP BY order_number)`;

// One flat per-order fetch, reused for all three populations this page
// needs (this window / live in-progress / trailing-90-day reference) --
// same columns, same dedup join, only the WHERE clause and sort differ.
// mart_order_fulfilment_journey has no store_name of its own and spans
// ~27 other stores/warehouses (verified) -- the join is what scopes every
// call of this to HMRPH Online.
async function fetchFlatOrders(extraWhere, params, { limit = 20000, orderAsc = false } = {}) {
  const rows = await client
    .query({
      query: `
        SELECT
          j.order_id,
          o.checkout_method AS method,
          j.order_placed_at,
          j.picking_started_at,
          j.qc_session_start_at,
          j.waybill_printed_at,
          j.packing_started_at,
          j.packing_finished_at,
          j.dispatch_finalized_at,
          j.shipped_at,
          j.picker_name,
          j.qc_station,
          j.courier_service,
          j.picked_item_count,
          j.is_packed,
          j.is_shipped,
          dateDiff('second', j.order_placed_at, j.picking_started_at) AS to_pick_seconds,
          j.picking_to_qc_seconds AS to_qc_seconds,
          j.qc_to_waybill_seconds AS to_waybill_seconds,
          dateDiff('second', coalesce(j.waybill_printed_at, j.qc_session_start_at), j.packing_started_at) AS to_packing_seconds,
          j.packing_duration_seconds AS packing_duration_seconds,
          j.packing_to_dispatch_finalized_seconds AS to_dispatch_seconds,
          j.dispatch_finalized_to_ship_seconds AS to_ship_seconds,
          j.order_to_pack_seconds AS order_to_pack_seconds,
          j.order_to_ship_seconds AS order_to_ship_seconds
        FROM xv3.mart_order_fulfilment_journey j
        INNER JOIN ${ORDER_REPORT_DEDUPED} o ON toString(j.order_id) = o.order_number
        WHERE o.checkout_method IN ('Pickup', 'Delivery') AND ${extraWhere}
        ORDER BY j.order_placed_at ${orderAsc ? "ASC" : "DESC"}
        LIMIT ${limit}
      `,
      query_params: { store: HRH_STORE, ...params },
      format: "JSONEachRow",
    })
    .then((r) => r.json());

  return rows.map((r) => ({
    orderId: r.order_id,
    method: r.method,
    orderPlacedAt: r.order_placed_at,
    pickedAt: r.picking_started_at,
    qcAt: r.qc_session_start_at,
    waybillAt: r.waybill_printed_at,
    packingStartedAt: r.packing_started_at,
    packedAt: r.packing_finished_at,
    dispatchedAt: r.dispatch_finalized_at,
    shippedAt: r.shipped_at,
    picker: r.picker_name || null,
    qcStation: r.qc_station || null,
    courier: r.courier_service || null,
    itemCount: toNum(r.picked_item_count),
    isPacked: r.is_packed === 1,
    isShipped: r.is_shipped === 1,
    toPickSeconds: toNumOrNull(r.to_pick_seconds),
    toQcSeconds: toNumOrNull(r.to_qc_seconds),
    toWaybillSeconds: toNumOrNull(r.to_waybill_seconds),
    toPackingSeconds: toNumOrNull(r.to_packing_seconds),
    packingDurationSeconds: toNumOrNull(r.packing_duration_seconds),
    toDispatchSeconds: toNumOrNull(r.to_dispatch_seconds),
    toShipSeconds: toNumOrNull(r.to_ship_seconds),
    orderToPackSeconds: toNumOrNull(r.order_to_pack_seconds),
    orderToShipSeconds: toNumOrNull(r.order_to_ship_seconds),
  }));
}

export async function handlePickupDelivery(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    let range_;
    try {
      range_ = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const today = manilaTodayISODate();
    const trailingFrom = addDaysISO(today, -90);

    const [lifecycle, orders, liveInProgress, recentOrders] = await Promise.all([
      // Real Orders Received -- the SAME locked, True-Cancellation-aware
      // definition used dashboard-wide (see computeHmrphOnlineLifecycle in
      // api/_hrh-orders-fulfillment.js).
      computeHmrphOnlineLifecycle(range_.from, range_.to),
      fetchFlatOrders("toDate(j.order_placed_at) BETWEEN {from:String} AND {to:String}", { from: range_.from, to: range_.to }),
      // Live Fulfillment Tracker / Orders Requiring Attention / Pickup
      // Readiness's live counts -- orders currently in the pipeline
      // (picking started, not yet shipped_at), independent of the Date
      // Range filter, same "always current" spirit as Auction Dashboard's
      // Active Auctions. Oldest-first so the longest-waiting orders sort
      // to the top.
      fetchFlatOrders("j.shipped_at IS NULL", {}, { limit: 50, orderAsc: true }),
      // Fixed trailing 90 days ending today -- the stable historical
      // baseline every "typical"/"reference" figure on this page compares
      // against (pace reference, attention thresholds, Pickup Readiness's
      // median Order -> Ready). Deliberately NOT tied to the Date Range
      // filter, so switching date ranges never changes what "typical"
      // means.
      fetchFlatOrders("toDate(j.order_placed_at) BETWEEN {trailingFrom:String} AND {today:String}", { trailingFrom, today }),
    ]);

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current: { from: range_.from, to: range_.to },
        methodologyNote:
          "Pickup vs Delivery is checkout_method on xv3.mart_xv3_order_report. Every fulfillment metric comes from xv3.mart_order_fulfilment_journey's real pick -> QC -> waybill -> pack -> dispatch -> ship timestamps, joined by order_id -> order_number (direct match only). This page is HMRPH Online's own fulfillment operations -- not affected by the dashboard's Channel filter, since TikTok/Shopee orders never populate either of these tables.",
        generatedAt: new Date().toISOString(),
      },
      ordersReceived: lifecycle.realOrdersReceived,
      orders,
      inProgress: liveInProgress,
      recentOrders,
      dataQuality: [
        "Orders Received uses the same True-Cancellation-aware definition used dashboard-wide; every other figure on this page comes from the fulfillment journey table's own (slightly different, simpler) population -- an order that got a pick/pack record. The two populations won't always match exactly.",
        "Medians and percentiles filter out non-positive and implausibly long (>3 day) stage durations as data artifacts -- a handful of journey rows have clearly-wrong timestamps that would otherwise distort every average they touch.",
        "There's no official SLA policy field anywhere in this data, so \"Reference Time\" / \"Within Reference Time\" is a self-derived pace benchmark -- each method's own trailing-90-day median Order-Placed-to-Shipped time -- never an official target.",
        "Orders Requiring Attention flags an order only when its current wait is more than 2x the typical (trailing-90-day median) wait for its next stage; a flat 2-hour fallback applies only where a stage has no historical baseline to compare against at all.",
        "Picker performance tiers (Top Performer / On Track / Watch / Needs Attention) are a quartile ranking of items/hour among this period's own active pickers -- a relative comparison, not a fixed company standard.",
        "QC Station is a real filter (3 stations in use). Status and Staging Location from the original mockup were dropped: current_status is 99.8% \"COMPLETED\" in this table (the Live Tracker derives real-time stage from timestamps instead), and staging_location has exactly one real value (a single dispatch location).",
        "Courier Performance shows whatever courier(s) actually appear in this data -- currently one (Gogo Express) -- rather than a multi-courier comparison that doesn't exist here.",
        "A \"Delivery by Destination Region\" map from a supplied mockup was dropped entirely -- verified via system.columns that xv3.mart_xv3_order_report has no region/city/province/address field at all, so there's no real data to show there.",
        "Top Delay Reasons and Orders by Current Status look at every order in the selected window (not just live in-progress ones); Top Delay Reasons uses the same >2x-trailing-median heuristic as Orders Requiring Attention, attributing each flagged order to its single worst stage.",
        "There is no \"delivered to customer\" timestamp anywhere in this data. The last real milestone is Shipped/Ready, which the raw timestamps confirm means handed off to the courier for Delivery (lands seconds after Dispatch Finalized, alongside a real courier). For Pickup there's no courier at all, so it most likely means marked ready/collected in-store -- inferred from the pattern, not a documented field definition.",
      ],
    });
  } catch (err) {
    console.error("HRH Pickup & Delivery API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Pickup & Delivery data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
