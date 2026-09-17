import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal, { ModalRow } from "../components/Modal";
import SubTabNav from "../components/SubTabNav";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { FulfillmentTrendComboChart, BarComparisonChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso } from "../format";
// Pickup and Delivery — MOVED here from its own standalone sidebar page
// per explicit request (2026-09-17); the component itself is unchanged
// (own fetch/state/filters, own Pickup/Delivery method toggle preserved),
// just rendered as a sub-tab instead of a top-level page. See nav.js/
// HrhOnlineApp.jsx for the sidebar removal.
import PickupAndDelivery from "./PickupAndDelivery";

// Small hand-drawn stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons / TrafficConversion.jsx's KPI icons — kept local
// to this page rather than imported cross-page, since neither file exports
// them as a shared module.
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  receipt: (
    <Icon>
      <path d="M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-2 2-3-2Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </Icon>
  ),
  checkCircle: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  alertTriangle: (
    <Icon>
      <path d="m10.29 3.86-8.18 14.14A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  ),
  clock: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  ),
  cart: (
    <Icon>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Icon>
  ),
};

const LIFECYCLE_COLOR = {
  Fulfilled: hrh.good,
  Cancelled: hrh.bad,
  "Still Awaiting Fulfillment / No Invoice": hrh.muted,
};
const ORDER_STATUS_PILL = {
  Paid: { bg: hrh.accentSoft, text: hrh.accentText },
  Processing: { bg: hrh.blueSoft, text: hrh.blueText },
  Cancelled: { bg: "#faeaea", text: hrh.bad },
};
const PAYMENT_STATUS_PILL = {
  Paid: { bg: "#e6f4ea", text: hrh.good },
  Pending: { bg: "#f0f1f5", text: hrh.ink2 },
};

const SUB_TABS = [
  { key: "fulfillment", label: "Fulfillment" },
  { key: "pickupDelivery", label: "Pickup & Delivery" },
  { key: "warehouseOps", label: "Warehouse Operations" },
  { key: "methodology", label: "Methodology" },
];

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const mins = seconds / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

const PICKER_COLUMNS = [
  { key: "picker", label: "Picker" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "items", label: "Items Picked", render: (r) => formatNum(r.items) },
  { key: "avgPickSeconds", label: "Avg Pick Time", render: (r) => formatDuration(r.avgPickSeconds) },
];

const QC_COLUMNS = [
  { key: "station", label: "QC Station" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "avgQcSeconds", label: "Avg QC Time", render: (r) => formatDuration(r.avgQcSeconds) },
];

function safeDivide(a, b) {
  return b ? a / b : 0;
}

// "Compare to" — an explicit, independent choice of comparison basis for
// every scorecard's bottom-of-card delta, decoupled from the Date Range
// filter itself — same control/pattern as Customer Analytics and
// Executive Overview (see resolveComparisonWindow in
// api/_hrh-orders-fulfillment.js / api/_hrh-barcode-analytics.js): Day
// shifts the whole selected window back 1 day, Week back 7 days, Month
// back 1 calendar month, regardless of the window's own length or type.
// One control drives every sub-tab (Fulfillment/Warehouse Operations/
// Cancellation/Returns all fetch with the same compareTo).
const COMPARE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatIsoDateLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
}
function effectivePeriodLabel(period) {
  if (!period) return null;
  const from = formatIsoDateLabel(period.from);
  const to = formatIsoDateLabel(period.to);
  if (!from || !to) return null;
  return from === to ? from : `${from} – ${to}`;
}

function Pill({ text, map }) {
  const c = map[text] || { bg: "#f0f1f5", text: hrh.ink2 };
  return (
    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.text }}>
      {text || "—"}
    </span>
  );
}

