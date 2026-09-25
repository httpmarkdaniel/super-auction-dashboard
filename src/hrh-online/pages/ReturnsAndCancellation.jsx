import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal, { ModalRow } from "../components/Modal";
import SubTabNav from "../components/SubTabNav";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, RateTrendComboChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso } from "../format";

// NEW standalone page (2026-09-17), per explicit request — duplicates
// Orders & Fulfillment's own Cancellation/Returns sub-tabs as their own
// combined page (same api/_hrh-orders-fulfillment.js source, own
// independent fetch/state/modals), deliberately kept separate from that
// page's existing sub-tabs rather than a shared/extracted component — the
// two pages' Cancelled Orders KPI cards used to share one modal via a
// single activeModal state in Orders & Fulfillment; duplicating instead
// of extracting avoids touching that already-working cross-tab wiring.
// See OrdersFulfillment.jsx for the sub-tab version of this same content.

function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  alertTriangle: (
    <Icon>
      <path d="m10.29 3.86-8.18 14.14A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  flag: (
    <Icon>
      <path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5" />
    </Icon>
  ),
  receipt: (
    <Icon>
      <path d="M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-2 2-3-2Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </Icon>
  ),
  rotateCcw: (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  ),
};

const SUB_TABS = [
  { key: "cancellation", label: "Cancellation (Pre-Fulfillment)" },
  { key: "returns", label: "Returns (Post-Fulfillment)" },
];

const CHECKOUT_METHOD_COLOR = { Pickup: hrh.blue, Delivery: hrh.series[2], Unknown: hrh.muted };
const YES_NO_PILL = { Yes: { bg: "#e6f4ea", text: hrh.good }, No: { bg: "#f0f1f5", text: hrh.ink2 } };

// "Cancelled Orders by Period" / "Returns by Period" are now a fixed
// trailing window (see api/_hrh-orders-fulfillment.js's
// cancellationTrendTrailing / returns.trendTrailing), independent of the
// page's Date Range filter — same pattern as Executive Overview's Sales
// Trend, except Month here is the last 12 months ("every month of the
// whole year") rather than Executive Overview's 6.
const TRAILING_BUCKET_COUNT = { day: 30, week: 4, month: 12 };

function safeDivide(a, b) {
  return b ? a / b : 0;
}

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

function daysBetweenISO(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000) + 1;
}
function autoGranularity(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    const days = daysBetweenISO(dateRange.from, dateRange.to);
    if (days <= 14) return "day";
    if (days <= 90) return "week";
    return "month";
  }
  if (dateRange === "mtd" || dateRange === "prevMonth") return "week";
  if (dateRange === "ytd" || dateRange === "prevYear") return "month";
  return "day";
}

