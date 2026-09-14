import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal, { ModalRow } from "../components/Modal";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso } from "../format";

const LIFECYCLE_COLOR = {
  Fulfilled: hrh.good,
  Cancelled: hrh.bad,
  "Still Awaiting Fulfillment / No Invoice": hrh.muted,
};
const CHECKOUT_METHOD_COLOR = { Pickup: hrh.blue, Delivery: hrh.series[2], Unknown: hrh.muted };
const ORDER_STATUS_PILL = {
  Paid: { bg: hrh.accentSoft, text: hrh.accentText },
  Processing: { bg: hrh.blueSoft, text: hrh.blueText },
  Cancelled: { bg: "#faeaea", text: hrh.bad },
};
const PAYMENT_STATUS_PILL = {
  Paid: { bg: "#e6f4ea", text: hrh.good },
  Pending: { bg: "#f0f1f5", text: hrh.ink2 },
};

function safeDivide(a, b) {
  return b ? a / b : 0;
}

function Pill({ text, map }) {
  const c = map[text] || { bg: "#f0f1f5", text: hrh.ink2 };
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
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

const CANCEL_REASON_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "count", label: "Orders", render: (r) => formatNum(r.count) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
];

const PERFORMANCE_COLUMNS = [
  { key: "dateLabel", label: "Period" },
  { key: "fulfilled", label: "Fulfilled", render: (r) => formatNum(r.fulfilled) },
  { key: "cancelled", label: "Cancelled", render: (r) => formatNum(r.cancelled) },
  { key: "awaiting", label: "Awaiting", render: (r) => formatNum(r.awaiting) },
  {
    key: "completionRate",
    label: "Completion Rate",
    render: (r) => formatPct(safeDivide(r.fulfilled, r.received) * 100),
  },
];

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

