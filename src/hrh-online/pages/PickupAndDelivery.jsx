import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { BarComparisonChart, TrendChart, BubbleChart, RateTrendComboChart, DonutChart } from "../components/Charts";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { hrh } from "../theme";
import { formatPct, formatNum } from "../format";
import {
  filterOrders,
  computeKpis,
  computeMethodComparison,
  computeTrend,
  computeJourneyBreakdown,
  computePickerStats,
  computeHeatmap,
  computeCourierStats,
  computePickupReadiness,
  computeAttentionOrders,
  computeFunnel,
  computeTimeDistribution,
  computeStatusBreakdown,
  computeDelayReasons,
  median,
  DAY_LABELS,
} from "../pickupDeliveryCompute";

const PICKUP_COLOR = hrh.blue;
const DELIVERY_COLOR = hrh.accent;
const TIER_COLORS = {
  "Top Performer": hrh.good,
  "On Track": hrh.blue,
  Watch: "#d99a3d",
  "Needs Attention": hrh.bad,
  Unranked: hrh.muted,
};
const STATUS_COLORS = {
  Shipped: hrh.good,
  "Dispatch Finalized": hrh.blue,
  Packing: hrh.accent,
  QC: hrh.series[3],
  Picking: hrh.series[1],
  "Order Placed": hrh.muted,
};

function Icon({ children, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  pickup: (
    <Icon>
      <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  ),
  delivery: (
    <Icon>
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8Z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </Icon>
  ),
  checkCircle: (
    <Icon>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </Icon>
  ),
  cart: (
    <Icon>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Icon>
  ),
  clock: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Icon>
  ),
  zap: (
    <Icon>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
  ),
  box: (
    <Icon>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </Icon>
  ),
  target: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  ),
  users: (
    <Icon>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  layers: (
    <Icon>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  ),
  trending: (
    <Icon>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </Icon>
  ),
};

function formatRate(value) {
  return value === null || value === undefined ? "N/A" : formatPct(value);
}
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds <= 0) return "—";
  const mins = seconds / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}