function ReportTable({ columns, rows, totalRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr style={{ borderBottom: `1px solid ${hrh.border}` }}>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
                style={{ color: hrh.ink2 }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${hrh.border}` }}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 tabular-nums whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`} style={{ color: hrh.ink }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {totalRow && (
            <tr style={{ borderTop: `2px solid ${hrh.ink}` }}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 tabular-nums whitespace-nowrap font-bold ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={{ color: hrh.ink }}
                >
                  {c.render ? c.render(totalRow) : totalRow[c.key]}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const PERIOD_CANCEL_COLUMNS = [
  { key: "dateLabel", label: "Period", align: "left" },
  { key: "rawOrdersPlaced", label: "Raw Orders Placed", align: "right", render: (r) => formatNum(r.rawOrdersPlaced) },
  { key: "cancelledReal", label: "Cancelled (Real)", align: "right", render: (r) => `${formatNum(r.cancelledCount)} (${formatPeso(r.cancelledValue)})` },
  { key: "cancellationRate", label: "Cancellation Rate", align: "right", render: (r) => formatPct(r.cancellationRate) },
];

const METHOD_TABLE_COLUMNS = [
  { key: "method", label: "Fulfillment Method", align: "left" },
  { key: "count", label: "Cancelled Orders", align: "right", render: (r) => formatNum(r.count) },
  { key: "value", label: "Cancelled Value", align: "right", render: (r) => formatPeso(r.value) },
  { key: "sharePct", label: "Share", align: "right", render: (r) => formatPct(r.sharePct) },
];

const PAYMENT_TYPES_SHOWN = 3;
function paymentTypesCell(paymentTypes) {
  if (!paymentTypes || paymentTypes.length === 0) return "—";
  const shown = paymentTypes.slice(0, PAYMENT_TYPES_SHOWN);
  const moreCount = paymentTypes.length - shown.length;
  return (
    <span className="whitespace-nowrap">
      {shown.map((p, i) => (
        <span key={p.type}>
          {i > 0 && ", "}
          {p.type} ({formatNum(p.count)})
        </span>
      ))}
      {moreCount > 0 && <span style={{ color: hrh.muted }}>, +{moreCount} more</span>}
    </span>
  );
}

const CANCEL_REASON_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "count", label: "Orders", render: (r) => formatNum(r.count) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
  { key: "paymentTypes", label: "Payment Type", render: (r) => paymentTypesCell(r.paymentTypes) },
];

const RETURN_REASON_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "count", label: "Returns", render: (r) => formatNum(r.count) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
  { key: "paymentTypes", label: "Payment Type", render: (r) => paymentTypesCell(r.paymentTypes) },
];

function Pill({ text, map }) {
  const c = map[text] || { bg: "#f0f1f5", text: hrh.ink2 };
  return (
    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.text }}>
      {text || "—"}
    </span>
  );
}

const CANCEL_DRILLDOWN_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "customer", label: "Customer" },
  { key: "orderDate", label: "Order Date" },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "items", label: "Item(s)", maxWidth: 260, render: (r) => (r.items?.length ? r.items.join(", ") : "—") },
  { key: "checkoutMethod", label: "Checkout" },
  { key: "paymentType", label: "Payment Type", render: (r) => r.paymentType || "Unknown" },
  { key: "cancellationReason", label: "Reason", render: (r) => r.cancellationReason || "—" },
];

const RETURN_DRILLDOWN_COLUMNS = [
  { key: "invoiceNo", label: "Invoice #" },
  { key: "customer", label: "Customer" },
  { key: "productName", label: "Product", maxWidth: 220 },
  { key: "returnDate", label: "Return Date" },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "checkoutMethod", label: "Checkout" },
  { key: "paymentType", label: "Payment Type", render: (r) => r.paymentType || "Unknown" },
  { key: "replaced", label: "Replaced?", render: (r) => <Pill text={r.replaced ? "Yes" : "No"} map={YES_NO_PILL} /> },
  { key: "remarks", label: "Invoice Remarks", maxWidth: 260, render: (r) => r.remarks || "—" },
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

