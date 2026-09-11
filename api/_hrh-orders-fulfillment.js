import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions
// and is already exactly at that cap, so this can't be its own route.
// api/hrh-sales-analytics.js dispatches here on `?report=ordersFulfillment`.
//
// Two real source tables, both live operational snapshots (not sales-over-
// time), so — same as Barcode Analytics/Inventory Aging/Markdown Analytics
// — this ignores the page's Date Range/Channel filter:
//
// xv3.mart_xv3_order_pickability — has a real store_name column (unlike
// the journey table below), one row per order LINE ITEM, with
// picking_status (PENDING/PICKED) and stock-availability fields
// (is_pickable, shortage). Drives "Orders Requiring Pick"/"Pick Rate"/
// "Pending Picks"/the Pending Pick Queue table.
//
// xv3.mart_order_fulfilment_journey — one row per order, no store_name
// column at all, but verified: the half that joins to sales_order_item is
// 100% store_id 160 (HRH Online), and the other half has 18-digit order
// IDs matching HRH Online's TikTok/Shopee external order-ID format — so
// treated as exclusively HRH Online's own fulfillment ops, not filtered
// by store (there's nothing to filter by). Drives the funnel, Avg Pick
// Time, Fulfillment Rate, courier performance, and pick-to-dispatch
// timing. is_packed/is_shipped/current_status are used for the funnel
// (not raw timestamp presence) because order_placed_at and
// waybill_printed_at both have real population gaps that make raw
// timestamp presence non-monotonic (e.g. more rows have packing_finished_at
// than waybill_printed_at) — the boolean flags are clean and consistent.
const HRH_STORE = "HRH ONLINE";
// Orders still genuinely in the pick pipeline — excludes Cancelled (never
// picked, correctly so) and Completed (fulfilled already; this table's
// picking_status often never got backfilled to PICKED for older completed
// orders, a data-completeness gap, not a real still-pending order).
const ACTIVE_ORDER_STATUSES = ["Paid", "Processing", "For Delivery", "Pending"];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}

