// Pure, framework-free aggregation for the Pickup & Delivery page. The API
// (api/_hrh-pickup-delivery.js) intentionally returns flat per-order rows
// rather than pre-aggregated SQL results, so every filter (method/picker/QC
// station) can be applied instantly client-side and every derived number
// here recomputes from the same real rows — nothing server-side needs to
// know about the interactive filter state.
//
// Every stage-duration figure filters out non-positive and implausibly
// large values (> MAX_REASONABLE_SECONDS) before taking a median/
// percentile — verified data-quality issue: a handful of journey rows have
// clearly-wrong timestamps (multi-week "durations"), which would otherwise
// blow up any median they touch.
const MAX_REASONABLE_SECONDS = 3 * 24 * 3600;

// The real pick -> QC -> waybill -> pack -> dispatch -> ship sequence (see
// api/_hrh-pickup-delivery.js's own comment for the schema this comes
// from). Waybill only exists for Delivery (verified: 0 for Pickup in every
// window checked — no shipping waybill for an in-store pickup).
export const STAGE_DEFS = [
  { key: "toPick", label: "Picking Started" },
  { key: "toQc", label: "QC" },
  { key: "toWaybill", label: "Waybill Printed", deliveryOnly: true },
  { key: "toPacking", label: "Packing Started" },
  { key: "packingDuration", label: "Packed" },
  { key: "toDispatch", label: "Dispatch Finalized" },
  { key: "toShip", label: "Shipped / Ready" },
];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const METHODS = ["Pickup", "Delivery"];

function quantileOfSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
export function percentile(values, p) {
  const arr = values.filter((v) => Number.isFinite(v) && v > 0 && v <= MAX_REASONABLE_SECONDS).sort((a, b) => a - b);
  return quantileOfSorted(arr, p);
}
export function median(values) {
  return percentile(values, 0.5);
}
export function toMinutes(seconds) {
  return seconds === null || seconds === undefined ? null : seconds / 60;
}

export function filterOrders(orders, { method, picker, qcStation }) {
  return orders.filter((o) => {
    if (method && method !== "all" && o.method !== method) return false;
    if (picker && picker !== "all" && o.picker !== picker) return false;
    if (qcStation && qcStation !== "all" && o.qcStation !== qcStation) return false;
    return true;
  });
}

export function computeKpis(orders, ordersReceived, referenceByMethod) {
  const shipped = orders.filter((o) => o.shippedAt);
  const completedOrders = shipped.length;
  const fulfillmentSeconds = shipped.map((o) => o.orderToShipSeconds);
  const withinReference = shipped.filter((o) => {
    const ref = referenceByMethod[o.method];
    return ref && o.orderToShipSeconds != null && o.orderToShipSeconds <= ref;
  }).length;
  return {
    ordersReceived,
    completedOrders,
    completedPct: ordersReceived ? (completedOrders / ordersReceived) * 100 : null,
    inProgressCount: orders.length - completedOrders,
    medianFulfillmentMinutes: toMinutes(median(fulfillmentSeconds)),
    p90FulfillmentMinutes: toMinutes(percentile(fulfillmentSeconds, 0.9)),
    ordersPacked: orders.filter((o) => o.isPacked).length,
    ordersShippedReady: completedOrders,
    referenceHitRate: completedOrders ? (withinReference / completedOrders) * 100 : null,
  };
}

export function computeJourneyBreakdown(orders) {
  return STAGE_DEFS.map((stage) => {
    const row = { key: stage.key, label: stage.label, deliveryOnly: !!stage.deliveryOnly };
    for (const method of METHODS) {
      if (stage.deliveryOnly && method === "Pickup") {
        row[method] = null;
        continue;
      }
      const values = orders.filter((o) => o.method === method).map((o) => o[`${stage.key}Seconds`]);
      row[method] = { medianMinutes: toMinutes(median(values)), p90Minutes: toMinutes(percentile(values, 0.9)) };
    }
    return row;
  });
}

