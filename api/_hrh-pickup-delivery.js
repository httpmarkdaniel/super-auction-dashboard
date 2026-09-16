import { createClient } from "@clickhouse/client";
import { computeHmrphOnlineLifecycle } from "./_hrh-orders-fulfillment.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) —
// dispatched from api/hrh-sales-analytics.js via ?report=pickupDelivery.
//
// Re-scoped 2026-09-16 to fulfillment/operations only, per explicit
// request — dropped everything sales-side (GMV/AOV/payment type/category
// mix, all previously joined in from xv3.mart_net_sales) in favor of the
// much richer xv3.mart_order_fulfilment_journey table, which turns out to
// carry a full pick -> QC -> waybill -> pack -> dispatch -> ship pipeline
// (verified via system.columns — this file previously only used 4 of its
// ~15 real timestamp/duration fields).
//
// Pickup vs Delivery is still checkout_method on xv3.mart_xv3_order_report
// (same field Orders & Fulfillment's "Cancelled by Fulfillment Method" and
// Returns' "Returns by Fulfillment Method" use), joined to the journey
// table by order_id -> order_number (direct match, same as before).
const HRH_STORE = "HRH ONLINE";
const METHODS = ["Pickup", "Delivery"];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
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
// ---------------------------------------------------------------------
// Fulfillment Operations — real pick -> QC -> waybill -> pack -> dispatch
// -> ship pipeline from xv3.mart_order_fulfilment_journey, joined to
// checkout_method by order_id -> order_number (same direct join as the
// rest of this file). Scoped to HMRPH Online implicitly, same as
// everywhere else that reads xv3.mart_xv3_order_report — the join itself
// only ever matches HMRPH Online orders.
//
// IMPORTANT — there is no "delivered to customer" timestamp anywhere in
// this data. The last real milestone is shipped_at, which the raw
// timestamps confirm means "handed off to the courier" for Delivery
// orders (shipped_at lands within seconds of dispatch_finalized_at, and
// courier_service is populated) — not proof the customer actually
// received it. For Pickup orders there's no courier at all
// (courier_service is null), so shipped_at there almost certainly means
// something like "marked ready/collected in-store", not a delivery
// event — inferred from the pattern, not a documented field definition.
// Labeled accordingly rather than calling either one "Delivered".
//
// Stage completion rates (Packed/Shipped/QC/Waybill) are computed WITHIN
// this table — i.e. "of orders that at least started picking, what %
// reached this stage" — since picking_started_at is populated on every
// row here (verified: never null), a journey row's mere existence already
// means picking began. Waybill coverage is verified Delivery-only (0% for
// Pickup in every window checked — Pickup orders don't get a shipping
// waybill), so it's reported for Delivery only, not shown as a misleading
// 0% "failure" for Pickup.
async function computeFulfillmentOperations(from, to) {
  const [stageRows, detailRows, pickerRows] = await Promise.all([
    client
      .query({
        query: `
        SELECT
          o.checkout_method,
          avgIf(j.order_to_pack_seconds, j.order_to_pack_seconds IS NOT NULL) AS avg_order_to_pack,
          avgIf(j.picking_to_qc_seconds, j.picking_to_qc_seconds IS NOT NULL) AS avg_pick_to_qc,
          avgIf(j.qc_to_waybill_seconds, j.qc_to_waybill_seconds IS NOT NULL) AS avg_qc_to_waybill,
          avgIf(j.packing_to_dispatch_finalized_seconds, j.packing_to_dispatch_finalized_seconds IS NOT NULL) AS avg_pack_to_dispatch,
          avgIf(j.dispatch_finalized_to_ship_seconds, j.dispatch_finalized_to_ship_seconds IS NOT NULL) AS avg_dispatch_to_ship,
          avgIf(j.order_to_ship_seconds, j.order_to_ship_seconds IS NOT NULL) AS avg_order_to_ship,
          count() AS n,
          countIf(j.is_packed = 1) AS n_packed,
          countIf(j.is_shipped = 1) AS n_shipped,
          countIf(j.qc_session_start_at IS NOT NULL) AS n_qc,
          countIf(j.waybill_printed_at IS NOT NULL) AS n_waybill
        FROM xv3.mart_order_fulfilment_journey j
        INNER JOIN xv3.mart_xv3_order_report o ON toString(j.order_id) = o.order_number
        WHERE o.store_name = {store:String}
          AND toDate(j.order_placed_at) BETWEEN {from:String} AND {to:String}
          AND o.checkout_method IN ('Pickup', 'Delivery')
        GROUP BY o.checkout_method
      `,
        query_params: { store: HRH_STORE, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // Recent timeline — the full pick -> QC -> waybill -> pack -> dispatch
    // -> ship record per order, not just the 4 stages shown before.
    client
      .query({
        query: `
        SELECT
          j.order_id,
          o.checkout_method,
          j.order_placed_at,
          j.picking_started_at,
          j.qc_session_start_at,
          j.waybill_printed_at,
          j.packing_finished_at,
          j.dispatch_finalized_at,
          j.shipped_at,
          j.courier_service,
          j.picker_name
        FROM xv3.mart_order_fulfilment_journey j
        INNER JOIN xv3.mart_xv3_order_report o ON toString(j.order_id) = o.order_number
        WHERE o.store_name = {store:String}
          AND toDate(j.order_placed_at) BETWEEN {from:String} AND {to:String}
          AND o.checkout_method IN ('Pickup', 'Delivery')
        ORDER BY j.order_placed_at DESC
        LIMIT 200
      `,
        query_params: { store: HRH_STORE, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // Picker productivity — not split by method (a picker works both
    // Pickup and Delivery orders), for the same window. mart_order_
    // fulfilment_journey has no store_name of its own (verified via
    // system.columns), so this joins to order_report for the store filter
    // like every other query here — without it, this table's ~27 other
    // stores' pickers would leak in too (verified: this exact bug briefly
    // inflated Pick Rate to 177% before the join was added everywhere).
    client
      .query({
        query: `
        SELECT
          j.picker_name,
          count() AS orders,
          avgIf(j.order_to_pack_seconds, j.order_to_pack_seconds IS NOT NULL) AS avg_pick_seconds,
          avgIf(j.total_duration_seconds, j.total_duration_seconds IS NOT NULL) AS avg_total_seconds
        FROM xv3.mart_order_fulfilment_journey j
        INNER JOIN xv3.mart_xv3_order_report o ON toString(j.order_id) = o.order_number
        WHERE o.store_name = {store:String}
          AND toDate(j.order_placed_at) BETWEEN {from:String} AND {to:String}
          AND j.picker_name IS NOT NULL AND trim(j.picker_name) != ''
        GROUP BY j.picker_name
        ORDER BY orders DESC
      `,
        query_params: { store: HRH_STORE, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);
  const byMethod = new Map(stageRows.map((r) => [r.checkout_method, r]));

  const stageSummary = ["Pickup", "Delivery"].map((method) => {
    const r = byMethod.get(method);
    const n = toNum(r?.n);
    return {
      method,
      orders: n,
      avgOrderToPackSeconds: toNum(r?.avg_order_to_pack),
      avgPickToQcSeconds: toNum(r?.avg_pick_to_qc),
      avgQcToWaybillSeconds: toNum(r?.avg_qc_to_waybill),
      avgPackToDispatchSeconds: toNum(r?.avg_pack_to_dispatch),
      avgDispatchToShipSeconds: toNum(r?.avg_dispatch_to_ship),
      avgOrderToShipSeconds: toNum(r?.avg_order_to_ship),
      packRate: safeDivide(toNum(r?.n_packed), n) * 100,
      shipRate: safeDivide(toNum(r?.n_shipped), n) * 100,
      qcRate: safeDivide(toNum(r?.n_qc), n) * 100,
      // Waybill coverage is meaningless for Pickup (verified 0% in every
      // window checked — no shipping waybill for an in-store pickup), so
      // it's null ("N/A") there rather than a misleading 0%.
      waybillRate: method === "Delivery" ? safeDivide(toNum(r?.n_waybill), n) * 100 : null,
    };
  });

  const timeline = detailRows.map((r) => ({
    orderId: r.order_id,
    method: r.checkout_method,
    orderPlacedAt: r.order_placed_at,
    pickedAt: r.picking_started_at,
    qcAt: r.qc_session_start_at,
    waybillAt: r.waybill_printed_at,
    packedAt: r.packing_finished_at,
    dispatchedAt: r.dispatch_finalized_at,
    shippedAt: r.shipped_at,
    courier: r.courier_service,
    picker: r.picker_name,
  }));

  const pickerProductivity = pickerRows
    .map((r) => ({
      picker: r.picker_name,
      orders: toNum(r.orders),
      avgPickSeconds: toNum(r.avg_pick_seconds),
      avgTotalSeconds: toNum(r.avg_total_seconds),
    }))
    .sort((a, b) => b.orders - a.orders);

  return { stageSummary, timeline, pickerProductivity };
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

    // Orders by Method — a plain operational count straight from
    // xv3.mart_xv3_order_report's checkout_method, NOT joined to sales —
    // deliberately a different, simpler population than "Real Orders
    // Received" below (that one already has its own locked True-
    // Cancellation-aware definition elsewhere; duplicating that
    // classification here just for a method split isn't worth the
    // complexity, so this is every order with each checkout_method in the
    // window, full stop).
    const [ordersByMethodRows, lifecycle, pickedOrdersRows, ops] = await Promise.all([
      client
        .query({
          query: `
            SELECT checkout_method, count() AS orders
            FROM xv3.mart_xv3_order_report
            WHERE store_name = {store:String}
              AND checkout_method IN ('Pickup', 'Delivery')
              AND created_at >= {fromDt:String} AND created_at < {toExclusiveDt:String}
            GROUP BY checkout_method
          `,
          query_params: { store: HRH_STORE, fromDt: `${range_.from} 00:00:00`, toExclusiveDt: `${addDaysISO(range_.to, 1)} 00:00:00` },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Real Orders Received — the SAME locked definition (True
      // Cancellation-aware) used dashboard-wide, as Pick Rate's
      // denominator (see computeHmrphOnlineLifecycle in
      // api/_hrh-orders-fulfillment.js).
      computeHmrphOnlineLifecycle(range_.from, range_.to),
      // Pick Rate's numerator — distinct HRH Online orders with ANY
      // fulfillment journey record (picking_started_at is never null on
      // this table, verified, so a row's mere existence means picking
      // began). Joined to order_report for the store filter — this table
      // has no store_name of its own and spans ~27 other stores/
      // warehouses (verified), so an unjoined count here would silently
      // include their fulfillment activity too.
      client
        .query({
          query: `
            SELECT uniqExact(j.order_id) AS picked_orders
            FROM xv3.mart_order_fulfilment_journey j
            INNER JOIN xv3.mart_xv3_order_report o ON toString(j.order_id) = o.order_number
            WHERE o.store_name = {store:String}
              AND toDate(j.order_placed_at) BETWEEN {from:String} AND {to:String}
          `,
          query_params: { store: HRH_STORE, from: range_.from, to: range_.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      computeFulfillmentOperations(range_.from, range_.to),
    ]);

    const ordersByMethod = new Map(ordersByMethodRows.map((r) => [r.checkout_method, toNum(r.orders)]));
    const methodSummary = METHODS.map((m) => ({ method: m, orders: ordersByMethod.get(m) || 0 }));

    const pickedOrders = toNum(pickedOrdersRows[0]?.picked_orders);
    const pickRate = {
      value: safeDivide(pickedOrders, lifecycle.realOrdersReceived) * 100,
      pickedOrders,
      realOrdersReceived: lifecycle.realOrdersReceived,
    };

    const { stageSummary, timeline, pickerProductivity } = ops;

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current: { from: range_.from, to: range_.to },
        methodologyNote:
          "Pickup vs Delivery is checkout_method on xv3.mart_xv3_order_report. Fulfillment stages (pick/QC/waybill/pack/dispatch/ship) come from xv3.mart_order_fulfilment_journey, joined by order_id -> order_number (direct match only). This page is HMRPH Online's own fulfillment operations — not affected by the dashboard's Channel filter, since TikTok/Shopee orders never populate either of these tables.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        pickupOrders: { value: methodSummary.find((m) => m.method === "Pickup")?.orders || 0 },
        deliveryOrders: { value: methodSummary.find((m) => m.method === "Delivery")?.orders || 0 },
        pickRate: pickRate,
      },
      methodSummary,
      stageSummary,
      pickerProductivity,
      timeline,
      dataQuality: [
        `Pick Rate = orders with any fulfillment journey record (${pickRate.pickedOrders}) ÷ Real Orders Received (${pickRate.realOrdersReceived}, the same True-Cancellation-aware definition used dashboard-wide) for this window — catches orders that never entered the pick/pack pipeline at all (e.g. cancelled before picking started), not just slow ones.`,
        "Stage completion rates (Pack/Ship/QC rate) are computed WITHIN the fulfillment journey table itself — of orders that have a journey record (i.e. picking started), what % reached each later stage.",
        "Waybill coverage is shown for Delivery only — verified 0% for Pickup in every window checked (in-store pickups don't get a shipping waybill), so it's reported as N/A there rather than a misleading 0%.",
        "Fulfillment stages have no \"delivered to customer\" timestamp — the last real milestone is \"Shipped\", which the raw data confirms means handed off to the courier for Delivery orders (it lands seconds after Dispatched, alongside a real courier_service). For Pickup orders there's no courier at all, so \"Shipped\" there most likely means marked ready/collected in-store, not a delivery event — inferred from the timestamp pattern, not a documented field definition.",
        "Orders by Method (the KPI counts above) is a plain count of checkout_method on xv3.mart_xv3_order_report for the window — a different, simpler population than Real Orders Received (which nets out True Cancellations); the two won't always match exactly.",
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
