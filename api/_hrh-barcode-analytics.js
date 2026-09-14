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
  return { from: mondayOfWeek(today), to: today }; // wtd (default)
}

const DIST_BUCKETS = [
  { label: "≤1h", where: "hrs <= 1" },
  { label: "1-6h", where: "hrs > 1 AND hrs <= 6" },
  { label: "6-24h", where: "hrs > 6 AND hrs <= 24" },
  { label: "24-48h", where: "hrs > 24 AND hrs <= 48" },
  { label: "48h+", where: "hrs > 48" },
];

export async function handleBarcodeAnalytics(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    let range_;
    try {
      range_ = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    // KPIs — orders processed in the window (by order_placed_at) plus avg
    // duration for each real stage: pick→QC, QC→waybill, and total
    // pick→dispatch (picking_started_at to dispatch_finalized_at,
    // computed directly rather than summed from the intermediate stage
    // columns, so it can't drift from nulls in any one intermediate stage).
    const kpiRows = await (
      await client.query({
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
        query_params: { from: range_.from, to: range_.to },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};

    // Picker Performance — real named pickers, ranked by volume. Excludes
    // null picker_name (a single row store-wide, verified) rather than
    // showing an "Unassigned" bucket with nothing meaningful in it.
    const pickerRows = await (
      await client.query({
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
    ).json();
    const pickerPerformance = pickerRows.map((r) => ({
      picker: r.picker_name,
      orders: toNum(r.orders),
      items: toNum(r.items),
      avgPickSeconds: toNum(r.avg_pick_seconds),
    }));

    // QC Station Throughput — same idea, per QC station.
    const qcRows = await (
      await client.query({
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
    ).json();
    const qcThroughput = qcRows.map((r) => ({
      station: r.qc_station,
      orders: toNum(r.orders),
      avgQcSeconds: toNum(r.avg_qc_seconds),
    }));

    // Pick-to-Dispatch Time Distribution — same bucketing shape the old
    // Orders & Fulfillment page used for this same table, before that
    // page was rebuilt on the invoice-matching methodology.
    const distRows = await (
      await client.query({
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
    ).json();
    const distRow = distRows[0] || {};
    const pickToDispatchDistribution = DIST_BUCKETS.map((b, i) => ({ label: b.label, value: toNum(distRow[`b${i}`]) }));

    // Daily volume — orders placed / picked / packed / shipped per day,
    // for the frontend's Day/Week/Month bucketing (same client-side
    // pattern as Executive Overview's Sales Trend).
    const dailyRows = await (
      await client.query({
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
    ).json();
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
        methodologyNote:
          "Real warehouse-ops timestamps from xv3.mart_order_fulfilment_journey (picking, QC, packing, dispatch) — HRH Online's own fulfillment operations across all 3 channels (this table has no store/channel column, but is exclusively HRH Online's, verified elsewhere). Pick Rate / picking_status from a different table is intentionally excluded — HMR MART runs its own WMS.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        ordersProcessed: { value: toNum(k.orders) },
        avgPickTime: { value: toNum(k.avg_pick_seconds) },
        avgQcTime: { value: toNum(k.avg_qc_seconds) },
        avgPickToDispatch: { value: toNum(k.avg_pick_to_dispatch_seconds) },
      },
      pickerPerformance,
      qcThroughput,
      pickToDispatchDistribution,
      dailyVolume,
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
