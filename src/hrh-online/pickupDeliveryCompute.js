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
function parseTs(raw) {
  if (!raw) return null;
  const d = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
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

export function computeMethodComparison(orders, referenceByMethod) {
  return METHODS.map((method) => {
    const rows = orders.filter((o) => o.method === method);
    const shipped = rows.filter((o) => o.shippedAt);
    const ref = referenceByMethod[method];
    const withinRef = shipped.filter((o) => ref && o.orderToShipSeconds <= ref).length;
    return {
      method,
      orders: rows.length,
      medianFulfillmentMinutes: toMinutes(median(shipped.map((o) => o.orderToShipSeconds))),
      p90FulfillmentMinutes: toMinutes(percentile(shipped.map((o) => o.orderToShipSeconds), 0.9)),
      packingDurationMinutes: toMinutes(median(rows.map((o) => o.packingDurationSeconds))),
      orderToPackMinutes: toMinutes(median(rows.map((o) => o.orderToPackSeconds))),
      referenceHitRate: shipped.length ? (withinRef / shipped.length) * 100 : null,
    };
  });
}

function dateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
}
export function computeTrend(orders) {
  const byDate = new Map();
  for (const o of orders) {
    const key = o.orderPlacedAt.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, { Pickup: [], Delivery: [] });
    byDate.get(key)[o.method]?.push(o);
  }
  return [...byDate.keys()]
    .sort()
    .map((key) => {
      const bucket = byDate.get(key);
      const row = { date: key, dateLabel: dateLabel(key) };
      for (const method of METHODS) {
        const shipped = bucket[method].filter((o) => o.shippedAt);
        const lower = method.toLowerCase();
        row[`${lower}Median`] = toMinutes(median(shipped.map((o) => o.orderToShipSeconds)));
        row[`${lower}P90`] = toMinutes(percentile(shipped.map((o) => o.orderToShipSeconds), 0.9));
        row[`${lower}Completed`] = shipped.length;
      }
      return row;
    });
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

