import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed -- dispatched from api/hrh-sales-analytics.js via
// ?report=pickers. HMR MART picker performance (Click & Collect-style
// view), from its own WMS: xv3.mart_order_fulfilment_journey.
//
// Verified 2026-10-16: every row of that table is HMR MART -- TikTok orders
// (order_id in xv3.wms_orders), HMR Online website orders (order_id =
// mart_xv3_order_report.order_number, store HRH ONLINE, Pickup/Delivery),
// and ~4% with no source ("Other"). Timestamps are tagged UTC but hold
// Manila wall-clock time (picks run 7 AM-6 PM with a noon dip), so no
// timezone conversion anywhere.
//
// Returns flat per-order rows for the window; the page computes every KPI,
// breakdown and filter from them (same approach as _hrh-pickup-delivery.js).
//   Pick time     = picking_started_at -> qc_session_start_at (basket scanned
//                   at QC, the closest thing to "pick finished")
//   Response time = order_placed_at -> picking_started_at

function manilaTodayISODate() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function mondayOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
function firstOfMonthISO(iso) {
  return `${iso.slice(0, 7)}-01`;
}
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromParam || "") || !/^\d{4}-\d{2}-\d{2}$/.test(toParam || "")) {
      throw new RangeError("Custom range requires from and to as YYYY-MM-DD");
    }
    return fromParam <= toParam ? { from: fromParam, to: toParam } : { from: toParam, to: fromParam };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (range === "prevWeek") {
    const monday = mondayOfWeek(today);
    return { from: addDaysISO(monday, -7), to: addDaysISO(monday, -1) };
  }
  if (range === "prevMonth") {
    const last = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(last), to: last };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today }; // wtd (default)
}

const numOrNull = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export async function handlePickers(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    let window_;
    try {
      window_ = resolveRange(range, from, to);
    } catch (err) {
      return res.status(400).json({ error: "Invalid date range", message: err.message });
    }

    const rows = await client
      .query({
        query: `
          WITH
            tiktok AS (SELECT DISTINCT order_id FROM xv3.wms_orders WHERE order_id IS NOT NULL),
            web AS (
              SELECT order_number, any(checkout_method) AS checkout_method
              FROM xv3.mart_xv3_order_report
              WHERE store_name = 'HRH ONLINE'
              GROUP BY order_number
            )
          SELECT
            j.order_id,
            multiIf(j.order_id IN tiktok, 'TikTok',
                    web.checkout_method = 'Pickup', 'Website · Pickup',
                    web.checkout_method = 'Delivery', 'Website · Delivery',
                    'Other') AS channel,
            j.order_placed_at,
            j.picking_started_at,
            j.qc_session_start_at,
            j.packing_finished_at,
            j.shipped_at,
            j.picker_name,
            j.picked_item_count,
            j.basket_code,
            j.qc_station,
            j.courier_service,
            j.waybill_no,
            j.is_packed,
            j.is_shipped,
            j.picking_to_qc_seconds AS pick_seconds,
            dateDiff('second', j.order_placed_at, j.picking_started_at) AS response_seconds
          FROM xv3.mart_order_fulfilment_journey j
          LEFT JOIN web ON web.order_number = j.order_id
          WHERE j.picking_started_at IS NOT NULL
            AND toDate(coalesce(j.order_placed_at, j.picking_started_at)) BETWEEN {from:String} AND {to:String}
          ORDER BY coalesce(j.order_placed_at, j.picking_started_at) DESC
          LIMIT 20000
        `,
        query_params: window_,
        format: "JSONEachRow",
      })
      .then((r) => r.json());

    const orders = rows.map((r) => ({
      orderId: r.order_id,
      channel: r.channel,
      orderPlacedAt: r.order_placed_at,
      pickStartedAt: r.picking_started_at,
      qcAt: r.qc_session_start_at,
      packedAt: r.packing_finished_at,
      shippedAt: r.shipped_at,
      picker: r.picker_name || null,
      items: Number(r.picked_item_count || 0),
      basket: r.basket_code || null,
      qcStation: r.qc_station || null,
      courier: r.courier_service || null,
      waybill: r.waybill_no || null,
      isPacked: r.is_packed === 1,
      isShipped: r.is_shipped === 1,
      pickSeconds: numOrNull(r.pick_seconds),
      responseSeconds: numOrNull(r.response_seconds),
    }));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      meta: { range, current: window_, generatedAt: new Date().toISOString() },
      orders,
    });
  } catch (err) {
    console.error("HRH Pickers API error:", err);
    return res.status(500).json({
      error: "Failed to load HMR MART picker data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