function formatMinutes(min) {
  return min === null || min === undefined ? "—" : formatDuration(min * 60);
}
function formatTimestamp(raw) {
  if (!raw) return "—";
  const d = new Date(`${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function parseTimestampMs(raw) {
  if (!raw) return null;
  const d = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

const PICKUP_STAGES = [
  { key: "orderPlacedAt", label: "Order Placed" },
  { key: "pickedAt", label: "Picked" },
  { key: "qcAt", label: "QC" },
  { key: "packedAt", label: "Packed" },
  { key: "dispatchedAt", label: "Dispatched" },
  { key: "shippedAt", label: "Shipped / Ready" },
];
const DELIVERY_STAGES = [
  { key: "orderPlacedAt", label: "Order Placed" },
  { key: "pickedAt", label: "Picked" },
  { key: "qcAt", label: "QC" },
  { key: "waybillAt", label: "Waybill" },
  { key: "packedAt", label: "Packed" },
  { key: "dispatchedAt", label: "Dispatched" },
  { key: "shippedAt", label: "Shipped" },
];

// One order's live progress -- same spirit as Auction Dashboard's Active
// Auctions/AuctionProgressBar. `paceSeconds` (this method's own trailing-
// 90-day median Order-Placed-to-Shipped time, from the SAME reference
// used by the KPIs/method comparison above) is the track's right edge --
// a real pace reference, explicitly labeled as such, never a promised
// completion time.
function FulfillmentTrackerCard({ order, nowMs, paceSeconds }) {
  const stages = order.method === "Delivery" ? DELIVERY_STAGES : PICKUP_STAGES;
  const startMs = parseTimestampMs(order.orderPlacedAt);
  if (startMs == null) return null;

  const elapsedMs = Math.max(0, nowMs - startMs);
  const paceMs = (paceSeconds || 0) * 1000;
  const spanMs = Math.max(paceMs, elapsedMs * 1.15, 60000);
  const nowPct = Math.min(100, Math.max(0, (elapsedMs / spanMs) * 100));
  const overdue = paceMs > 0 && elapsedMs > paceMs;
  const trackColor = overdue ? hrh.bad : hrh.accent;

  const stageStates = stages.map((s) => {
    const ts = parseTimestampMs(order[s.key]);
    return { ...s, done: ts != null, pct: ts != null ? Math.min(100, Math.max(0, ((ts - startMs) / spanMs) * 100)) : null, timestamp: order[s.key] };
  });

  return (
    <div className="rounded-md p-3.5" style={{ border: `1px solid ${hrh.border}`, background: hrh.surface }}>
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded"
            style={{
              background: order.method === "Pickup" ? hrh.blueSoft : hrh.accentSoft,
              color: order.method === "Pickup" ? hrh.blueText : hrh.accentText,
            }}
          >
            {order.method}
          </span>
          <span className="text-[13px] font-semibold" style={{ color: hrh.ink }}>
            Order #{order.orderId}
          </span>
        </div>
        {overdue && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded" style={{ background: "#faeaea", color: hrh.bad }}>
            Running longer than pace reference
          </span>
        )}
      </div>

      <div className="relative h-2.5 rounded-full" style={{ background: hrh.bg }}>
        <div className="absolute top-0 left-0 h-full rounded-full transition-[width]" style={{ width: `${nowPct}%`, background: trackColor }} />
        {stageStates
          .filter((s) => s.done)
          .map((s) => (
            <span
              key={s.key}
              title={`${s.label}: ${formatTimestamp(s.timestamp)}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2"
              style={{ left: `${s.pct}%`, background: hrh.surface, borderColor: hrh.ink2 }}
            />
          ))}
        <span
          title={`Current · ${formatDuration(elapsedMs / 1000)} elapsed`}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 pulse-dot"
          style={{ left: `${nowPct}%`, background: trackColor, borderColor: hrh.surface }}
        />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
        {stageStates.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-1 text-[11px]"
            style={{ color: s.done ? hrh.ink2 : hrh.muted }}
            title={s.done ? formatTimestamp(s.timestamp) : "Pending"}
          >
            <span
              className="rounded-full flex items-center justify-center"
              style={{ color: s.done ? hrh.good : hrh.muted, background: s.done ? "transparent" : hrh.bg, border: s.done ? "none" : `1px solid ${hrh.border}` }}
            >
              {s.done ? <Icon size={12}>{ICONS.checkCircle.props.children}</Icon> : <span style={{ width: 12, height: 12, display: "block" }} />}
            </span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="mt-2.5 pt-2 text-[11px]" style={{ borderTop: `1px solid ${hrh.border}`, color: hrh.muted }}>
        Started {formatTimestamp(order.orderPlacedAt)} · {formatDuration(elapsedMs / 1000)} elapsed
        {paceSeconds > 0 && (
          <>
            {" "}
            · Pace reference for {order.method}: {formatDuration(paceSeconds)}
          </>
        )}
        {order.picker && <> · Picker: {order.picker}</>}
      </div>
    </div>
  );
}

function LiveFulfillmentTracker({ orders, nowMs, referenceByMethod }) {
  return (
    <Panel
      title="Live Fulfillment Tracker"
      subtitle="Orders currently in the pipeline, matching the filters above -- always current, independent of the Date Range filter"
      className="mb-4"
    >
      {orders.length === 0 ? (
        <EmptyState label="Nothing currently in progress for this selection." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {orders.map((o) => (
            <FulfillmentTrackerCard key={o.orderId} order={o} nowMs={nowMs} paceSeconds={referenceByMethod[o.method]} />
          ))}
        </div>
      )}
    </Panel>
  );
}