// Horizontal bar row for the Order Lifecycle breakdown — a plain
// proportional bar (not a shared chart component) since each row needs
// its own fill color, matching the reference report's "list of KPI
// numbers" presentation more closely than a donut would.
function LifecycleBarRow({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-[220px] shrink-0 text-[12.5px]" style={{ color: hrh.ink }}>
        {label}
      </div>
      <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ background: hrh.bg }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%" }} />
      </div>
      <div className="w-[64px] text-right text-[12.5px] font-semibold tabular-nums" style={{ color: hrh.ink }}>
        {formatNum(value)}
      </div>
    </div>
  );
}


const UNRESOLVED_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "orderStatus", label: "Order Status", render: (r) => <Pill text={r.orderStatus} map={ORDER_STATUS_PILL} /> },
  { key: "paymentStatus", label: "Payment", render: (r) => <Pill text={r.paymentStatus} map={PAYMENT_STATUS_PILL} /> },
  { key: "customer", label: "Customer" },
  { key: "orderDate", label: "Order Date" },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "probableInvoice", label: "Probable Invoice", render: (r) => r.probableInvoice || "—" },
  { key: "reason", label: "Reason / Flag" },
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

// Real ClickHouse-backed Orders & Fulfillment — see
// api/_hrh-orders-fulfillment.js (dispatched from api/hrh-sales-analytics.js
// via ?report=ordersFulfillment) for the full methodology, ported from the
// HMR MART / HMRPH ONLINE report. Fulfillment / Pickup & Delivery /
// Warehouse Operations / Methodology live here; Cancellation and Returns
// moved to the standalone Returns and Cancellation page (see nav.js) —
// every number is live from the API, never the report's own frozen
// figures. HMRPH Online only for the Fulfillment tab (TikTok/Shopee
// orders don't flow through the same order source table). No Pick Rate
// anywhere — HMR MART runs its own WMS, PickApp picking_status isn't
// meaningful here.
export default function OrdersFulfillment({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("fulfillment");
  const [compareTo, setCompareTo] = useState("week");
  const [fulfillmentBucket, setFulfillmentBucket] = useState("day");
  const [warehouseOpsBucket, setWarehouseOpsBucket] = useState("day");
  const [activeModal, setActiveModal] = useState(null); // "received" | "completion" | "cancelled" | "awaiting" | null

  // Warehouse Operations — separate fetch/state: a different report
  // (?report=barcodeAnalytics, moved here from the old standalone Barcode
  // Analytics sidebar page) with no Channel dimension at all, only Date
  // Range, so it's kept independent of the Fulfillment tab's own
  // channel-scoped fetch rather than merged into one payload.
  const [whData, setWhData] = useState(null);
  const [whLoading, setWhLoading] = useState(true);
  const [whError, setWhError] = useState(null);

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, cmp, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, compareTo: cmp, report: "ordersFulfillment" });
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

  const loadWarehouseOps = useCallback(async (p, cmp, signal) => {
    setWhLoading(true);
    setWhError(null);
    try {
      const qs = new URLSearchParams({ ...p, compareTo: cmp, report: "barcodeAnalytics" });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setWhData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setWhError(err instanceof Error ? err.message : String(err));
    } finally {
      setWhLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    load(channel, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [channel, params, compareTo, ready, load]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    loadWarehouseOps(params, compareTo, controller.signal);
    return () => controller.abort();
  }, [params, compareTo, ready, loadWarehouseOps]);

  const fulfillmentPerf = bucketRows(data?.fulfillmentTrend, fulfillmentBucket, ["received", "fulfilled", "cancelled", "awaiting"]).map((r) => ({
    ...r,
    completionRate: safeDivide(r.fulfilled, r.received) * 100,
  }));
  // Raw (never re-bucketed) daily arrays, for KPI card sparklines — the
  // bucketed arrays above follow whatever Day/Week/Month pill the user has
  // selected, which would make a sparkline jump around independent of the
  // number it's next to.
  const rawFulfillmentTrend = data?.fulfillmentTrend || [];
  const rawDailyVolume = whData?.dailyVolume || [];
  const completionRateSpark = rawFulfillmentTrend.map((r) => safeDivide(r.fulfilled, r.received) * 100);
  const whDailyVolume = bucketRows(whData?.dailyVolume, warehouseOpsBucket, ["orders", "picked", "packed", "shipped"]);
  const lifecycleCancelledInDenominator = data?.lifecycle?.find((l) => l.label === "Cancelled")?.value ?? 0;
  const periodLabel = data?.meta?.current ? `${data.meta.current.from} – ${data.meta.current.to}` : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Orders &amp; Fulfillment
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.muted }}>
              Compare to
            </span>
            <TrendBucketPills value={compareTo} onChange={setCompareTo} options={COMPARE_OPTIONS} />
          </div>
          {data?.meta?.current && !data.meta?.unsupportedChannel && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: hrh.ink2 }}>
              {effectivePeriodLabel(data.meta.current)}
              <span className="font-normal" style={{ color: hrh.muted }}>
                {" "}
                vs {effectivePeriodLabel(data.meta.previous)}
              </span>
            </span>
          )}
        </div>
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Orders & Fulfillment…" />}
      {error && <ErrorState label={`Couldn't load Orders & Fulfillment: ${error}`} />}

      {data && !error && (
        <SubTabNav tabs={SUB_TABS} value={subTab} onChange={setSubTab} />
      )}

      {data && !error && subTab === "fulfillment" && data.meta?.unsupportedChannel && (
        <ErrorState label={data.meta.limitationNote} />
      )}

      {/* ============================== FULFILLMENT ============================== */}
      {data && !error && subTab === "fulfillment" && !data.meta?.unsupportedChannel && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <KpiRow>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("received")}>
              <KpiCard
                label="Real Orders Received"
                icon={ICONS.receipt}
                value={formatNum(data.kpis.realOrdersReceived.value)}
                delta={data.kpis.realOrdersReceived.delta}
                previousLabel={formatNum(data.kpis.realOrdersReceived.previous)}
                sub={data.kpis.realOrdersReceived.sub}
                sparkline={rawFulfillmentTrend.map((r) => r.received)}
              />
            </button>
            <KpiCard
              label="Fulfilled Orders"
              icon={ICONS.checkCircle}
              value={formatNum(data.kpis.fulfilledOrders.value)}
              delta={data.kpis.fulfilledOrders.delta}
              previousLabel={formatNum(data.kpis.fulfilledOrders.previous)}
              sparkline={rawFulfillmentTrend.map((r) => r.fulfilled)}
            />
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("completion")}>
              <KpiCard
                label="Completion Rate"
                icon={ICONS.percent}
                value={formatPct(data.kpis.completionRate.value)}
                delta={data.kpis.completionRate.delta}
                previousLabel={formatPct(data.kpis.completionRate.previous)}
                sparkline={completionRateSpark}
              />
            </button>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("cancelled")}>
              <KpiCard
                label="Cancelled Orders"
                icon={ICONS.alertTriangle}
                value={formatNum(data.kpis.cancelledOrders.value)}
                delta={data.kpis.cancelledOrders.delta}
                previousLabel={formatNum(data.kpis.cancelledOrders.previous)}
                sparkline={rawFulfillmentTrend.map((r) => r.cancelled)}
              />
            </button>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("awaiting")}>
              <KpiCard
                label="Still Awaiting Fulfillment"
                icon={ICONS.clock}
                value={formatNum(data.kpis.stillAwaitingFulfillment.value)}
                delta={data.kpis.stillAwaitingFulfillment.delta}
                previousLabel={formatNum(data.kpis.stillAwaitingFulfillment.previous)}
                sparkline={rawFulfillmentTrend.map((r) => r.awaiting)}
              />
            </button>
          </KpiRow>

          <Panel title="Order Lifecycle" subtitle="Reconciles to Real Orders Received above" className="mb-4">
            {data.lifecycle.map((l) => (
              <LifecycleBarRow key={l.label} label={l.label} value={l.value} total={data.kpis.realOrdersReceived.value} color={LIFECYCLE_COLOR[l.label] || hrh.muted} />
            ))}
          </Panel>

          <Panel
            title="Fulfillment Performance"
            subtitle="Fulfilled / Cancelled / Awaiting + Completion Rate, by order date"
            action={<TrendBucketPills value={fulfillmentBucket} onChange={setFulfillmentBucket} />}
            className="mb-4"
          >
            <FulfillmentTrendComboChart data={fulfillmentPerf} />
          </Panel>

          <div id="unresolved-orders-section">
            <Panel title="Unfulfilled / Unresolved Orders" subtitle="Still awaiting fulfillment after both direct and probable invoice matching" className="mb-4">
              <DataTable
                columns={UNRESOLVED_COLUMNS}
                rows={data.unresolvedOrders}
                paginate
                pageSize={10}
                emptyLabel="Every real order this period has a direct or probable invoice match."
              />
            </Panel>
          </div>
        </>
      )}

      {/* ============================== PICKUP & DELIVERY ============================== */}
      {subTab === "pickupDelivery" && <PickupAndDelivery filters={filters} />}

      {/* ============================== WAREHOUSE OPERATIONS ============================== */}
      {subTab === "warehouseOps" && (
        <>
          {whLoading && !whData && <LoadingState label="Loading Warehouse Operations…" />}
          {whError && <ErrorState label={`Couldn't load Warehouse Operations: ${whError}`} />}

          {whData && !whError && (
            <>
              <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
                {whData.meta?.methodologyNote}
              </div>

              <KpiRow>
                <KpiCard
                  label="Orders Processed"
                  icon={ICONS.cart}
                  value={formatNum(whData.kpis.ordersProcessed.value)}
                  delta={whData.kpis.ordersProcessed.delta}
                  previousLabel={formatNum(whData.kpis.ordersProcessed.previous)}
                  sparkline={rawDailyVolume.map((r) => r.orders)}
                />
                {/* No daily breakdown exists for these 3 averages (whData has
                    no per-day pick/QC/dispatch time series) — icon only,
                    no sparkline, rather than a fabricated trend. Delta is
                    still a plain %-change vs the "Compare to" period same
                    as every other card — lower is better for a duration,
                    but the sign/color convention is left consistent
                    dashboard-wide rather than special-cased here. */}
                <KpiCard
                  label="Avg Pick Time"
                  icon={ICONS.clock}
                  value={formatDuration(whData.kpis.avgPickTime.value)}
                  delta={whData.kpis.avgPickTime.delta}
                  previousLabel={formatDuration(whData.kpis.avgPickTime.previous)}
                  sub="pick → QC"
                />
                <KpiCard
                  label="Avg QC Time"
                  icon={ICONS.clock}
                  value={formatDuration(whData.kpis.avgQcTime.value)}
                  delta={whData.kpis.avgQcTime.delta}
                  previousLabel={formatDuration(whData.kpis.avgQcTime.previous)}
                  sub="QC → waybill"
                />
                <KpiCard
                  label="Avg Pick-to-Dispatch"
                  icon={ICONS.clock}
                  value={formatDuration(whData.kpis.avgPickToDispatch.value)}
                  delta={whData.kpis.avgPickToDispatch.delta}
                  previousLabel={formatDuration(whData.kpis.avgPickToDispatch.previous)}
                  sub="picking start → dispatch"
                />
              </KpiRow>

              <Panel
                title="Daily Fulfillment Volume"
                subtitle="Orders placed / picked / packed / shipped, by order date"
                action={<TrendBucketPills value={warehouseOpsBucket} onChange={setWarehouseOpsBucket} />}
                className="mb-4"
              >
                <BarComparisonChart
                  data={whDailyVolume}
                  xKey="dateLabel"
                  valueFormatter={formatNum}
                  series={[
                    { key: "orders", name: "Orders Placed", color: hrh.series[0] },
                    { key: "picked", name: "Picked", color: hrh.blue },
                    { key: "packed", name: "Packed", color: hrh.series[2] },
                    { key: "shipped", name: "Shipped", color: hrh.accent },
                  ]}
                />
              </Panel>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                <Panel title="Picker Performance" subtitle="Ranked by orders picked">
                  <DataTable columns={PICKER_COLUMNS} rows={whData.pickerPerformance} paginate pageSize={10} emptyLabel="No picking activity in this period." />
                </Panel>
                <Panel title="QC Station Throughput" subtitle="Ranked by orders processed">
                  <DataTable columns={QC_COLUMNS} rows={whData.qcThroughput} emptyLabel="No QC activity in this period." />
                </Panel>
              </div>

              <Panel title="Pick-to-Dispatch Time Distribution" subtitle="Picking start to dispatch finalized" className="mb-4">
                <BarComparisonChart
                  data={whData.pickToDispatchDistribution}
                  xKey="label"
                  valueFormatter={formatNum}
                  series={[{ key: "value", name: "Orders", color: hrh.accent }]}
                />
              </Panel>

              {whData.dataQuality?.length > 0 && (
                <Panel title="Data Quality Notes">
                  <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
                    {whData.dataQuality.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}
        </>
      )}

      {/* ============================== METHODOLOGY ============================== */}
      {data && !error && subTab === "methodology" && (
        <>
          <Panel title="Data Sources" className="mb-4">
            <DataTable
              columns={[
                { key: "table", label: "Table" },
                { key: "usedFor", label: "Used For" },
                { key: "notes", label: "Notes", maxWidth: 420 },
              ]}
              rows={[
                { table: "xv3.mart_xv3_order_report", usedFor: "Orders, cancellations, customer/checkout detail", notes: "One row per order; occasional exact-duplicate CDC rows — deduped by order_number." },
                { table: "xv3.mart_net_sales", usedFor: "Invoices (fulfillment), returns", notes: "Line-item level; summed by invoice_id/invoice_no for invoice totals." },
                { table: "xv3.sales_order_item", usedFor: "Item names, when order-item enrichment is needed", notes: "Joined via order_id; can contain duplicate line rows for the same item." },
              ]}
            />
            <p className="text-[11.5px] mt-2" style={{ color: hrh.muted }}>
              Store: HRH ONLINE · Channel: HMRPH ONLINE only for Fulfillment/Cancellation (TikTok and Shopee excluded — see Channel Scope below) · ClickHouse HMR Datawarehouse
            </p>
          </Panel>

          <Panel title="Key Definitions" className="mb-4">
            <div className="space-y-3 text-[12.5px]" style={{ color: hrh.ink2 }}>
              <div>
                <div className="font-semibold mb-0.5" style={{ color: hrh.ink }}>
                  "Real Orders Received"
                </div>
                Raw deduped orders, minus dev/test-tagged orders, minus confirmed customer-initiated cancellations (a
                stated reason other than an "Expired Order" auto-cancel), minus genuine duplicate retries
                (same customer + same day + same item). System-Initiated (Expired) and No-Reason-Logged
                cancellations stay inside this count as real demand that entered the funnel.
              </div>
              <div>
                <div className="font-semibold mb-0.5" style={{ color: hrh.ink }}>
                  "Fulfilled"
                </div>
                An order counts as fulfilled if its order_no is found directly in xv3.mart_net_sales (sales_channel
                = HMRPH ONLINE, transaction_type = sale), or if a "probable match" is found: same customer name
                (normalized) + invoice dated within roughly −1 to +10 days of the order + invoice amount at or below
                the order amount by no more than ₱500 (a plausible delivery-fee gap). order_status is never used for
                this — it doesn't reliably update once an order is actually sold.
              </div>
              <div>
                <div className="font-semibold mb-0.5" style={{ color: hrh.ink }}>
                  Pick rate — intentionally excluded
                </div>
                HMR MART fulfills through its own WMS, not the PickApp flow used by BOPIS branches, so
                picking_status on these orders is not meaningful and is left out of every metric here.
              </div>
              <div>
                <div className="font-semibold mb-0.5" style={{ color: hrh.ink }}>
                  Cancellation Reasons — 10 categories
                </div>
                Built from the free-text cancellation_reason field: Expired — No Payment (1 Day), Expired — No
                Payment (2 Days), Expired — No Customer Confirmation (2 Days), Expired — Other, Payment Issues,
                Technical / Website Issues, Changed Mind / No Longer Needed, Order Modification, No Reason Logged,
                Other / Miscellaneous. The 4 Expired sub-categories are still one "System-Initiated" family for
                every other metric on this page (Cancellation Rate, System-Initiated Share, etc.) — only the
                Cancellation Reasons table's own display is broken down further.
              </div>
              <div>
                <div className="font-semibold mb-0.5" style={{ color: hrh.ink }}>
                  Return Reasons — 10 categories
                </div>
                Built from invoice_remarks (free text, inconsistent RET/REF prefixes and spelling): Cancelled by
                Customer, Refused/Could Not Deliver (Consignee), Not Working/Defective, Damaged Items, No Actual
                Items (Shortage), Wrong Item/Order Error, Wrong Size, Address Issue, No Reason Logged, Other/
                Miscellaneous.
              </div>
            </div>
          </Panel>

          <Panel title="Channel Scope" className="mb-4">
            <p className="text-[12.5px]" style={{ color: hrh.ink2 }}>
              xv3.mart_xv3_order_report only ever contains HMRPH Online's own website orders — TikTok and Shopee
              orders never flow through it (verified against live data), so Fulfillment and Cancellation are scoped
              to HMRPH Online regardless of the page's Channel filter. Returns uses xv3.mart_net_sales directly and
              isn't limited the same way.
            </p>
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Known Data Quality Issues">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
                {data.dataQuality.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      {data && !data.meta?.unsupportedChannel && (
        <>
          <Modal
            open={activeModal === "received"}
            onClose={() => setActiveModal(null)}
            title="Orders Received — Breakdown"
            subtitle={`How raw orders become Real Orders Received — HMRPH Online, ${periodLabel}`}
          >
            <ModalRow label="Total Orders (raw, deduped)" value={formatNum(data.kpis.realOrdersReceived.raw)} />
            <ModalRow label="Dev/test orders (tagged)" value={formatNum(data.kpis.realOrdersReceived.devTestExcluded)} subtract />
            <ModalRow label="Confirmed customer-initiated cancellations" value={formatNum(data.kpis.realOrdersReceived.customerInitiatedExcluded)} subtract />
            <ModalRow label="Duplicate retry attempts" value={formatNum(data.kpis.realOrdersReceived.duplicateRetriesExcluded)} subtract />
            <ModalRow label="Real Orders Received" value={formatNum(data.kpis.realOrdersReceived.value)} total />
            <p className="text-[11.5px] mt-3 pt-3" style={{ borderTop: `1px dashed ${hrh.border}`, color: hrh.muted }}>
              Dev/test = orders cancelled with reason "Dev test"/"Devtest"/"devtest", or placed under customer name
              "TEST ACCOUNT". Confirmed customer-initiated = cancelled with a stated reason other than an "Expired
              Order" auto-cancel — these are the same orders shown as "Re-ordered" in the Cancelled Orders
              breakdown below. System-Initiated (Expired) and No-Reason-Logged cancellations stay inside Real
              Orders Received, same as real demand that entered the funnel — see Order Lifecycle above.
            </p>
          </Modal>

          <Modal
            open={activeModal === "completion"}
            onClose={() => setActiveModal(null)}
            title="Completion Rate — Breakdown"
            subtitle={`${formatNum(data.kpis.fulfilledOrders.value)} Fulfilled ÷ ${formatNum(data.kpis.realOrdersReceived.value)} Real Orders Received`}
          >
            <ModalRow label="Real Orders Received" value={formatNum(data.kpis.realOrdersReceived.value)} />
            <ModalRow label="Fulfilled (direct invoice or probable match)" value={formatNum(data.kpis.fulfilledOrders.value)} />
            <ModalRow label="Cancelled (stays inside Real Orders Received)" value={formatNum(lifecycleCancelledInDenominator)} />
            <ModalRow label="Still Awaiting Fulfillment / No Invoice" value={formatNum(data.kpis.stillAwaitingFulfillment.value)} />
            <ModalRow label="Completion Rate" value={formatPct(data.kpis.completionRate.value)} total />
            <p className="text-[11.5px] mt-3 pt-3" style={{ borderTop: `1px dashed ${hrh.border}`, color: hrh.muted }}>
              Fulfilled = order_no matched directly in xv3.mart_net_sales, plus probable matches by customer name +
              date + fee-adjusted amount. "Cancelled" here is only the subset that stays inside Real Orders Received
              — the broader "Cancelled Orders" KPI card also includes confirmed customer-initiated/"Re-ordered"
              cancellations already excluded from the denominator above. Pick rate intentionally excluded — HMR
              MART fulfills via its own WMS.
            </p>
          </Modal>

          <Modal open={activeModal === "cancelled"} onClose={() => setActiveModal(null)} title="Cancelled Orders — Breakdown" subtitle={`HMRPH Online, ${periodLabel}`}>
            <ModalRow label="Raw Cancelled (all, incl. dev/test)" value={formatNum(data.kpis.cancelledOrders.raw)} />
            <ModalRow label="Dev/test cancelled" value={formatNum(data.kpis.cancelledOrders.devTestExcluded)} subtract />
            <ModalRow label="Real Cancelled — All Types" value={formatNum(data.kpis.cancelledOrders.allRealCancelled)} />
            <ModalRow label="Re-ordered (customer cancelled, then reordered the same item)" value={formatNum(data.kpis.cancelledOrders.reordered)} subtract />
            <ModalRow label="True Cancellation (Cancelled)" value={formatNum(data.kpis.cancelledOrders.value)} total />
            <ModalRow label="Cancellation Rate (True Cancellation ÷ Real Orders Received)" value={formatPct(data.kpis.cancelledOrders.cancellationRate)} />
            <p className="text-[11.5px] mt-3 pt-3" style={{ borderTop: `1px dashed ${hrh.border}`, color: hrh.muted }}>
              Cross-checked against Sales Analytics' independently-sourced cancellation classification (cms.mart_cms_order_report_detailed's
              "True Cancellation" vs "Re-ordered"), which landed on the same 2 numbers for the same period —
              "Re-ordered" here reuses the confirmed customer-initiated cancellation reason as the closest
              available equivalent in this table.
            </p>
          </Modal>

          <Modal
            open={activeModal === "awaiting"}
            onClose={() => setActiveModal(null)}
            title="Still Awaiting Fulfillment — Breakdown"
            subtitle={`HMRPH Online, ${periodLabel} — after reconciling probable invoice matches`}
          >
            <ModalRow
              label="payment_status = Paid, still no invoice or match"
              value={`${formatNum(data.kpis.stillAwaitingFulfillment.paid.count)} (${formatPeso(data.kpis.stillAwaitingFulfillment.paid.value)})`}
            />
            <ModalRow
              label="payment_status = Pending (COD), still no invoice or match"
              value={`${formatNum(data.kpis.stillAwaitingFulfillment.pending.count)} (${formatPeso(data.kpis.stillAwaitingFulfillment.pending.value)})`}
            />
            <ModalRow label="Combined" value={formatNum(data.kpis.stillAwaitingFulfillment.value)} total />
            <button
              type="button"
              className="mt-3 text-[12px] font-semibold underline"
              style={{ color: hrh.blueText }}
              onClick={() => {
                setActiveModal(null);
                setSubTab("fulfillment");
                setTimeout(() => document.getElementById("unresolved-orders-section")?.scrollIntoView({ behavior: "smooth" }), 50);
              }}
            >
              View orders →
            </button>
          </Modal>
        </>
      )}
    </div>
  );
}
