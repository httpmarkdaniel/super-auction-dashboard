import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SubTabNav from "../components/SubTabNav";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart } from "../components/Charts";
import { hrh } from "../theme";
import { formatPct, formatNum } from "../format";

const METHOD_COLOR = { Pickup: hrh.blue, Delivery: hrh.series[2] };

// Small hand-drawn stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons / TrafficConversion.jsx's KPI icons.
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  { key: "overview", label: "Overview" },
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
];

function formatRate(value) {
  return value === null || value === undefined ? "N/A" : formatPct(value);
}

const RATE_COLUMNS_BOTH = [
  { key: "metric", label: "Stage" },
  { key: "pickup", label: "Pickup", render: (r) => formatRate(r.pickup) },
  { key: "delivery", label: "Delivery", render: (r) => formatRate(r.delivery) },
];
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

const TIMING_STAGE_COLUMNS_BOTH = [
  { key: "stage", label: "Stage" },
  { key: "pickup", label: "Pickup (avg)", render: (r) => formatDuration(r.pickup) },
  { key: "delivery", label: "Delivery (avg)", render: (r) => formatDuration(r.delivery) },
];
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
const TIMELINE_COLUMNS_PICKUP = TIMELINE_COLUMNS_BOTH.filter((c) => !["method", "waybillAt", "courier"].includes(c.key));
const TIMELINE_COLUMNS_DELIVERY = TIMELINE_COLUMNS_BOTH.filter((c) => c.key !== "method");

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
export default function PickupAndDelivery({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("overview");

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

  const methodSegments = data?.methodSummary?.map((m) => ({ label: m.method, value: m.orders, color: METHOD_COLOR[m.method] || hrh.muted })) || [];
  const totalMethodOrders = (data?.methodSummary || []).reduce((s, m) => s + m.orders, 0);

  const pickupStage = data?.stageSummary?.find((s) => s.method === "Pickup");
  const deliveryStage = data?.stageSummary?.find((s) => s.method === "Delivery");

  const RATE_LABELS = ["Pack Rate", "Ship Rate", "QC Rate", "Waybill Coverage"];
  const RATE_KEYS = ["packRate", "shipRate", "qcRate", "waybillRate"];
  const rateRowsBoth = RATE_LABELS.map((metric, i) => ({ metric, pickup: pickupStage?.[RATE_KEYS[i]], delivery: deliveryStage?.[RATE_KEYS[i]] }));
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
  const timingStageRowsBoth = STAGE_LABELS.map((stage, i) => ({ stage, pickup: pickupStage?.[STAGE_KEYS[i]], delivery: deliveryStage?.[STAGE_KEYS[i]] }));
  const timingStageRowsPickup = STAGE_LABELS.map((stage, i) => ({ stage, value: pickupStage?.[STAGE_KEYS[i]] })).filter((r) => r.stage !== "QC → Waybill Printed");
  const timingStageRowsDelivery = STAGE_LABELS.map((stage, i) => ({ stage, value: deliveryStage?.[STAGE_KEYS[i]] }));

  const pickupTimeline = (data?.timeline || []).filter((t) => t.method === "Pickup");
  const deliveryTimeline = (data?.timeline || []).filter((t) => t.method === "Delivery");

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Pickup and Delivery
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Pickup and Delivery…" />}
      {error && <ErrorState label={`Couldn't load Pickup and Delivery: ${error}`} />}

      {data && !error && <SubTabNav tabs={SUB_TABS} value={subTab} onChange={setSubTab} />}

      {data && !error && (
        <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
          {data.meta?.methodologyNote}
        </div>
      )}

      {/* ============================== OVERVIEW ============================== */}
      {data && !error && subTab === "overview" && (
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

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            <Panel title="Orders by Method" subtitle="Share of orders — Pickup vs Delivery">
              <DonutChart segments={methodSegments} centerValue={formatNum(totalMethodOrders)} centerLabel="Pickup + Delivery Orders" />
            </Panel>
            <div className="xl:col-span-2">
              <Panel title="Stage Completion Rates" subtitle="Of orders that started picking, % that reached each later stage">
                <DataTable columns={RATE_COLUMNS_BOTH} rows={rateRowsBoth} />
              </Panel>
            </div>
          </div>

          <Panel
            title="Fulfillment Timing"
            subtitle={'Real pick/QC/waybill/pack/dispatch timestamps — no confirmed "delivered to customer" event exists in this data; see Data Quality on the Pickup/Delivery tabs'}
            className="mb-4"
          >
            <DataTable columns={TIMING_STAGE_COLUMNS_BOTH} rows={timingStageRowsBoth} />
          </Panel>

          <Panel title="Picker Productivity" subtitle="Not split by Pickup/Delivery — a picker works both">
            <DataTable columns={PICKER_COLUMNS} rows={data.pickerProductivity} emptyLabel="No picker records in this period." />
          </Panel>
        </>
      )}

      {/* ============================== PICKUP ============================== */}
      {data && !error && subTab === "pickup" && (
        <>
          <KpiRow>
            <KpiCard label="Pickup Orders" icon={ICONS.pickup} value={formatNum(pickupStage?.orders)} sub="with a fulfillment journey record" />
            <KpiCard label="Pack Rate" icon={ICONS.checkCircle} value={formatRate(pickupStage?.packRate)} />
            <KpiCard label="Ship Rate" icon={ICONS.checkCircle} value={formatRate(pickupStage?.shipRate)} />
            <KpiCard label="QC Rate" icon={ICONS.checkCircle} value={formatRate(pickupStage?.qcRate)} />
          </KpiRow>

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

      {/* ============================== DELIVERY ============================== */}
      {data && !error && subTab === "delivery" && (
        <>
          <KpiRow>
            <KpiCard label="Delivery Orders" icon={ICONS.delivery} value={formatNum(deliveryStage?.orders)} sub="with a fulfillment journey record" />
            <KpiCard label="Pack Rate" icon={ICONS.checkCircle} value={formatRate(deliveryStage?.packRate)} />
            <KpiCard label="Ship Rate" icon={ICONS.checkCircle} value={formatRate(deliveryStage?.shipRate)} />
            <KpiCard label="Waybill Coverage" icon={ICONS.checkCircle} value={formatRate(deliveryStage?.waybillRate)} />
          </KpiRow>

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