// Real ClickHouse-backed Returns and Cancellation — see
// api/_hrh-orders-fulfillment.js (dispatched via ?report=ordersFulfillment,
// same endpoint Orders & Fulfillment uses) for the full methodology.
// HMRPH Online only for Cancellation (TikTok/Shopee orders don't flow
// through the same order/cancellation source table); Returns uses
// mart_net_sales directly so it isn't channel-limited the same way — same
// scope notes as Orders & Fulfillment's own Cancellation/Returns tabs.
export default function ReturnsAndCancellation({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("cancellation");
  const [compareTo, setCompareTo] = useState("week");
  const [cancellationBucket, setCancellationBucket] = useState("day");
  const [returnsBucket, setReturnsBucket] = useState("day");
  const [activeModal, setActiveModal] = useState(null); // "cancelled" | null
  const [drilldown, setDrilldown] = useState(null); // { kind: "cancellation" | "return", category } | null

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

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    load(channel, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [channel, params, compareTo, ready, load]);

  const rawFulfillmentTrend = data?.fulfillmentTrend || [];
  const rawReturnsTrend = data?.returns?.trend || [];
  const cancellationRateSpark = rawFulfillmentTrend.map((r) => safeDivide(r.cancelled, r.received) * 100);
  const returnRateByCountSpark = rawReturnsTrend.map((r) => safeDivide(r.returns, r.salesCount) * 100);
  const returnRateByValueSpark = rawReturnsTrend.map((r) => safeDivide(r.returnsValue, r.salesValue) * 100);

  const cancellationPerf = bucketRows(data?.cancellationTrendTrailing, cancellationBucket, ["received", "cancelled"])
    .slice(-TRAILING_BUCKET_COUNT[cancellationBucket])
    .map((r) => ({
      ...r,
      cancellationRate: safeDivide(r.cancelled, r.received) * 100,
    }));
  const cancellationPeriodGranularity = autoGranularity(dateRange);
  const cancellationPeriodRows = bucketRows(data?.cancellationByPeriodDaily, cancellationPeriodGranularity, [
    "rawOrdersPlaced",
    "cancelledCount",
    "cancelledValue",
  ]).map((r) => ({ ...r, cancellationRate: safeDivide(r.cancelledCount, r.rawOrdersPlaced) * 100 }));
  const cancellationPeriodTotals = (data?.cancellationByPeriodDaily || []).reduce(
    (acc, r) => ({
      rawOrdersPlaced: acc.rawOrdersPlaced + r.rawOrdersPlaced,
      cancelledCount: acc.cancelledCount + r.cancelledCount,
      cancelledValue: acc.cancelledValue + r.cancelledValue,
    }),
    { rawOrdersPlaced: 0, cancelledCount: 0, cancelledValue: 0 }
  );
  const returnsPerf = bucketRows(data?.returns?.trendTrailing, returnsBucket, ["salesCount", "salesValue", "returns", "returnsValue"])
    .slice(-TRAILING_BUCKET_COUNT[returnsBucket])
    .map((r) => ({
      ...r,
      returnRateCount: safeDivide(r.returns, r.salesCount) * 100,
      returnRateValue: safeDivide(r.returnsValue, r.salesValue) * 100,
    }));

  const cancelledByMethodSegments =
    data?.cancellations?.byFulfillmentMethod?.map((m) => ({ label: m.method, value: m.count, color: CHECKOUT_METHOD_COLOR[m.method] || hrh.muted })) || [];
  const cancelledMethodTotals = (data?.cancellations?.byFulfillmentMethod || []).reduce(
    (acc, m) => ({ count: acc.count + m.count, value: acc.value + m.value }),
    { count: 0, value: 0 }
  );
  const returnsByMethodSegments =
    data?.returns?.byFulfillmentMethod?.map((m) => ({ label: m.method, value: m.count, color: CHECKOUT_METHOD_COLOR[m.method] || hrh.muted })) || [];

  const cancelDrilldownOrders =
    drilldown?.kind === "cancellation"
      ? (data?.cancellations?.orders || []).filter((o) => o.category === drilldown.category).sort((a, b) => b.amount - a.amount)
      : [];
  const returnDrilldownOrders =
    drilldown?.kind === "return"
      ? (data?.returns?.orders || []).filter((o) => o.category === drilldown.category).sort((a, b) => b.amount - a.amount)
      : [];
  const periodLabel = data?.meta?.current ? `${data.meta.current.from} – ${data.meta.current.to}` : "";

  return (
    <div>
      {/* Compare to — sits top-right of the page, level with the page
          title, under the topbar's channel buttons (see .uf-compare-slot in
          src/uniform.css). */}
      <div className="uf-compare-slot">
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
      {ready && loading && !data && <LoadingState label="Loading Returns and Cancellation…" />}
      {error && <ErrorState label={`Couldn't load Returns and Cancellation: ${error}`} />}

      {data && !error && <SubTabNav tabs={SUB_TABS} value={subTab} onChange={setSubTab} />}

      {data && !error && subTab === "cancellation" && data.meta?.unsupportedChannel && <ErrorState label={data.meta.limitationNote} />}

      {/* ============================== CANCELLATION ============================== */}
      {data && !error && subTab === "cancellation" && !data.meta?.unsupportedChannel && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            Source: xv3.mart_xv3_order_report (cancellation_reason) — pre-fulfillment order cancellations, before any invoice/sale exists. See Returns for post-fulfillment sales reversals.
          </div>

          <KpiRow>
            <button type="button" className="text-left w-full appearance-none bg-transparent border-0 p-0 cursor-pointer" onClick={() => setActiveModal("cancelled")}>
              <KpiCard
                label="Total Cancelled (Real)"
                icon={ICONS.alertTriangle}
                value={formatNum(data.kpis.cancelledOrders.value)}
                delta={data.kpis.cancelledOrders.delta}
                previousLabel={formatNum(data.kpis.cancelledOrders.previous)}
                sparkline={rawFulfillmentTrend.map((r) => r.cancelled)}
              />
            </button>
            <KpiCard
              label="Cancellation Rate"
              icon={ICONS.percent}
              value={formatPct(data.kpis.cancellationRate.value)}
              delta={data.kpis.cancellationRate.delta}
              previousLabel={formatPct(data.kpis.cancellationRate.previous)}
              sub="of Real Orders Received"
              sparkline={cancellationRateSpark}
            />
            <KpiCard
              label="System-Initiated Share"
              icon={ICONS.flag}
              value={formatPct(data.kpis.systemInitiatedShare.value)}
              delta={data.kpis.systemInitiatedShare.delta}
              previousLabel={formatPct(data.kpis.systemInitiatedShare.previous)}
              sub="expired, not customer choice"
            />
            <KpiCard
              label="No Reason Logged"
              icon={ICONS.flag}
              value={formatNum(data.kpis.cancelNoReasonCount.value)}
              delta={data.kpis.cancelNoReasonCount.delta}
              previousLabel={formatNum(data.kpis.cancelNoReasonCount.previous)}
            />
          </KpiRow>

          <Panel
            title="Cancelled Orders by Period"
            subtitle={`Last ${TRAILING_BUCKET_COUNT[cancellationBucket]} ${cancellationBucket === "day" ? "days" : cancellationBucket + "s"}, ending today — independent of the Date Range filter above.`}
            action={<TrendBucketPills value={cancellationBucket} onChange={setCancellationBucket} />}
            className="mb-4"
          >
            {/* Orders Received and Cancellation Rate are hidden from the
                chart itself (Received's much larger scale was dwarfing
                Cancelled even after the muted-color fix, and the rate
                line added more visual noise than signal at this zoom) —
                both are still real, still shown on hover via
                RateTrendComboChart's tooltip, per explicit request. */}
            <RateTrendComboChart
              data={cancellationPerf}
              bars={[
                { key: "cancelled", name: "Cancelled", color: hrh.bad },
                { key: "received", name: "Orders Received", color: hrh.muted },
              ]}
              hiddenBarKeys={["received"]}
              showRateLine={false}
              rateKey="cancellationRate"
              rateName="Cancellation Rate"
            />
            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${hrh.border}` }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                Detail — granularity auto-selected from the Date Range filter ({cancellationPeriodGranularity})
              </div>
              <ReportTable
                columns={PERIOD_CANCEL_COLUMNS}
                rows={cancellationPeriodRows}
                totalRow={{
                  dateLabel: "Total",
                  rawOrdersPlaced: cancellationPeriodTotals.rawOrdersPlaced,
                  cancelledCount: cancellationPeriodTotals.cancelledCount,
                  cancelledValue: cancellationPeriodTotals.cancelledValue,
                  cancellationRate: safeDivide(cancellationPeriodTotals.cancelledCount, cancellationPeriodTotals.rawOrdersPlaced) * 100,
                }}
              />
            </div>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Cancelled Orders by Fulfillment Method" subtitle="Pickup vs Delivery share of True Cancellations (excludes re-ordered/customer-initiated)">
              <DonutChart segments={cancelledByMethodSegments} centerValue={formatNum(data.cancellations.total)} centerLabel="Cancelled Orders" />
              <div className="mt-3">
                <ReportTable
                  columns={METHOD_TABLE_COLUMNS}
                  rows={data.cancellations?.byFulfillmentMethod || []}
                  totalRow={{ method: "Total", count: cancelledMethodTotals.count, value: cancelledMethodTotals.value, sharePct: 100 }}
                />
              </div>
            </Panel>
            <Panel title="Cancellation Reasons" subtitle="True Cancellations only — click a row for the underlying orders, categories with 0 orders hidden">
              <DataTable
                columns={CANCEL_REASON_COLUMNS}
                rows={(data.cancellations?.reasons || []).filter((r) => r.count > 0)}
                onRowClick={(r) => setDrilldown({ kind: "cancellation", category: r.category })}
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
            Source: xv3.mart_net_sales (transaction_type = sale/return) — post-fulfillment sales reversals, kept separate from Cancellation (pre-fulfillment) above.
          </div>

          <KpiRow>
            <KpiCard
              label="Total Sales Invoiced"
              icon={ICONS.receipt}
              value={formatNum(data.returns.kpis.totalSalesInvoiced.value)}
              delta={data.returns.kpis.totalSalesInvoiced.delta}
              previousLabel={formatNum(data.returns.kpis.totalSalesInvoiced.previous)}
              sub={data.returns.kpis.totalSalesInvoiced.sub}
              sparkline={rawReturnsTrend.map((r) => r.salesCount)}
            />
            <KpiCard
              label="Total Returns"
              icon={ICONS.rotateCcw}
              value={formatNum(data.returns.kpis.totalReturns.value)}
              delta={data.returns.kpis.totalReturns.delta}
              previousLabel={formatNum(data.returns.kpis.totalReturns.previous)}
              sub={data.returns.kpis.totalReturns.sub}
              sparkline={rawReturnsTrend.map((r) => r.returns)}
            />
            <KpiCard
              label="Return Rate (by count)"
              icon={ICONS.percent}
              value={formatPct(data.returns.kpis.returnRateByCount.value)}
              delta={data.returns.kpis.returnRateByCount.delta}
              previousLabel={formatPct(data.returns.kpis.returnRateByCount.previous)}
              sparkline={returnRateByCountSpark}
            />
            <KpiCard
              label="Return Rate (by value)"
              icon={ICONS.percent}
              value={formatPct(data.returns.kpis.returnRateByValue.value)}
              delta={data.returns.kpis.returnRateByValue.delta}
              previousLabel={formatPct(data.returns.kpis.returnRateByValue.previous)}
              sparkline={returnRateByValueSpark}
            />
          </KpiRow>

          <Panel
            title="Returns by Period"
            subtitle={`Last ${TRAILING_BUCKET_COUNT[returnsBucket]} ${returnsBucket === "day" ? "days" : returnsBucket + "s"}, ending today — independent of the Date Range filter above.`}
            action={<TrendBucketPills value={returnsBucket} onChange={setReturnsBucket} />}
            className="mb-4"
          >
            {/* Sales and Return Rate are hidden from the chart itself (Sales'
                much larger scale was dwarfing Returns, and the rate line
                added more visual noise than signal at this zoom) — both
                are still real, still shown on hover via
                RateTrendComboChart's tooltip, per explicit request. */}
            <RateTrendComboChart
              data={returnsPerf}
              bars={[
                { key: "salesCount", name: "Sales", color: hrh.blue },
                { key: "returns", name: "Returns", color: hrh.bad },
              ]}
              hiddenBarKeys={["salesCount"]}
              showRateLine={false}
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
            <Panel title="Return Reasons" subtitle="Click a row for the underlying transactions — 10-category grouping, categories with 0 orders hidden">
              <DataTable
                columns={RETURN_REASON_COLUMNS}
                rows={(data.returns.reasons || []).filter((r) => r.count > 0)}
                onRowClick={(r) => setDrilldown({ kind: "return", category: r.category })}
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

      {data && !data.meta?.unsupportedChannel && (
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
      )}

      {data && (
        <>
          <Modal
            open={drilldown?.kind === "cancellation"}
            onClose={() => setDrilldown(null)}
            title={drilldown?.category || ""}
            subtitle={`${cancelDrilldownOrders.length} orders — HMRPH Online, ${periodLabel}`}
            wide
          >
            <DataTable columns={CANCEL_DRILLDOWN_COLUMNS} rows={cancelDrilldownOrders} paginate pageSize={10} emptyLabel="No orders in this category." />
          </Modal>

          <Modal
            open={drilldown?.kind === "return"}
            onClose={() => setDrilldown(null)}
            title={drilldown?.category || ""}
            subtitle={`${returnDrilldownOrders.length} returns — ${periodLabel}`}
            wide
          >
            <DataTable columns={RETURN_DRILLDOWN_COLUMNS} rows={returnDrilldownOrders} paginate pageSize={10} emptyLabel="No returns in this category." />
          </Modal>
        </>
      )}
    </div>
  );
}