export function computePickerStats(orders) {
  const byPicker = new Map();
  for (const o of orders) {
    if (!o.picker) continue;
    if (!byPicker.has(o.picker)) byPicker.set(o.picker, []);
    byPicker.get(o.picker).push(o);
  }
  let rows = [...byPicker.entries()].map(([picker, list]) => {
    const items = list.reduce((s, o) => s + (o.itemCount || 0), 0);
    // Same "Order Placed -> Packed" definition this page has used for a
    // picker's own pick time since the original build (order_to_pack_
    // seconds) -- kept for continuity, just switched from an average to a
    // median/P90 pair to match this layout.
    const pickSeconds = list.map((o) => o.orderToPackSeconds).filter((v) => Number.isFinite(v) && v > 0 && v <= MAX_REASONABLE_SECONDS);
    const totalPickHours = pickSeconds.reduce((s, v) => s + v, 0) / 3600;
    return {
      picker,
      orders: list.length,
      items,
      itemsPerOrder: list.length ? items / list.length : null,
      medianPickMinutes: toMinutes(median(list.map((o) => o.orderToPackSeconds))),
      p90PickMinutes: toMinutes(percentile(list.map((o) => o.orderToPackSeconds), 0.9)),
      itemsPerHr: totalPickHours > 0 ? items / totalPickHours : null,
    };
  });

  // Relative tiers -- quartiles of items/hr among THIS filtered set of
  // active pickers only. There is no company-wide throughput standard in
  // the data, so this is a ranking within the current period/filter, not
  // an absolute grade -- labeled as such wherever it's shown.
  const rates = rows.map((r) => r.itemsPerHr).filter(Number.isFinite).sort((a, b) => a - b);
  const p75 = quantileOfSorted(rates, 0.75);
  const p50 = quantileOfSorted(rates, 0.5);
  const p25 = quantileOfSorted(rates, 0.25);
  rows = rows.map((r) => ({
    ...r,
    tier:
      r.itemsPerHr == null || p75 == null
        ? "Unranked"
        : r.itemsPerHr >= p75
        ? "Top Performer"
        : r.itemsPerHr >= p50
        ? "On Track"
        : r.itemsPerHr >= p25
        ? "Watch"
        : "Needs Attention",
  }));
  rows.sort((a, b) => b.orders - a.orders);
  return rows;
}

function jsDowMonFirst(iso) {
  const d = new Date(`${iso.replace(" ", "T")}Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  return day === 0 ? 6 : day - 1; // 0=Mon..6=Sun
}
export function computeHeatmap(orders) {
  return STAGE_DEFS.map((stage) => ({
    key: stage.key,
    label: stage.label,
    cells: DAY_LABELS.map((_, dow) => {
      const values = orders.filter((o) => jsDowMonFirst(o.orderPlacedAt) === dow).map((o) => o[`${stage.key}Seconds`]);
      return toMinutes(median(values));
    }),
  }));
}

// Only one real courier appears in HRH Online's data (Gogo Express,
// verified via system.columns + a distinct-value check) -- this still
// returns whatever couriers actually show up rather than hardcoding that
// name, so the page stays correct if a second one starts appearing.
export function computeCourierStats(orders) {
  const byCourier = new Map();
  for (const o of orders) {
    if (!o.courier) continue;
    if (!byCourier.has(o.courier)) byCourier.set(o.courier, []);
    byCourier.get(o.courier).push(o);
  }
  return [...byCourier.entries()]
    .map(([courier, list]) => {
      const shipped = list.filter((o) => o.shippedAt);
      return {
        courier,
        orders: list.length,
        medianDispatchToShipMinutes: toMinutes(median(list.map((o) => o.toShipSeconds))),
        p90DispatchToShipMinutes: toMinutes(percentile(list.map((o) => o.toShipSeconds), 0.9)),
        pctShipped: list.length ? (shipped.length / list.length) * 100 : null,
      };
    })
    .sort((a, b) => b.orders - a.orders);
}

export function computeFunnel(orders) {
  const total = orders.length;
  const stages = [
    { label: "Orders Placed", value: total },
    { label: "Picked", value: orders.filter((o) => o.pickedAt).length },
    { label: "QC Completed", value: orders.filter((o) => o.qcAt).length },
    { label: "Packed", value: orders.filter((o) => o.packedAt).length },
    { label: "Shipped", value: orders.filter((o) => o.shippedAt).length },
  ];
  return stages.map((s) => ({ ...s, pct: total ? (s.value / total) * 100 : null }));
}