// From order placed to shipped, real counts + % retained at each real
// milestone (skips Waybill so the same funnel works for Pickup too).
function FunnelSteps({ stages }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-center gap-1 min-w-max py-1">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <div
              className="rounded-md px-4 py-3 text-center min-w-[110px]"
              style={{ background: i === 0 ? hrh.navy : hrh.accentSoft, color: i === 0 ? "#fff" : hrh.accentText }}
            >
              <div className="text-[18px] font-bold leading-none mb-1">{formatNum(s.value)}</div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.03em] mb-1" style={{ opacity: 0.85 }}>
                {s.label}
              </div>
              <div className="text-[11px] font-semibold" style={{ opacity: i === 0 ? 0.85 : 1 }}>
                {s.pct == null ? "—" : formatPct(s.pct)}
              </div>
            </div>
            {i < stages.length - 1 && (
              <span className="px-1.5 text-[14px]" style={{ color: hrh.muted }}>
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal stepper for the real pick -> QC -> waybill -> pack -> dispatch
// -> ship pipeline, median (and P90) minutes per stage. When both methods
// are in view it shows both lines per stage (Pickup/Delivery colored to
// match every other chart on this page); a single-method filter shows just
// that method's median + P90.
function JourneyFlow({ breakdown, method }) {
  const showBoth = method === "all";
  const visible = breakdown.filter((stage) => !stage.deliveryOnly || method !== "Pickup");
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-start min-w-max py-1">
        {visible.map((stage, i) => (
          <div key={stage.key} className="flex items-start">
            <div className="flex flex-col items-center text-center w-[128px] shrink-0 px-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center mb-1.5 text-[12px] font-semibold"
                style={{ background: hrh.accentSoft, color: hrh.accentText }}
              >
                {i + 1}
              </div>
              <div className="text-[11.5px] font-semibold mb-1 leading-tight" style={{ color: hrh.ink }}>
                {stage.label}
              </div>
              {showBoth ? (
                <div className="text-[10.5px] leading-snug">
                  <div style={{ color: PICKUP_COLOR }}>Pickup: {stage.Pickup ? formatMinutes(stage.Pickup.medianMinutes) : "—"}</div>
                  <div style={{ color: DELIVERY_COLOR }}>Delivery: {stage.Delivery ? formatMinutes(stage.Delivery.medianMinutes) : "—"}</div>
                </div>
              ) : (
                <div className="text-[10.5px] leading-snug" style={{ color: hrh.ink2 }}>
                  {stage[method] ? formatMinutes(stage[method].medianMinutes) : "—"}
                  {stage[method] && <div style={{ color: hrh.muted }}>P90: {formatMinutes(stage[method].p90Minutes)}</div>}
                </div>
              )}
            </div>
            {i < visible.length - 1 && (
              <div className="flex items-center h-8 px-0.5 text-[13px]" style={{ color: hrh.muted }}>
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function heatColor(minutes, maxMinutes) {
  if (minutes == null || !maxMinutes) return hrh.bg;
  const t = Math.min(1, minutes / maxMinutes);
  if (t < 0.25) return "#e6f4ea";
  if (t < 0.5) return "#fdf3d9";
  if (t < 0.75) return "#fbe4c4";
  return "#faeaea";
}
function heatTextColor(minutes, maxMinutes) {
  if (minutes == null || !maxMinutes) return hrh.muted;
  return minutes / maxMinutes >= 0.75 ? hrh.bad : hrh.ink2;
}
// Median stage duration by day-of-week -- helps spot whether a particular
// stage consistently backs up on specific days (e.g. weekend QC delays).
function StageHeatmap({ heatmap }) {
  const allValues = heatmap.flatMap((s) => s.cells).filter((v) => v != null);
  const maxMinutes = allValues.length ? Math.max(...allValues) : 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse min-w-[460px]">
        <thead>
          <tr>
            <th className="text-left px-2 py-1.5 font-semibold" style={{ color: hrh.ink2 }}>
              Stage
            </th>
            {DAY_LABELS.map((d) => (
              <th key={d} className="px-1.5 py-1.5 font-semibold text-center" style={{ color: hrh.ink2 }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.map((stage) => (
            <tr key={stage.key}>
              <td className="px-2 py-1.5 whitespace-nowrap font-medium" style={{ color: hrh.ink }}>
                {stage.label}
              </td>
              {stage.cells.map((v, i) => (
                <td key={i} className="px-1.5 py-1.5 text-center rounded" style={{ background: heatColor(v, maxMinutes), color: heatTextColor(v, maxMinutes) }}>
                  {v == null ? "—" : formatMinutes(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TREND_METRICS = [
  { key: "median", label: "Median Time" },
  { key: "p90", label: "P90 Time" },
  { key: "completed", label: "Completed Orders" },
];
const ATTENTION_COLUMNS = [
  { key: "orderId", label: "Order #" },
  { key: "method", label: "Method" },
  { key: "picker", label: "Picker", render: (r) => r.picker || "—" },
  { key: "currentStage", label: "Current Stage" },
  { key: "waitingMinutes", label: "Waiting Time", render: (r) => formatMinutes(r.waitingMinutes) },
  {
    key: "issue",
    label: "Issue",
    render: (r) => (
      <span>
        {r.issue}
        {!r.hasBaseline && <span style={{ color: hrh.muted }}> (no historical baseline -- 2h fallback)</span>}
      </span>
    ),
  },
];
const LEADERBOARD_COLUMNS = [
  { key: "rank", label: "#" },
  { key: "picker", label: "Picker Name" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "items", label: "Items", render: (r) => formatNum(r.items) },
  { key: "medianPickMinutes", label: "Median Pick Time", render: (r) => formatMinutes(r.medianPickMinutes) },
  { key: "p90PickMinutes", label: "P90 Pick Time", render: (r) => formatMinutes(r.p90PickMinutes) },
  { key: "itemsPerHr", label: "Items/Hr", render: (r) => (r.itemsPerHr == null ? "—" : r.itemsPerHr.toFixed(1)) },
  {
    key: "tier",
    label: "Tier",
    render: (r) => (
      <span
        className="text-[10.5px] font-semibold uppercase tracking-[0.03em] px-1.5 py-0.5 rounded"
        style={{ background: hrh.bg, color: TIER_COLORS[r.tier] || hrh.muted }}
      >
        {r.tier}
      </span>
    ),
  },
];
const TIMELINE_COLUMNS = [
  { key: "orderId", label: "Order #" },
  { key: "method", label: "Method" },
  { key: "orderPlacedAt", label: "Order Placed", render: (r) => formatTimestamp(r.orderPlacedAt) },
  { key: "pickedAt", label: "Picked", render: (r) => formatTimestamp(r.pickedAt) },
  { key: "qcAt", label: "QC", render: (r) => formatTimestamp(r.qcAt) },
  { key: "waybillAt", label: "Waybill", render: (r) => formatTimestamp(r.waybillAt) },
  { key: "packedAt", label: "Packed", render: (r) => formatTimestamp(r.packedAt) },
  { key: "dispatchedAt", label: "Dispatched", render: (r) => formatTimestamp(r.dispatchedAt) },
  { key: "shippedAt", label: "Shipped / Ready", render: (r) => formatTimestamp(r.shippedAt) },
  { key: "picker", label: "Picker", render: (r) => r.picker || "—" },
  { key: "courier", label: "Courier", render: (r) => r.courier || "—" },
];

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}
function isDateRangeReady(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return Boolean(dateRange.from && dateRange.to && dateRange.from <= dateRange.to);
  }
  return Boolean(dateRange);
}

function FilterSelect({ value, onChange, options, allLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[12px] rounded-md px-2.5 py-1.5 outline-none"
      style={{ border: `1px solid ${hrh.border}`, color: hrh.ink, background: hrh.surface }}
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// Real ClickHouse-backed Pickup and Delivery / "Fulfillment Operations" --
// rebuilt 2026-09-16 to match a supplied mockup layout as closely as real
// data allows. See api/_hrh-pickup-delivery.js and
// src/hrh-online/pickupDeliveryCompute.js for the full data-sourcing and
// aggregation story, including the 3 pieces of the mockup that aren't real
// (Status/Staging Location filters, multi-courier comparison, fixed SLA
// minutes) and how they were adapted.
export default function PickupAndDelivery({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [method, setMethod] = useState("all");
  const [picker, setPicker] = useState("all");
  const [qcStation, setQcStation] = useState("all");
  const [trendMetric, setTrendMetric] = useState("median");
  const [workloadMetric, setWorkloadMetric] = useState("orders");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...p, report: "pickupDelivery" });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    load(params, controller.signal);
    return () => controller.abort();
  }, [params, ready, load]);

  const hasLiveOrders = (data?.inProgress?.length || 0) > 0;
  const tickRef = useRef(null);
  useEffect(() => {
    if (!hasLiveOrders) return undefined;
    tickRef.current = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(tickRef.current);
  }, [hasLiveOrders]);

  // Filter option lists come from the unfiltered window data, so choosing
  // one filter never makes another filter's own options disappear.
  const pickerOptions = useMemo(() => [...new Set((data?.orders || []).map((o) => o.picker).filter(Boolean))].sort(), [data]);
  const qcStationOptions = useMemo(() => [...new Set((data?.orders || []).map((o) => o.qcStation).filter(Boolean))].sort(), [data]);

  const activeFilters = useMemo(() => ({ method, picker, qcStation }), [method, picker, qcStation]);
  const filteredOrders = useMemo(() => (data ? filterOrders(data.orders, activeFilters) : []), [data, activeFilters]);
  const filteredInProgress = useMemo(() => (data ? filterOrders(data.inProgress, activeFilters) : []), [data, activeFilters]);

  const referenceByMethod = useMemo(() => {
    if (!data) return { Pickup: null, Delivery: null };
    return {
      Pickup: median(data.recentOrders.filter((o) => o.method === "Pickup").map((o) => o.orderToShipSeconds)),
      Delivery: median(data.recentOrders.filter((o) => o.method === "Delivery").map((o) => o.orderToShipSeconds)),
    };
  }, [data]);

  const kpis = useMemo(() => (data ? computeKpis(filteredOrders, data.ordersReceived, referenceByMethod) : null), [data, filteredOrders, referenceByMethod]);
  const methodComparison = useMemo(() => computeMethodComparison(filteredOrders, referenceByMethod), [filteredOrders, referenceByMethod]);
  const trend = useMemo(() => computeTrend(filteredOrders), [filteredOrders]);
  const journeyBreakdown = useMemo(() => computeJourneyBreakdown(filteredOrders), [filteredOrders]);
  const pickerStats = useMemo(() => computePickerStats(filteredOrders), [filteredOrders]);
  const heatmap = useMemo(() => computeHeatmap(filteredOrders), [filteredOrders]);
  const courierStats = useMemo(() => computeCourierStats(filteredOrders), [filteredOrders]);
  const readiness = useMemo(() => (data ? computePickupReadiness(filteredInProgress, data.recentOrders) : null), [data, filteredInProgress]);
  const attentionOrders = useMemo(
    () => (data ? computeAttentionOrders(filteredInProgress, data.recentOrders, nowMs) : []),
    [data, filteredInProgress, nowMs]
  );
  const timelineRows = useMemo(() => filteredOrders.slice(0, 100), [filteredOrders]);
  const funnel = useMemo(() => computeFunnel(filteredOrders), [filteredOrders]);
  const timeDistribution = useMemo(() => computeTimeDistribution(filteredOrders), [filteredOrders]);
  const statusBreakdown = useMemo(() => computeStatusBreakdown(filteredOrders), [filteredOrders]);
  const delayReasons = useMemo(() => (data ? computeDelayReasons(filteredOrders, data.recentOrders) : []), [data, filteredOrders]);

  const methodBarData = methodComparison.map((m) => ({
    label: m.method,
    medianFulfillment: m.medianFulfillmentMinutes,
    p90Fulfillment: m.p90FulfillmentMinutes,
    packingDuration: m.packingDurationMinutes,
    orderToPack: m.orderToPackMinutes,
  }));
  const trendSeries =
    trendMetric === "completed"
      ? [
          { key: "pickupCompleted", name: "Pickup", color: PICKUP_COLOR },
          { key: "deliveryCompleted", name: "Delivery", color: DELIVERY_COLOR },
        ]
      : [
          { key: `pickup${trendMetric === "median" ? "Median" : "P90"}`, name: "Pickup", color: PICKUP_COLOR },
          { key: `delivery${trendMetric === "median" ? "Median" : "P90"}`, name: "Delivery", color: DELIVERY_COLOR },
        ];
  const trendValueFormatter = trendMetric === "completed" ? formatNum : (v) => formatMinutes(v);

  const bubbleData = pickerStats
    .filter((p) => p.itemsPerHr != null && p.medianPickMinutes != null)
    .map((p) => ({
      x: p.medianPickMinutes,
      y: p.itemsPerHr,
      z: p.orders,
      label: p.picker,
      sizeLabel: "Orders Picked",
      color: TIER_COLORS[p.tier] || hrh.muted,
    }));

  const workloadData = pickerStats.map((p) => ({ label: p.picker, orders: p.orders, items: p.items }));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Pickup and Delivery
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: hrh.muted }}>
            Picker Performance · Fulfillment Efficiency · Pickup &amp; Delivery
          </div>
        </div>
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Pickup and Delivery…" />}
      {error && <ErrorState label={`Couldn't load Pickup and Delivery: ${error}`} />}

      {data && !error && (
        <>
          {/* ---------------------------- Filter bar ---------------------------- */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex rounded-md overflow-hidden shrink-0" style={{ border: `1px solid ${hrh.border}` }}>
              {["all", "Pickup", "Delivery"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className="text-[12px] font-semibold px-3 py-1.5"
                  style={method === m ? { background: hrh.navy, color: "#fff" } : { background: hrh.surface, color: hrh.ink2 }}
                >
                  {m === "all" ? "All" : m}
                </button>
              ))}
            </div>
            <FilterSelect value={picker} onChange={setPicker} options={pickerOptions} allLabel="All Pickers" />
            <FilterSelect value={qcStation} onChange={setQcStation} options={qcStationOptions} allLabel="All QC Stations" />
            {(method !== "all" || picker !== "all" || qcStation !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setMethod("all");
                  setPicker("all");
                  setQcStation("all");
                }}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-md"
                style={{ border: `1px solid ${hrh.border}`, color: hrh.ink2 }}
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* ------------------------------ Top KPIs ----------------------------- */}
          <KpiRow>
            <KpiCard label="Orders Received" icon={ICONS.cart} value={formatNum(kpis.ordersReceived)} />
            <KpiCard
              label="Completed Orders"
              icon={ICONS.checkCircle}
              value={formatNum(kpis.completedOrders)}
              sub={kpis.completedPct == null ? undefined : `${formatPct(kpis.completedPct)} of Orders Received`}
            />
            <KpiCard label="In Progress" icon={ICONS.clock} value={formatNum(kpis.inProgressCount)} sub="Placed in this window, not yet shipped" />
            <KpiCard label="Median Fulfillment Time" icon={ICONS.clock} value={formatMinutes(kpis.medianFulfillmentMinutes)} />
          </KpiRow>
          <KpiRow>
            <KpiCard label="P90 Fulfillment Time" icon={ICONS.zap} value={formatMinutes(kpis.p90FulfillmentMinutes)} />
            <KpiCard label="Orders Packed" icon={ICONS.box} value={formatNum(kpis.ordersPacked)} />
            <KpiCard label="Orders Shipped / Ready" icon={ICONS.delivery} value={formatNum(kpis.ordersShippedReady)} />
            <KpiCard label="Within Reference Time" icon={ICONS.target} value={formatRate(kpis.referenceHitRate)} sub="vs. each method's own trailing 90-day pace" />
          </KpiRow>

          {/* ------------------------- Comparison + Trend ------------------------ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Pickup vs Delivery Performance" subtitle="Key fulfillment metrics by method, for the selected Date Range">
              <BarComparisonChart
                data={methodBarData}
                series={[
                  { key: "medianFulfillment", name: "Median Fulfillment", color: hrh.series[0] },
                  { key: "p90Fulfillment", name: "P90 Fulfillment", color: hrh.accent },
                  { key: "packingDuration", name: "Packing Duration", color: hrh.series[2] },
                  { key: "orderToPack", name: "Order → Pack", color: hrh.series[1] },
                ]}
                valueFormatter={(v) => formatMinutes(v)}
              />
            </Panel>
            <Panel
              title="Fulfillment Trend"
              subtitle="Daily, for the selected Date Range"
              action={
                <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${hrh.border}` }}>
                  {TREND_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setTrendMetric(m.key)}
                      className="text-[11px] font-semibold px-2.5 py-1"
                      style={trendMetric === m.key ? { background: hrh.navy, color: "#fff" } : { background: hrh.surface, color: hrh.ink2 }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            >
              {trend.length === 0 ? (
                <EmptyState label="No fulfillment activity in this window." />
              ) : (
                <TrendChart data={trend} series={trendSeries} xKey="dateLabel" valueFormatter={trendValueFormatter} />
              )}
            </Panel>
          </div>

          {/* ------------------------------ Journey ------------------------------ */}
          <Panel title="Fulfillment Journey Breakdown" subtitle="Median time per stage (see the table below for P90)" className="mb-4">
            <JourneyFlow breakdown={journeyBreakdown} method={method} />
          </Panel>

          {/* ------------------------ Funnel + Distribution ----------------------- */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title={`Fulfillment Funnel${method === "all" ? "" : ` (${method})`}`} subtitle="From order placed to shipped, for the selected Date Range">
              <FunnelSteps stages={funnel} />
            </Panel>
            <Panel title={`Fulfillment Time Distribution${method === "all" ? "" : ` (${method})`}`} subtitle="Order Placed → Shipped, in minutes">
              {timeDistribution.every((b) => b.orders === 0) ? (
                <EmptyState label="No shipped orders in this window." />
              ) : (
                <RateTrendComboChart
                  data={timeDistribution.map((b) => ({ ...b, dateLabel: b.label }))}
                  bars={[{ key: "orders", name: "Orders", color: hrh.accent }]}
                  rateKey="cumulativePct"
                  rateName="Cumulative %"
                />
              )}
            </Panel>
          </div>

          {/* -------------------------- Status + Delays ---------------------------- */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Orders by Current Status" subtitle="Every order's last reached real milestone">
              {statusBreakdown.length === 0 ? (
                <EmptyState label="No orders for this selection." />
              ) : (
                <DonutChart
                  segments={statusBreakdown.map((s) => ({ label: s.label, value: s.value, color: STATUS_COLORS[s.label] || hrh.muted }))}
                  centerValue={formatNum(filteredOrders.length)}
                  centerLabel="Total Orders"
                />
              )}
            </Panel>
            <Panel
              title="Top Delay Reasons"
              subtitle="Each order's single worst stage vs. its trailing-90-day typical pace, where notably slow"
            >
              {delayReasons.length === 0 ? (
                <EmptyState label="No orders in this window ran notably slower than typical." />
              ) : (
                <BarComparisonChart
                  data={delayReasons}
                  series={[{ key: "value", name: "Orders", color: hrh.bad }]}
                  horizontal
                  valueFormatter={formatNum}
                  height={Math.max(160, delayReasons.length * 40)}
                />
              )}
            </Panel>
          </div>

          {/* --------------------------- Picker overview -------------------------- */}
          <Panel title="Picker Performance Overview" className="mb-4">
            <KpiRow>
              <KpiCard label="Active Pickers" icon={ICONS.users} value={formatNum(pickerStats.length)} />
              <KpiCard label="Orders Picked" icon={ICONS.checkCircle} value={formatNum(pickerStats.reduce((s, p) => s + p.orders, 0))} />
              <KpiCard label="Items Picked" icon={ICONS.layers} value={formatNum(pickerStats.reduce((s, p) => s + p.items, 0))} />
              <KpiCard label="Median Pick Time" icon={ICONS.clock} value={formatMinutes(median(filteredOrders.map((o) => o.orderToPackSeconds)))} />
              <KpiCard
                label="Items / Order"
                icon={ICONS.box}
                value={(() => {
                  const items = pickerStats.reduce((s, p) => s + p.items, 0);
                  const orders = pickerStats.reduce((s, p) => s + p.orders, 0);
                  return orders ? (items / orders).toFixed(1) : "—";
                })()}
              />
              <KpiCard
                label="Picking Throughput"
                icon={ICONS.trending}
                value={(() => {
                  const items = pickerStats.reduce((s, p) => s + p.items, 0);
                  const hrs = filteredOrders.reduce((s, o) => s + (o.orderToPackSeconds > 0 ? o.orderToPackSeconds : 0), 0) / 3600;
                  return hrs > 0 ? `${(items / hrs).toFixed(1)} items/hr` : "—";
                })()}
              />
            </KpiRow>
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Picker Leaderboard" subtitle="Ranked by orders picked, matching the filters above">
              <DataTable
                columns={LEADERBOARD_COLUMNS}
                rows={pickerStats.map((p, i) => ({ ...p, rank: i + 1, id: p.picker }))}
                emptyLabel="No picker activity for this selection."
              />
              {pickerStats.length > 0 && (
                <div className="mt-2 text-[10.5px]" style={{ color: hrh.muted }}>
                  Tier is a quartile ranking of items/hour among this period's own active pickers -- a relative comparison, not a fixed company
                  standard.
                </div>
              )}
            </Panel>
            <Panel title="Picker Efficiency" subtitle="Each bubble = a picker, sized by orders picked">
              {bubbleData.length === 0 ? (
                <EmptyState label="Not enough picker data for this selection." />
              ) : (
                <BubbleChart
                  data={bubbleData}
                  xLabel="Median Picking Time (minutes)"
                  yLabel="Items / Hour"
                  xValueFormatter={(v) => Math.round(v)}
                  yValueFormatter={(v) => v.toFixed(1)}
                />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel
              title="Picker Workload Distribution"
              action={
                <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${hrh.border}` }}>
                  {["orders", "items"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setWorkloadMetric(m)}
                      className="text-[11px] font-semibold px-2.5 py-1 capitalize"
                      style={workloadMetric === m ? { background: hrh.navy, color: "#fff" } : { background: hrh.surface, color: hrh.ink2 }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              }
            >
              {workloadData.length === 0 ? (
                <EmptyState label="No picker activity for this selection." />
              ) : (
                <BarComparisonChart
                  data={workloadData}
                  series={[{ key: workloadMetric, name: workloadMetric === "orders" ? "Orders" : "Items", color: hrh.accent }]}
                  horizontal
                  valueFormatter={formatNum}
                  height={Math.max(180, workloadData.length * 36)}
                />
              )}
            </Panel>
            <Panel title="Stage Duration Heatmap" subtitle="Median duration (minutes) by day of week">
              <StageHeatmap heatmap={heatmap} />
            </Panel>
          </div>

          {/* ------------------------- Readiness + Courier ------------------------ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            {method !== "Delivery" && (
              <Panel
                title="Pickup Readiness"
                badge={
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded" style={{ background: hrh.blueSoft, color: hrh.blueText }}>
                    Pickup
                  </span>
                }
              >
                <KpiRow>
                  <KpiCard label="Orders Ready" icon={ICONS.box} value={formatNum(readiness.ordersReady)} />
                  <KpiCard label="Median Order → Ready" icon={ICONS.clock} value={formatMinutes(readiness.medianOrderToReadyMinutes)} />
                  <KpiCard label="Uncollected Orders" icon={ICONS.pickup} value={formatNum(readiness.uncollectedOrders)} />
                  <KpiCard label="Collected Today" icon={ICONS.checkCircle} value={formatNum(readiness.collectedToday)} />
                </KpiRow>
                <div className="text-[10.5px] mt-1" style={{ color: hrh.muted }}>
                  Live counts, independent of the Date Range filter above · Median Order → Ready is over a trailing 90 days.
                </div>
              </Panel>
            )}
            {method !== "Pickup" && (
              <Panel title="Courier Performance (Delivery)" subtitle="Every real courier appearing in this data">
                {courierStats.length === 0 ? (
                  <EmptyState label="No delivery activity for this selection." />
                ) : (
                  <div className="space-y-3">
                    {courierStats.map((c) => (
                      <div key={c.courier} className="rounded-md p-3" style={{ border: `1px solid ${hrh.border}` }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-[13px]" style={{ color: hrh.ink }}>
                            {c.courier}
                          </span>
                          <span className="text-[11px]" style={{ color: hrh.muted }}>
                            {formatNum(c.orders)} orders
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                          <div>
                            <div style={{ color: hrh.muted }}>Median Dispatch → Ship</div>
                            <div className="font-semibold" style={{ color: hrh.ink }}>
                              {formatMinutes(c.medianDispatchToShipMinutes)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: hrh.muted }}>P90</div>
                            <div className="font-semibold" style={{ color: hrh.ink }}>
                              {formatMinutes(c.p90DispatchToShipMinutes)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: hrh.muted }}>% Shipped</div>
                            <div className="font-semibold" style={{ color: hrh.ink }}>
                              {formatRate(c.pctShipped)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            )}
          </div>

          <LiveFulfillmentTracker orders={filteredInProgress} nowMs={nowMs} referenceByMethod={referenceByMethod} />

          <Panel title="Orders Requiring Attention" subtitle="In-progress orders waiting notably longer than typical for their next stage" className="mb-4">
            <DataTable
              columns={ATTENTION_COLUMNS}
              rows={attentionOrders.map((r) => ({ ...r, id: r.orderId }))}
              emptyLabel="No orders currently flagged -- everything in progress is moving at a normal pace."
            />
          </Panel>

          <Panel title="Recent Fulfillment Timeline" subtitle="Most recent orders matching the filters above" className="mb-4">
            <DataTable
              columns={TIMELINE_COLUMNS}
              rows={timelineRows.map((r) => ({ ...r, id: r.orderId }))}
              paginate
              pageSize={10}
              emptyLabel="No fulfillment records for this selection."
            />
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
                {data.dataQuality.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