export async function handleOrdersFulfillment(req, res) {
  try {
    // Orders Requiring Pick / Pick Rate / Pending Picks — order-level
    // (deduped by order_number; this table is one row per line item),
    // scoped to ACTIVE_ORDER_STATUSES.
    const pickRows = await (
      await client.query({
        query: `
          SELECT any(picking_status) AS picking_status
          FROM xv3.mart_xv3_order_pickability
          WHERE store_name = {store:String} AND order_status IN ({statuses:Array(String)})
          GROUP BY order_number
        `,
        query_params: { store: HRH_STORE, statuses: ACTIVE_ORDER_STATUSES },
        format: "JSONEachRow",
      })
    ).json();
    const ordersRequiringPick = pickRows.length;
    const pendingPicks = pickRows.filter((r) => r.picking_status === "PENDING").length;
    const pickedCount = pickRows.filter((r) => r.picking_status === "PICKED").length;
    const pickRate = safeDivide(pickedCount, ordersRequiringPick) * 100;

    // Avg Pick Time — journey table's picking_to_qc_seconds, a real
    // precomputed duration (picking start to QC start), 99.96% coverage.
    // Fulfillment Rate — is_shipped=1 share of the whole journey table.
    const journeyKpiRows = await (
      await client.query({
        query: `
          SELECT
            avgIf(picking_to_qc_seconds, picking_to_qc_seconds IS NOT NULL) AS avg_pick_seconds,
            countIf(is_shipped = 1) AS shipped,
            count() AS total
          FROM xv3.mart_order_fulfilment_journey
        `,
        format: "JSONEachRow",
      })
    ).json();
    const jk = journeyKpiRows[0] || {};
    const avgPickMinutes = toNum(jk.avg_pick_seconds) / 60;
    const fulfillmentRate = safeDivide(toNum(jk.shipped), toNum(jk.total)) * 100;

    // Order Fulfillment Funnel — is_packed/is_shipped flags (clean,
    // monotonic), not raw timestamp presence (see file header comment).
    const funnelRows = await (
      await client.query({
        query: `
          SELECT
            count() AS total,
            countIf(picking_started_at IS NOT NULL) AS picked,
            countIf(is_packed = 1) AS packed,
            countIf(is_shipped = 1) AS shipped
          FROM xv3.mart_order_fulfilment_journey
        `,
        format: "JSONEachRow",
      })
    ).json();
    const f = funnelRows[0] || {};
    const funnel = [
      { label: "Orders", value: toNum(f.total) },
      { label: "Picked", value: toNum(f.picked) },
      { label: "Packed", value: toNum(f.packed) },
      { label: "Shipped", value: toNum(f.shipped) },
    ];

    // Pending Pick Queue — order-level, oldest first, real shortage flag
    // from the pickability table (whether current stock can cover it).
    const queueRows = await (
      await client.query({
        query: `
          SELECT order_number, min(created_at) AS created_at, sum(shortage) AS total_shortage, any(order_status) AS order_status_out
          FROM xv3.mart_xv3_order_pickability
          WHERE store_name = {store:String} AND order_status IN ({statuses:Array(String)}) AND picking_status = 'PENDING'
          GROUP BY order_number
          ORDER BY created_at ASC
          LIMIT 50
        `,
        query_params: { store: HRH_STORE, statuses: ACTIVE_ORDER_STATUSES },
        format: "JSONEachRow",
      })
    ).json();
    const pendingPickQueue = queueRows.map((r) => ({
      order: r.order_number,
      ageHours: r.created_at ? Math.round((Date.now() - new Date(r.created_at).getTime()) / 3600000) : null,
      shortage: toNum(r.total_shortage),
      status: r.order_status_out,
    }));

    // Fulfillment Performance by Courier — replaces the mock's "by Store"
    // (HRH Online is a single online store with no branch dimension in
    // either source table), avg total fulfillment duration per courier.
    // J&T Express (the biggest, ~44% of shipments) runs ~4 days on
    // average vs ~1 day for the others — a real, actionable gap.
    const courierRows = await (
      await client.query({
        query: `
          SELECT coalesce(courier_service, 'No Courier Logged') AS courier, avgIf(total_duration_seconds, total_duration_seconds IS NOT NULL) AS avg_seconds
          FROM xv3.mart_order_fulfilment_journey
          GROUP BY courier
          ORDER BY avg_seconds DESC
        `,
        format: "JSONEachRow",
      })
    ).json();
    const performanceByCourier = courierRows.map((r) => ({ label: r.courier, avgHours: Math.round((toNum(r.avg_seconds) / 3600) * 10) / 10 }));

    // Pick / Dispatch Time Distribution — dateDiff between picking_started_at
    // and dispatch_finalized_at, bucketed in hours. 2,530 of 2,723 rows have
    // both timestamps.
    const DIST_BUCKETS = [
      { label: "≤1h", where: "hrs <= 1" },
      { label: "1-6h", where: "hrs > 1 AND hrs <= 6" },
      { label: "6-24h", where: "hrs > 6 AND hrs <= 24" },
      { label: "24-48h", where: "hrs > 24 AND hrs <= 48" },
      { label: "48h+", where: "hrs > 48" },
    ];
    const distRows = await (
      await client.query({
        query: `
          SELECT ${DIST_BUCKETS.map((b, i) => `countIf(${b.where}) AS b${i}`).join(", ")}
          FROM (
            SELECT dateDiff('second', picking_started_at, dispatch_finalized_at) / 3600.0 AS hrs
            FROM xv3.mart_order_fulfilment_journey
            WHERE picking_started_at IS NOT NULL AND dispatch_finalized_at IS NOT NULL
          )
        `,
        format: "JSONEachRow",
      })
    ).json();
    const distRow = distRows[0] || {};
    const pickDispatchTimeDistribution = DIST_BUCKETS.map((b, i) => ({ label: b.label, value: toNum(distRow[`b${i}`]) }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        snapshotNote:
          "Live fulfillment-operations snapshot for HRH Online — not affected by the Date Range or Channel filter above, since both source tables are operational state, not dated sales transactions.",
        pendingNote: "Orders Requiring Pick / Pick Rate / Pending Picks are scoped to orders still active in the pipeline (Paid, Processing, For Delivery, Pending) — excludes Cancelled and already-Completed orders.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        ordersRequiringPick: { value: ordersRequiringPick },
        pickRate: { value: pickRate },
        pendingPicks: { value: pendingPicks },
        avgPickTime: { value: Math.round(avgPickMinutes), sub: "min" },
        fulfillmentRate: { value: fulfillmentRate },
      },
      funnel,
      pendingPickQueue,
      performanceByCourier,
      pickDispatchTimeDistribution,
    });
  } catch (err) {
    console.error("HRH Orders & Fulfillment API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Orders & Fulfillment data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
