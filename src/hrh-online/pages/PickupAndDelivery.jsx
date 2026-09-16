import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SubTabNav from "../components/SubTabNav";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { hrh } from "../theme";
import { formatPct, formatNum } from "../format";

// Small hand-drawn stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons / TrafficConversion.jsx's KPI icons.
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
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  checkCircle: (
    <Icon>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </Icon>
  ),
};

const SUB_TABS = [
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
];

function formatRate(value) {
  return value === null || value === undefined ? "N/A" : formatPct(value);
}

const RATE_COLUMNS_SINGLE = [
  { key: "metric", label: "Stage" },
  { key: "value", label: "Rate", render: (r) => formatRate(r.value) },
];

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const mins = seconds / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
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

const TIMING_STAGE_COLUMNS_SINGLE = [
  { key: "stage", label: "Stage" },
  { key: "value", label: "Avg Duration", render: (r) => formatDuration(r.value) },
];

const PICKER_COLUMNS = [
  { key: "picker", label: "Picker" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "avgPickSeconds", label: "Avg Pick Time (Order → Packed)", render: (r) => formatDuration(r.avgPickSeconds) },
  { key: "avgTotalSeconds", label: "Avg Total Time (Order → Shipped)", render: (r) => formatDuration(r.avgTotalSeconds) },
];

const TIMELINE_COLUMNS_BOTH = [
  { key: "orderId", label: "Order #" },
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
const TIMELINE_COLUMNS_PICKUP = TIMELINE_COLUMNS_BOTH.filter((c) => !["waybillAt", "courier"].includes(c.key));
const TIMELINE_COLUMNS_DELIVERY = TIMELINE_COLUMNS_BOTH;

// Stage sequence per method for the Live Fulfillment Tracker — Pickup has
// no Waybill step (verified: no shipping label for an in-store pickup).
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

// One order's live progress — same spirit as Auction Dashboard's Active
// Auctions/AuctionProgressBar (a filled track + real, proportionally-
// positioned milestone markers + a live "current" position), scaled down
// for a fixed pick->QC->[waybill]->pack->dispatch->ship sequence instead
// of open-ended bid activity. The track's right edge is this method's own
// average Order-Placed-to-Shipped time (`avgOrderToShipSeconds`, from the
// SAME stageSummary shown elsewhere on this page) — a real pace
// reference, explicitly labeled as an average, never a promised
// completion time. `nowMs` is passed down from the page (re-ticked every
// 60s) so every card's "elapsed" position advances together without
// needing a full data refetch.
function FulfillmentTrackerCard({ order, nowMs }) {
  const stages = order.method === "Delivery" ? DELIVERY_STAGES : PICKUP_STAGES;
  const startMs = parseTimestampMs(order.orderPlacedAt);
  if (startMs == null) return null;

  const avgSpanMs = (order.avgOrderToShipSeconds || 0) * 1000;
  const elapsedMs = Math.max(0, nowMs - startMs);
  const spanMs = Math.max(avgSpanMs, elapsedMs * 1.15, 60000);
  const nowPct = Math.min(100, Math.max(0, (elapsedMs / spanMs) * 100));
  const overdue = avgSpanMs > 0 && elapsedMs > avgSpanMs;
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
            Running longer than average
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
        {avgSpanMs > 0 && <> · Avg pace for {order.method}: {formatDuration(order.avgOrderToShipSeconds)}</>}
        {order.picker && <> · Picker: {order.picker}</>}
      </div>
    </div>
  );
}

// Live Fulfillment Tracker — every order currently in the pipeline for
// ONE method (picking started, not yet shipped), independent of the
// page's Date Range filter, per explicit request ("just like Active
// Auctions"). Re-ticks its own "now" every 60s via the page's shared
// nowMs so cards visibly advance without a full data refetch.
function LiveFulfillmentTracker({ orders, nowMs }) {
  return (
    <Panel
      title="Live Fulfillment Tracker"
      subtitle="Orders currently in the pipeline — independent of the Date Range filter above, always current"
      className="mb-4"
    >
      {orders.length === 0 ? (
        <EmptyState label="Nothing currently in progress for this method — every recent order has already shipped." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {orders.map((o) => (
            <FulfillmentTrackerCard key={o.orderId} order={o} nowMs={nowMs} />
          ))}
        </div>
      )}
    </Panel>
  );
}

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

