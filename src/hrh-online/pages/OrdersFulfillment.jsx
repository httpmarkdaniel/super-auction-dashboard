import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal, { ModalRow } from "../components/Modal";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, FulfillmentTrendComboChart, RateTrendComboChart } from "../components/Charts";
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
const YES_NO_PILL = { Yes: { bg: "#e6f4ea", text: hrh.good }, No: { bg: "#f0f1f5", text: hrh.ink2 } };

const SUB_TABS = [
  { key: "fulfillment", label: "Fulfillment" },
  { key: "cancellation", label: "Cancellation" },
  { key: "returns", label: "Returns" },
  { key: "methodology", label: "Methodology" },
];

function safeDivide(a, b) {
  return b ? a / b : 0;
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

function SubTabNav({ value, onChange }) {
  return (
    <div className="flex gap-1.5 mb-4 border-b" style={{ borderColor: hrh.border }}>
      {SUB_TABS.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="text-[12.5px] font-semibold px-3.5 py-2 -mb-px"
            style={
              active
                ? { color: hrh.accentText, borderBottom: `2px solid ${hrh.accent}` }
                : { color: hrh.ink2, borderBottom: "2px solid transparent" }
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const CANCEL_REASON_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "count", label: "Orders", render: (r) => formatNum(r.count) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
];

const RETURN_REASON_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "count", label: "Returns", render: (r) => formatNum(r.count) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
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

const CANCEL_DRILLDOWN_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "customer", label: "Customer" },
  { key: "orderDate", label: "Order Date" },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "checkoutMethod", label: "Checkout" },
  { key: "cancellationReason", label: "Reason", render: (r) => r.cancellationReason || "—" },
];

const RETURN_DRILLDOWN_COLUMNS = [
  { key: "invoiceNo", label: "Invoice #" },
  { key: "customer", label: "Customer" },
  { key: "productName", label: "Product", maxWidth: 220 },
  { key: "returnDate", label: "Return Date" },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "checkoutMethod", label: "Checkout" },
  { key: "replaced", label: "Replaced?", render: (r) => <Pill text={r.replaced ? "Yes" : "No"} map={YES_NO_PILL} /> },
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
// HMR MART / HMRPH ONLINE report. Reproduces that report's own 4-tab
// structure (Fulfillment / Cancellation / Returns / Methodology) inside
// the existing HRH Online shell — every number is live from the API,
// never the report's own frozen Sep 1-10 (Fulfillment/Cancellation) or
// Jun-Sep (Returns) figures. HMRPH Online only for the Fulfillment/
// Cancellation tabs (TikTok/Shopee orders don't flow through the same
// order/cancellation source table); Returns uses mart_net_sales directly
// so it isn't channel-limited the same way. No Pick Rate anywhere — HMR
// MART runs its own WMS, PickApp picking_status isn't meaningful here.
export default function OrdersFulfillment({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("fulfillment");
  const [fulfillmentBucket, setFulfillmentBucket] = useState("day");
  const [cancellationBucket, setCancellationBucket] = useState("day");
  const [returnsBucket, setReturnsBucket] = useState("day");
  const [activeModal, setActiveModal] = useState(null); // "received" | "completion" | "cancelled" | "awaiting" | null
  const [drilldown, setDrilldown] = useState(null); // { kind: "cancellation" | "return", category } | null

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

  const fulfillmentPerf = bucketRows(data?.fulfillmentTrend, fulfillmentBucket, ["received", "fulfilled", "cancelled", "awaiting"]).map((r) => ({
    ...r,
    completionRate: safeDivide(r.fulfilled, r.received) * 100,
  }));
  const cancellationPerf = bucketRows(data?.fulfillmentTrend, cancellationBucket, ["received", "cancelled"]).map((r) => ({
    ...r,
    cancellationRate: safeDivide(r.cancelled, r.received) * 100,
  }));
  const returnsPerf = bucketRows(data?.returns?.trend, returnsBucket, ["salesCount", "salesValue", "returns", "returnsValue"]).map((r) => ({
    ...r,
    returnRateCount: safeDivide(r.returns, r.salesCount) * 100,
    returnRateValue: safeDivide(r.returnsValue, r.salesValue) * 100,
  }));

  const cancelledByMethodSegments =
    data?.cancellations?.byFulfillmentMethod?.map((m) => ({ label: m.method, value: m.count, color: CHECKOUT_METHOD_COLOR[m.method] || hrh.muted })) || [];
  const returnsByMethodSegments =
    data?.returns?.byFulfillmentMethod?.map((m) => ({ label: m.method, value: m.count, color: CHECKOUT_METHOD_COLOR[m.method] || hrh.muted })) || [];
  const lifecycleCancelledInDenominator = data?.lifecycle?.find((l) => l.label === "Cancelled")?.value ?? 0;
  const systemInitiatedShare = data?.cancellations
    ? safeDivide(data.cancellations.reasons.find((r) => r.category === "System-Initiated (Expired)")?.count || 0, data.cancellations.total) * 100
    : 0;
  const cancelNoReasonCount = data?.cancellations?.reasons.find((r) => r.category === "No Reason Logged")?.count || 0;

  const cancelDrilldownOrders = drilldown?.kind === "cancellation" ? (data?.cancellations?.orders || []).filter((o) => o.category === drilldown.category) : [];
  const returnDrilldownOrders = drilldown?.kind === "return" ? (data?.returns?.orders || []).filter((o) => o.category === drilldown.category) : [];
  const periodLabel = data?.meta?.current ? `${data.meta.current.from} – ${data.meta.current.to}` : "";

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Orders &amp; Fulfillment
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Orders & Fulfillment…" />}
      {error && <ErrorState label={`Couldn't load Orders & Fulfillment: ${error}`} />}

      {data && !error && (
        <SubTabNav value={subTab} onChange={setSubTab} />
      )}

      {data && !error && (subTab === "fulfillment" || subTab === "cancellation") && data.meta?.unsupportedChannel && (
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

      {/* ============================== CANCELLATION ============================== */}
      {data && !error && subTab === "cancellation" && !data.meta?.unsupportedChannel && (
        <>
          <KpiRow>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("cancelled")}>
              <KpiCard label="Total Cancelled (Real)" value={formatNum(data.kpis.cancelledOrders.value)} />
            </button>
            <KpiCard label="Cancellation Rate" value={formatPct(data.kpis.cancelledOrders.cancellationRate)} sub="of Real Orders Received" />
            <KpiCard label="System-Initiated Share" value={formatPct(systemInitiatedShare)} sub="expired, not customer choice" />
            <KpiCard label="No Reason Logged" value={formatNum(cancelNoReasonCount)} />
          </KpiRow>

          <Panel
            title="Cancelled Orders by Period"
            subtitle="Real cancelled orders vs all real orders received, by order date"
            action={<TrendBucketPills value={cancellationBucket} onChange={setCancellationBucket} />}
            className="mb-4"
          >
            <RateTrendComboChart
              data={cancellationPerf}
              bars={[
                { key: "received", name: "Orders Received", color: hrh.blue },
                { key: "cancelled", name: "Cancelled", color: hrh.bad },
              ]}
              rateKey="cancellationRate"
              rateName="Cancellation Rate"
            />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Cancelled Orders by Fulfillment Method" subtitle="Pickup vs Delivery share of all real cancellations">
              <DonutChart segments={cancelledByMethodSegments} centerValue={formatNum(data.cancellations.total)} centerLabel="Cancelled Orders" />
              <div className="mt-3">
                <DataTable
                  columns={[
                    { key: "method", label: "Method" },
                    { key: "count", label: "Orders", render: (r) => formatNum(r.count) },
                    { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
                  ]}
                  rows={data.cancellations?.byFulfillmentMethod || []}
                  emptyLabel="No cancellations in this period."
                />
              </div>
            </Panel>
            <Panel title="Cancellation Reasons" subtitle="Click a row for the underlying orders — 7-category grouping">
              <DataTable
                columns={CANCEL_REASON_COLUMNS}
                rows={data.cancellations?.reasons || []}
                onRowClick={(r) => r.count > 0 && setDrilldown({ kind: "cancellation", category: r.category })}
                emptyLabel="No cancellations in this period."
              />
            </Panel>
          </div>
        </>
      )}

      {/* ============================== RETURNS ============================== */}
      {data && !error && subTab === "returns" && data.returns && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            Source: xv3.mart_net_sales (transaction_type = sale/return) — post-fulfillment sales reversals, kept separate from Cancelled orders above.
          </div>

          <KpiRow>
            <KpiCard label="Total Sales Invoiced" value={formatNum(data.returns.kpis.totalSalesInvoiced.value)} sub={data.returns.kpis.totalSalesInvoiced.sub} />
            <KpiCard label="Total Returns" value={formatNum(data.returns.kpis.totalReturns.value)} sub={data.returns.kpis.totalReturns.sub} />
            <KpiCard label="Return Rate (by count)" value={formatPct(data.returns.kpis.returnRateByCount.value)} />
            <KpiCard label="Return Rate (by value)" value={formatPct(data.returns.kpis.returnRateByValue.value)} />
          </KpiRow>

          <Panel
            title="Returns by Period"
            subtitle="Sales vs Returns, by transaction date"
            action={<TrendBucketPills value={returnsBucket} onChange={setReturnsBucket} />}
            className="mb-4"
          >
            <RateTrendComboChart
              data={returnsPerf}
              bars={[
                { key: "salesCount", name: "Sales", color: hrh.blue },
                { key: "returns", name: "Returns", color: hrh.bad },
              ]}
              rateKey="returnRateCount"
              rateName="Return Rate (count)"
            />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Returns by Fulfillment Method" subtitle="Pickup vs Delivery, via order_no → checkout_method">
              <DonutChart segments={returnsByMethodSegments} centerValue={formatNum(data.returns.kpis.totalReturns.value)} centerLabel="Returns" />
              <div className="mt-3">
                <DataTable
                  columns={[
                    { key: "method", label: "Method" },
                    { key: "count", label: "Returns", render: (r) => formatNum(r.count) },
                    { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
                    { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
                  ]}
                  rows={data.returns?.byFulfillmentMethod || []}
                  emptyLabel="No returns in this period."
                />
              </div>
            </Panel>
            <Panel title="Return Reasons" subtitle="Click a row for the underlying transactions — 10-category grouping">
              <DataTable
                columns={RETURN_REASON_COLUMNS}
                rows={data.returns.reasons}
                onRowClick={(r) => r.count > 0 && setDrilldown({ kind: "return", category: r.category })}
                emptyLabel="No returns in this period."
              />
            </Panel>
          </div>

          <Panel title="Did Returned Items Get Replaced?" subtitle="Matched to a later sale by the same customer name, same product, within 30 days">
            <p className="text-[13px]" style={{ color: hrh.ink }}>
              <span className="font-semibold">
                {formatNum(data.returns.replacement.replacedCount)} of {formatNum(data.returns.replacement.totalReturns)} returns (
                {formatPct(data.returns.replacement.replacedSharePct)})
              </span>{" "}
              show a same-item repurchase within 30 days.
            </p>
          </Panel>
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
                  Cancellation Reasons — 7 categories
                </div>
                Built from the free-text cancellation_reason field: System-Initiated (Expired), Payment Issues,
                Technical / Website Issues, Changed Mind / No Longer Needed, Order Modification, No Reason Logged,
                Other / Miscellaneous.
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
              already excluded from the denominator above. Pick rate intentionally excluded — HMR MART fulfills via
              its own WMS.
            </p>
          </Modal>

          <Modal open={activeModal === "cancelled"} onClose={() => setActiveModal(null)} title="Cancelled Orders — Breakdown" subtitle={`HMRPH Online, ${periodLabel}`}>
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
                setSubTab("fulfillment");
                setTimeout(() => document.getElementById("unresolved-orders-section")?.scrollIntoView({ behavior: "smooth" }), 50);
              }}
            >
              View orders →
            </button>
          </Modal>

          <Modal
            open={drilldown?.kind === "cancellation"}
            onClose={() => setDrilldown(null)}
            title={drilldown?.category || ""}
            subtitle={`${cancelDrilldownOrders.length} orders — HMRPH Online, ${periodLabel}`}
            wide
          >
            <DataTable columns={CANCEL_DRILLDOWN_COLUMNS} rows={cancelDrilldownOrders} paginate pageSize={10} emptyLabel="No orders in this category." />
          </Modal>

        </>
      )}

      {data && (
        <Modal
          open={drilldown?.kind === "return"}
          onClose={() => setDrilldown(null)}
          title={drilldown?.category || ""}
          subtitle={`${returnDrilldownOrders.length} returns — ${periodLabel}`}
          wide
        >
          <DataTable columns={RETURN_DRILLDOWN_COLUMNS} rows={returnDrilldownOrders} paginate pageSize={10} emptyLabel="No returns in this category." />
        </Modal>
      )}
    </div>
  );
}