// Pickup Readiness deliberately reads from `liveInProgress` (unfiltered by
// Date Range, same "always current" population as the Live Fulfillment
// Tracker) for the two live counts, and a fixed trailing window
// (`recentOrders`) for the historical median -- neither depends on
// whatever Date Range the user has selected, since "orders ready to
// collect right now" isn't a historical question.
export function computePickupReadiness(liveInProgress, recentOrders) {
  const pickupInProgress = liveInProgress.filter((o) => o.method === "Pickup");
  const ordersReady = pickupInProgress.filter((o) => o.packedAt && !o.shippedAt).length;
  const pickupRecent = recentOrders.filter((o) => o.method === "Pickup");
  const todayIso = new Date().toISOString().slice(0, 10);
  return {
    ordersReady,
    uncollectedOrders: ordersReady,
    medianOrderToReadyMinutes: toMinutes(median(pickupRecent.map((o) => o.orderToPackSeconds))),
    collectedToday: pickupRecent.filter((o) => o.shippedAt && o.shippedAt.slice(0, 10) === todayIso).length,
  };
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

const DISTRIBUTION_BUCKETS = [
  { label: "0-15", min: 0, max: 15 },
  { label: "15-30", min: 15, max: 30 },
  { label: "30-60", min: 30, max: 60 },
  { label: "60-120", min: 60, max: 120 },
  { label: "120-180", min: 120, max: 180 },
  { label: "180+", min: 180, max: Infinity },
];
// Real Order-Placed-to-Shipped minutes, bucketed -- same population as
// medianFulfillmentMinutes/p90FulfillmentMinutes above, just as a
// distribution instead of two summary points.
export function computeTimeDistribution(orders) {
  const minutes = orders
    .filter((o) => o.shippedAt && Number.isFinite(o.orderToShipSeconds) && o.orderToShipSeconds > 0)
    .map((o) => o.orderToShipSeconds / 60)
    .sort((a, b) => a - b);
  let cumulative = 0;
  return DISTRIBUTION_BUCKETS.map((b) => {
    const count = minutes.filter((m) => m >= b.min && m < b.max).length;
    cumulative += count;
    return { label: b.label, orders: count, cumulativePct: minutes.length ? (cumulative / minutes.length) * 100 : 0 };
  });
}

function stageTimeline(o) {
  const atByKey = {
    toPick: o.pickedAt,
    toQc: o.qcAt,
    toWaybill: o.waybillAt,
    toPacking: o.packingStartedAt,
    packingDuration: o.packedAt,
    toDispatch: o.dispatchedAt,
    toShip: o.shippedAt,
  };
  return STAGE_DEFS.filter((s) => !s.deliveryOnly || o.method === "Delivery").map((s) => ({ ...s, at: atByKey[s.key] }));
}

// Every order's last REACHED milestone (not just live ones -- a completed
// order's current status is simply "Shipped"), grouped into the same
// coarse buckets regardless of exactly which timestamp is filled.
const STATUS_BUCKET_BY_STAGE_KEY = {
  toShip: "Shipped",
  toDispatch: "Dispatch Finalized",
  packingDuration: "Packing",
  toPacking: "Packing",
  toWaybill: "QC",
  toQc: "QC",
  toPick: "Picking",
};
export function computeStatusBreakdown(orders) {
  const counts = {};
  for (const o of orders) {
    const timeline = stageTimeline(o);
    let lastIdx = -1;
    timeline.forEach((s, i) => {
      if (s.at) lastIdx = i;
    });
    const bucket = lastIdx === -1 ? "Order Placed" : STATUS_BUCKET_BY_STAGE_KEY[timeline[lastIdx].key] || "Order Placed";
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  const total = orders.length;
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// Real, human-readable label for each stage transition, used only by
// computeDelayReasons below -- the LABELS are this page's own wording for
// what each real transition represents, not a field in the data.
const DELAY_REASON_LABELS = {
  toPick: "Picking Queue Delay",
  toQc: "QC Queue Delay",
  toWaybill: "Waybill Processing Delay",
  toPacking: "Packing Queue Delay",
  packingDuration: "Packing Delay",
  toDispatch: "Dispatch Queue Delay",
  toShip: "Courier Pickup Delay",
};
// For every order in the window (completed or not), finds its single
// WORST stage transition relative to that stage's own trailing-90-day
// median (same method) -- the same >2x-median heuristic used by Orders
// Requiring Attention, applied across the whole window instead of just
// currently-live orders. An order contributes to at most one reason (its
// worst one), so this reads as "what's the leading cause", not a raw
// tally of every slow segment.
export function computeDelayReasons(orders, recentOrders) {
  const stageMedianSeconds = {};
  for (const method of METHODS) {
    const rows = recentOrders.filter((o) => o.method === method);
    stageMedianSeconds[method] = {};
    for (const s of STAGE_DEFS) {
      if (s.deliveryOnly && method === "Pickup") continue;
      stageMedianSeconds[method][s.key] = median(rows.map((o) => o[`${s.key}Seconds`]));
    }
  }
  const counts = {};
  let flagged = 0;
  for (const o of orders) {
    let worst = null;
    for (const s of STAGE_DEFS) {
      if (s.deliveryOnly && o.method === "Pickup") continue;
      const actual = o[`${s.key}Seconds`];
      if (!Number.isFinite(actual) || actual <= 0) continue;
      const ref = stageMedianSeconds[o.method]?.[s.key];
      if (!ref) continue;
      const ratio = actual / ref;
      if (ratio > 2 && (!worst || ratio > worst.ratio)) worst = { key: s.key, ratio };
    }
    if (worst) {
      flagged += 1;
      const label = DELAY_REASON_LABELS[worst.key];
      counts[label] = (counts[label] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value, pct: flagged ? (value / flagged) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// Flags orders whose live wait in their current stage is more than 2x the
// TYPICAL wait for that exact transition (median over `recentOrders`, a
// fixed trailing window, same method) -- a real, data-derived heuristic,
// not an invented SLA minute count. Falls back to a flat 2-hour wait (
// `hasBaseline: false`) only when a stage has no historical data to
// compare against at all.
export function computeAttentionOrders(liveInProgress, recentOrders, nowMs) {
  const stageMedianSeconds = {};
  for (const method of METHODS) {
    const rows = recentOrders.filter((o) => o.method === method);
    stageMedianSeconds[method] = {};
    for (const s of STAGE_DEFS) {
      if (s.deliveryOnly && method === "Pickup") continue;
      stageMedianSeconds[method][s.key] = median(rows.map((o) => o[`${s.key}Seconds`]));
    }
  }

  const results = [];
  for (const o of liveInProgress) {
    const timeline = stageTimeline(o);
    let lastIdx = -1;
    timeline.forEach((s, i) => {
      if (s.at) lastIdx = i;
    });
    const next = timeline[lastIdx + 1];
    if (!next) continue;
    const lastAt = lastIdx >= 0 ? timeline[lastIdx].at : o.orderPlacedAt;
    const lastAtMs = parseTs(lastAt);
    if (lastAtMs == null) continue;
    const waitingSeconds = Math.max(0, (nowMs - lastAtMs) / 1000);
    const refMedian = stageMedianSeconds[o.method]?.[next.key];
    const threshold = refMedian ? refMedian * 2 : 7200;
    if (waitingSeconds <= threshold) continue;
    results.push({
      orderId: o.orderId,
      method: o.method,
      picker: o.picker,
      currentStage: lastIdx >= 0 ? timeline[lastIdx].label : "Order Placed",
      waitingMinutes: waitingSeconds / 60,
      issue: `Long wait before ${next.label}`,
      hasBaseline: Boolean(refMedian),
    });
  }
  return results.sort((a, b) => b.waitingMinutes - a.waitingMinutes);
}