// Real ClickHouse-backed Pickup and Delivery — fulfillment/operations only
// (see api/_hrh-pickup-delivery.js, dispatched from api/hrh-sales-
// analytics.js via ?report=pickupDelivery). Re-scoped 2026-09-16, per
// explicit request, away from sales data (GMV/AOV/payment type/category)
// toward the real pick -> QC -> waybill -> pack -> dispatch -> ship
// pipeline in xv3.mart_order_fulfilment_journey. Not affected by the
// dashboard's Channel filter — TikTok/Shopee orders never populate either
// source table, so this page is implicitly HMRPH Online only.
//
// No Overview tab (removed per explicit request) — Pick Rate and Picker
// Productivity (neither is method-specific) live at the page level
// instead, always visible regardless of which of the 2 tabs is active.
export default function PickupAndDelivery({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("pickup");
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  // Keeps the Live Fulfillment Tracker's elapsed-time/position genuinely
  // live without a full data refetch — only runs while there's actually
  // something in progress to animate.
  const hasInProgress = (data?.inProgress?.length || 0) > 0;
  const tickRef = useRef(null);
  useEffect(() => {
    if (!hasInProgress) return undefined;
    tickRef.current = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(tickRef.current);
  }, [hasInProgress]);

  const pickupStage = data?.stageSummary?.find((s) => s.method === "Pickup");
  const deliveryStage = data?.stageSummary?.find((s) => s.method === "Delivery");

  const RATE_LABELS = ["Pack Rate", "Ship Rate", "QC Rate", "Waybill Coverage"];
  const RATE_KEYS = ["packRate", "shipRate", "qcRate", "waybillRate"];
  const rateRowsPickup = RATE_LABELS.map((metric, i) => ({ metric, value: pickupStage?.[RATE_KEYS[i]] })).filter((r) => r.metric !== "Waybill Coverage");
  const rateRowsDelivery = RATE_LABELS.map((metric, i) => ({ metric, value: deliveryStage?.[RATE_KEYS[i]] }));

  const STAGE_LABELS = [
    "Order Placed → Picked",
    "Picked → QC",
    "QC → Waybill Printed",
    "Packed → Dispatched",
    "Dispatched → Shipped / Ready",
    "Order Placed → Shipped / Ready (Total)",
  ];
  const STAGE_KEYS = [
    "avgOrderToPackSeconds",
    "avgPickToQcSeconds",
    "avgQcToWaybillSeconds",
    "avgPackToDispatchSeconds",
    "avgDispatchToShipSeconds",
    "avgOrderToShipSeconds",
  ];
  const timingStageRowsPickup = STAGE_LABELS.map((stage, i) => ({ stage, value: pickupStage?.[STAGE_KEYS[i]] })).filter((r) => r.stage !== "QC → Waybill Printed");
  const timingStageRowsDelivery = STAGE_LABELS.map((stage, i) => ({ stage, value: deliveryStage?.[STAGE_KEYS[i]] }));

  const pickupTimeline = (data?.timeline || []).filter((t) => t.method === "Pickup");
  const deliveryTimeline = (data?.timeline || []).filter((t) => t.method === "Delivery");
  const pickupInProgress = (data?.inProgress || []).filter((o) => o.method === "Pickup");
  const deliveryInProgress = (data?.inProgress || []).filter((o) => o.method === "Delivery");

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Pickup and Delivery
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Pickup and Delivery…" />}
      {error && <ErrorState label={`Couldn't load Pickup and Delivery: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="Pickup Orders" icon={ICONS.pickup} value={formatNum(data.kpis.pickupOrders.value)} />
            <KpiCard label="Delivery Orders" icon={ICONS.delivery} value={formatNum(data.kpis.deliveryOrders.value)} />
            <KpiCard
              label="Pick Rate"
              icon={ICONS.percent}
              value={formatPct(data.kpis.pickRate.value)}
              sub={`${formatNum(data.kpis.pickRate.pickedOrders)} of ${formatNum(data.kpis.pickRate.realOrdersReceived)} Real Orders Received`}
            />
          </KpiRow>

          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <SubTabNav tabs={SUB_TABS} value={subTab} onChange={setSubTab} />

          {/* ============================== PICKUP ============================== */}
          {subTab === "pickup" && (
            <>
              <KpiRow>
                <KpiCard label="Pickup Orders" icon={ICONS.pickup} value={formatNum(pickupStage?.orders)} sub="with a fulfillment journey record" />
                <KpiCard label="Pack Rate" icon={ICONS.checkCircle} value={formatRate(pickupStage?.packRate)} />
                <KpiCard label="Ship Rate" icon={ICONS.checkCircle} value={formatRate(pickupStage?.shipRate)} />
                <KpiCard label="QC Rate" icon={ICONS.checkCircle} value={formatRate(pickupStage?.qcRate)} />
              </KpiRow>

              <LiveFulfillmentTracker orders={pickupInProgress} nowMs={nowMs} />

              <Panel title="Stage Completion Rates" subtitle="Pack/Ship/QC — Pickup has no Waybill step (in-store, no shipping label)" className="mb-4">
                <DataTable columns={RATE_COLUMNS_SINGLE} rows={rateRowsPickup} />
              </Panel>

              <Panel title="Fulfillment Timing" subtitle="Real pick/QC/pack/dispatch timestamps for Pickup orders" className="mb-4">
                <DataTable columns={TIMING_STAGE_COLUMNS_SINGLE} rows={timingStageRowsPickup} />
              </Panel>

              <Panel title="Recent Pickup Timeline" subtitle="Most recent pickup orders with a pick/pack/dispatch record" className="mb-4">
                <DataTable columns={TIMELINE_COLUMNS_PICKUP} rows={pickupTimeline} paginate pageSize={10} emptyLabel="No pickup fulfillment records in this period." />
              </Panel>

              {data.dataQuality?.length > 0 && (
                <Panel title="Data Quality Notes" className="mb-4">
                  <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
                    {data.dataQuality.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}

          {/* ============================== DELIVERY ============================== */}
          {subTab === "delivery" && (
            <>
              <KpiRow>
                <KpiCard label="Delivery Orders" icon={ICONS.delivery} value={formatNum(deliveryStage?.orders)} sub="with a fulfillment journey record" />
                <KpiCard label="Pack Rate" icon={ICONS.checkCircle} value={formatRate(deliveryStage?.packRate)} />
                <KpiCard label="Ship Rate" icon={ICONS.checkCircle} value={formatRate(deliveryStage?.shipRate)} />
                <KpiCard label="Waybill Coverage" icon={ICONS.checkCircle} value={formatRate(deliveryStage?.waybillRate)} />
              </KpiRow>

              <LiveFulfillmentTracker orders={deliveryInProgress} nowMs={nowMs} />

              <Panel title="Stage Completion Rates" subtitle="Pack/Ship/QC/Waybill" className="mb-4">
                <DataTable columns={RATE_COLUMNS_SINGLE} rows={rateRowsDelivery} />
              </Panel>

              <Panel title="Fulfillment Timing" subtitle="Real pick/QC/waybill/pack/dispatch timestamps for Delivery orders" className="mb-4">
                <DataTable columns={TIMING_STAGE_COLUMNS_SINGLE} rows={timingStageRowsDelivery} />
              </Panel>

              <Panel title="Recent Delivery Timeline" subtitle="Most recent delivery orders with a pick/pack/dispatch record" className="mb-4">
                <DataTable columns={TIMELINE_COLUMNS_DELIVERY} rows={deliveryTimeline} paginate pageSize={10} emptyLabel="No delivery fulfillment records in this period." />
              </Panel>

              {data.dataQuality?.length > 0 && (
                <Panel title="Data Quality Notes" className="mb-4">
                  <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
                    {data.dataQuality.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}

          <Panel title="Picker Productivity" subtitle="Not split by Pickup/Delivery — a picker works both">
            <DataTable columns={PICKER_COLUMNS} rows={data.pickerProductivity} emptyLabel="No picker records in this period." />
          </Panel>
        </>
      )}
    </div>
  );
}
