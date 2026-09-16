import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SubTabNav from "../components/SubTabNav";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, BarComparisonChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso, formatCompactPeso } from "../format";

const METHOD_COLOR = { Pickup: hrh.blue, Delivery: hrh.series[2], Unknown: hrh.muted };

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
  peso: (
    <Icon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
};

const SUB_TABS = [
  { key: "overview", label: "Overview" },
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
];

const METHOD_TABLE_COLUMNS = [
  { key: "method", label: "Method" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
];

const CATEGORY_COLUMNS = [
  { key: "label", label: "Category" },
  { key: "value", label: "GMV", render: (r) => formatPeso(r.value) },
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

const TIMELINE_COLUMNS_BOTH = [
  { key: "orderId", label: "Order #" },
  { key: "method", label: "Method" },
  { key: "orderPlacedAt", label: "Order Placed", render: (r) => formatTimestamp(r.orderPlacedAt) },
  { key: "pickedAt", label: "Picked", render: (r) => formatTimestamp(r.pickedAt) },
  { key: "packedAt", label: "Packed", render: (r) => formatTimestamp(r.packedAt) },
  { key: "dispatchedAt", label: "Dispatched", render: (r) => formatTimestamp(r.dispatchedAt) },
  { key: "shippedAt", label: "Shipped / Ready", render: (r) => formatTimestamp(r.shippedAt) },
  { key: "courier", label: "Courier", render: (r) => r.courier || "—" },
];
const TIMELINE_COLUMNS_PICKUP = TIMELINE_COLUMNS_BOTH.filter((c) => c.key !== "method" && c.key !== "courier");
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

// Real ClickHouse-backed Pickup and Delivery — see
// api/_hrh-pickup-delivery.js (dispatched from api/hrh-sales-analytics.js
// via ?report=pickupDelivery) for the queries. Pickup vs Delivery is
// checkout_method on xv3.mart_xv3_order_report, joined to sales in
// xv3.mart_net_sales by order_no (direct match only) — orders that don't
// match (mostly TikTok/Shopee, which never populate that table) show as
// Unknown rather than a guess. xv3.mart_order_fulfilment_journey (real
// pick/pack/dispatch timestamps) was investigated and confirmed usable
// for timing, but has no "delivered to customer" event — see Data
// Quality on the Pickup/Delivery tabs.
//
// Three sub-tabs, same pattern as Orders & Fulfillment: Overview (the
// side-by-side comparison) plus a dedicated Pickup and Delivery tab each
// focused on just that method's own numbers.
export default function PickupAndDelivery({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("overview");
  const [trendBucket, setTrendBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, report: "pickupDelivery" });
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
    load(channel, params, controller.signal);
    return () => controller.abort();
  }, [channel, params, ready, load]);

  const methodSegments = data?.methodSummary?.map((m) => ({ label: m.method, value: m.gmv, color: METHOD_COLOR[m.method] || hrh.muted })) || [];
  const trendRows = bucketRows(data?.trend, trendBucket, ["pickupGmv", "deliveryGmv", "pickupOrders", "deliveryOrders"]);

  const pickupSummary = data?.methodSummary?.find((m) => m.method === "Pickup");
  const deliverySummary = data?.methodSummary?.find((m) => m.method === "Delivery");

  const pickupPaymentSegments =
    data?.paymentTypeByMethod?.Pickup?.map((p, i) => ({ label: p.label, value: p.value, color: hrh.series[i % hrh.series.length] })) || [];
  const deliveryPaymentSegments =
    data?.paymentTypeByMethod?.Delivery?.map((p, i) => ({ label: p.label, value: p.value, color: hrh.series[i % hrh.series.length] })) || [];

  const pickupStage = data?.timing?.stageSummary?.find((s) => s.method === "Pickup");
  const deliveryStage = data?.timing?.stageSummary?.find((s) => s.method === "Delivery");
  const STAGE_LABELS = ["Order Placed → Packed", "Packed → Dispatched", "Dispatched → Shipped / Ready", "Order Placed → Shipped / Ready (Total)"];
  const STAGE_KEYS = ["avgOrderToPackSeconds", "avgPackToDispatchSeconds", "avgDispatchToShipSeconds", "avgOrderToShipSeconds"];
  const timingStageRowsBoth = STAGE_LABELS.map((stage, i) => ({ stage, pickup: pickupStage?.[STAGE_KEYS[i]], delivery: deliveryStage?.[STAGE_KEYS[i]] }));
  const timingStageRowsPickup = STAGE_LABELS.map((stage, i) => ({ stage, value: pickupStage?.[STAGE_KEYS[i]] }));
  const timingStageRowsDelivery = STAGE_LABELS.map((stage, i) => ({ stage, value: deliveryStage?.[STAGE_KEYS[i]] }));

  const pickupTimeline = (data?.timing?.timeline || []).filter((t) => t.method === "Pickup");
  const deliveryTimeline = (data?.timing?.timeline || []).filter((t) => t.method === "Delivery");

  // Real daily sparklines — straight off `data.trend` (already date-sorted
  // ascending), no bucketing needed since a card just needs the shape of
  // the trend. AOV/Share have no daily breakdown anywhere in the API
  // response (whole-window ratios), so those KPI cards get an icon only.
  const trendAsc = data?.trend || [];
  const pickupOrdersSpark = trendAsc.map((d) => d.pickupOrders);
  const deliveryOrdersSpark = trendAsc.map((d) => d.deliveryOrders);
  const pickupGmvSpark = trendAsc.map((d) => d.pickupGmv);
  const deliveryGmvSpark = trendAsc.map((d) => d.deliveryGmv);

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
            <KpiCard label="Pickup Orders" icon={ICONS.pickup} value={formatNum(data.kpis.pickupOrders.value)} sparkline={pickupOrdersSpark} />
            <KpiCard label="Delivery Orders" icon={ICONS.delivery} value={formatNum(data.kpis.deliveryOrders.value)} sparkline={deliveryOrdersSpark} />
            <KpiCard label="Pickup GMV" icon={ICONS.peso} value={formatPeso(data.kpis.pickupGmv.value)} sparkline={pickupGmvSpark} />
            <KpiCard label="Delivery GMV" icon={ICONS.peso} value={formatPeso(data.kpis.deliveryGmv.value)} sparkline={deliveryGmvSpark} />
            <KpiCard label="Pickup AOV" icon={ICONS.peso} value={formatPeso(data.kpis.pickupAov.value)} />
            <KpiCard label="Delivery AOV" icon={ICONS.peso} value={formatPeso(data.kpis.deliveryAov.value)} />
          </KpiRow>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Fulfillment Method Split" subtitle="GMV share — Pickup vs Delivery vs Unknown">
              <DonutChart segments={methodSegments} centerValue={formatCompactPeso(data.kpis.pickupGmv.value + data.kpis.deliveryGmv.value)} centerLabel="Pickup + Delivery GMV" />
              <div className="mt-3">
                <DataTable columns={METHOD_TABLE_COLUMNS} rows={data.methodSummary} emptyLabel="No sales in this period." />
              </div>
            </Panel>
            <Panel
              title="Pickup vs Delivery Trend"
              subtitle="GMV by transaction date"
              action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            >
              <BarComparisonChart
                data={trendRows}
                xKey="dateLabel"
                valueFormatter={formatCompactPeso}
                series={[
                  { key: "pickupGmv", name: "Pickup", color: METHOD_COLOR.Pickup },
                  { key: "deliveryGmv", name: "Delivery", color: METHOD_COLOR.Delivery },
                ]}
              />
            </Panel>
          </div>

          <Panel
            title="Fulfillment Timing"
            subtitle={'Real pick/pack/dispatch timestamps — no confirmed "delivered to customer" event exists in this data; see Data Quality on the Pickup/Delivery tabs'}
            className="mb-4"
          >
            <DataTable columns={TIMING_STAGE_COLUMNS_BOTH} rows={timingStageRowsBoth} />
          </Panel>
        </>
      )}

      {/* ============================== PICKUP ============================== */}
      {data && !error && subTab === "pickup" && (
        <>
          <KpiRow>
            <KpiCard label="Pickup Orders" icon={ICONS.pickup} value={formatNum(pickupSummary?.orders)} sparkline={pickupOrdersSpark} />
            <KpiCard label="Pickup GMV" icon={ICONS.peso} value={formatPeso(pickupSummary?.gmv)} sparkline={pickupGmvSpark} />
            <KpiCard label="Pickup AOV" icon={ICONS.peso} value={formatPeso(pickupSummary?.aov)} />
            <KpiCard label="Share of GMV" icon={ICONS.percent} value={formatPct(pickupSummary?.sharePct)} sub="of Pickup + Delivery + Unknown" />
          </KpiRow>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Payment Type" subtitle="Share of GMV within Pickup">
              <DonutChart segments={pickupPaymentSegments} centerValue={formatCompactPeso(pickupSummary?.gmv)} centerLabel="Pickup GMV" />
            </Panel>
            <Panel title="Category Mix" subtitle="Top categories by GMV within Pickup">
              <DataTable columns={CATEGORY_COLUMNS} rows={data.categoryByMethod?.Pickup || []} emptyLabel="No pickup sales in this period." />
            </Panel>
          </div>

          <Panel title="Fulfillment Timing" subtitle="Real pick/pack/dispatch timestamps for Pickup orders" className="mb-4">
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
            <KpiCard label="Delivery Orders" icon={ICONS.delivery} value={formatNum(deliverySummary?.orders)} sparkline={deliveryOrdersSpark} />
            <KpiCard label="Delivery GMV" icon={ICONS.peso} value={formatPeso(deliverySummary?.gmv)} sparkline={deliveryGmvSpark} />
            <KpiCard label="Delivery AOV" icon={ICONS.peso} value={formatPeso(deliverySummary?.aov)} />
            <KpiCard label="Share of GMV" icon={ICONS.percent} value={formatPct(deliverySummary?.sharePct)} sub="of Pickup + Delivery + Unknown" />
          </KpiRow>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Payment Type" subtitle="Share of GMV within Delivery">
              <DonutChart segments={deliveryPaymentSegments} centerValue={formatCompactPeso(deliverySummary?.gmv)} centerLabel="Delivery GMV" />
            </Panel>
            <Panel title="Category Mix" subtitle="Top categories by GMV within Delivery">
              <DataTable columns={CATEGORY_COLUMNS} rows={data.categoryByMethod?.Delivery || []} emptyLabel="No delivery sales in this period." />
            </Panel>
          </div>

          <Panel title="Fulfillment Timing" subtitle="Real pick/pack/dispatch timestamps for Delivery orders" className="mb-4">
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