const DRILLDOWN_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "customer", label: "Customer" },
  { key: "orderDate", label: "Order Date" },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "checkoutMethod", label: "Checkout" },
  { key: "cancellationReason", label: "Reason", render: (r) => r.cancellationReason || "—" },
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
// HMR MART / HMRPH ONLINE report: fulfillment is determined from invoices
// in xv3.mart_net_sales (direct order_no match, or a probable match by
// customer name + date + fee-adjusted amount), never from order_status.
// HMRPH Online only — TikTok/Shopee orders don't flow through the same
// order/cancellation source table, so this page reports that limitation
// instead of fabricating a lifecycle for those channels. No Pick Rate —
// HMR MART runs its own WMS, PickApp picking_status isn't meaningful here.
//
// Presentation mirrors the source methodology report's own Fulfillment
// tab (KPI cards -> click-through breakdown modals, a duplicate/real-
// orders reconciliation, cancellation reason + fulfillment-method
// breakdowns, an unresolved-orders drilldown) — every number here is
// live from the API above, never the report's own frozen Sep 1-10 figures.
export default function OrdersFulfillment({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [activeModal, setActiveModal] = useState(null); // "received" | "completion" | "cancelled" | "awaiting" | null
  const [reasonDrilldown, setReasonDrilldown] = useState(null); // category string | null

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, report: "ordersFulfillment" });
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

  const performanceRows = bucketRows(data?.fulfillmentTrend, trendBucket, ["received", "fulfilled", "cancelled", "awaiting"]);
  const cancelledByMethodSegments =
    data?.cancellations?.byFulfillmentMethod?.map((m) => ({ label: m.method, value: m.count, color: CHECKOUT_METHOD_COLOR[m.method] || hrh.muted })) || [];
  const lifecycleCancelledInDenominator = data?.lifecycle?.find((l) => l.label === "Cancelled")?.value ?? 0;
  const drilldownOrders = reasonDrilldown ? (data?.cancellations?.orders || []).filter((o) => o.category === reasonDrilldown) : [];
  const periodLabel = data?.meta?.current ? `${data.meta.current.from} – ${data.meta.current.to}` : "";

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Orders &amp; Fulfillment
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Orders & Fulfillment…" />}
      {error && <ErrorState label={`Couldn't load Orders & Fulfillment: ${error}`} />}

      {data && !error && data.meta?.unsupportedChannel && <ErrorState label={data.meta.limitationNote} />}

      {data && !error && !data.meta?.unsupportedChannel && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <KpiRow>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("received")}>
              <KpiCard label="Real Orders Received" value={formatNum(data.kpis.realOrdersReceived.value)} sub={data.kpis.realOrdersReceived.sub} />
            </button>
            <KpiCard label="Fulfilled Orders" value={formatNum(data.kpis.fulfilledOrders.value)} />
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("completion")}>
              <KpiCard label="Completion Rate" value={formatPct(data.kpis.completionRate.value)} />
            </button>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("cancelled")}>
              <KpiCard label="Cancelled Orders" value={formatNum(data.kpis.cancelledOrders.value)} />
            </button>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("awaiting")}>
              <KpiCard label="Still Awaiting Fulfillment" value={formatNum(data.kpis.stillAwaitingFulfillment.value)} />
            </button>
          </KpiRow>

          <Panel title="Order Lifecycle" subtitle="Reconciles to Real Orders Received above" className="mb-4">
            {data.lifecycle.map((l) => (
              <LifecycleBarRow key={l.label} label={l.label} value={l.value} total={data.kpis.realOrdersReceived.value} color={LIFECYCLE_COLOR[l.label] || hrh.muted} />
            ))}
          </Panel>

          <Panel
            title="Fulfillment Performance"
            subtitle="Fulfilled / Cancelled / Awaiting by order date, bucketed"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <DataTable columns={PERFORMANCE_COLUMNS} rows={performanceRows} emptyLabel="No orders in this period." />
          </Panel>

          <Panel title="Cancellation Analysis" className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                  Cancelled by Fulfillment Method
                </div>
                <DonutChart segments={cancelledByMethodSegments} centerValue={formatNum(data.cancellations.total)} centerLabel="Cancelled" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                  Cancellation Reasons — click a row for orders
                </div>
                <DataTable
                  columns={CANCEL_REASON_COLUMNS}
                  rows={data.cancellations?.reasons || []}
                  onRowClick={(r) => r.count > 0 && setReasonDrilldown(r.category)}
                  emptyLabel="No cancellations in this period."
                />
              </div>
            </div>
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
              Order" auto-cancel. System-Initiated (Expired) and No-Reason-Logged cancellations stay inside Real
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
              — the broader "Cancelled Orders" KPI card also includes confirmed customer-initiated cancellations
              already excluded from the denominator above (see Data Quality notes). Pick rate intentionally excluded
              — HMR MART fulfills via its own WMS.
            </p>
          </Modal>

          <Modal
            open={activeModal === "cancelled"}
            onClose={() => setActiveModal(null)}
            title="Cancelled Orders — Breakdown"
            subtitle={`HMRPH Online, ${periodLabel}`}
          >
            <ModalRow label="Raw Cancelled (all, incl. dev/test)" value={formatNum(data.kpis.cancelledOrders.raw)} />
            <ModalRow label="Dev/test cancelled" value={formatNum(data.kpis.cancelledOrders.devTestExcluded)} subtract />
            <ModalRow label="Real Cancelled" value={formatNum(data.kpis.cancelledOrders.value)} total />
            <ModalRow label="Cancellation Rate (Real Cancelled ÷ Real Orders Received)" value={formatPct(data.kpis.cancelledOrders.cancellationRate)} />
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
                document.getElementById("unresolved-orders-section")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              View orders →
            </button>
          </Modal>

          <Modal
            open={Boolean(reasonDrilldown)}
            onClose={() => setReasonDrilldown(null)}
            title={reasonDrilldown || ""}
            subtitle={`${drilldownOrders.length} orders — HMRPH Online, ${periodLabel}`}
            wide
          >
            <DataTable columns={DRILLDOWN_COLUMNS} rows={drilldownOrders} paginate pageSize={10} emptyLabel="No orders in this category." />
          </Modal>
        </>
      )}
    </div>
  );
}
