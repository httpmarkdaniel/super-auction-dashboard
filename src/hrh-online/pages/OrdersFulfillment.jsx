import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, StackedAreaChart } from "../components/Charts";
import { formatShortDateLabel } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso } from "../format";

const LIFECYCLE_COLOR = {
  Fulfilled: hrh.good,
  Cancelled: hrh.bad,
  "Still Awaiting Fulfillment / No Invoice": hrh.muted,
};

const CHECKOUT_METHOD_COLOR = {
  Pickup: hrh.blue,
  Delivery: hrh.series[2],
  Unknown: hrh.muted,
};

const CANCEL_REASON_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "count", label: "Orders", render: (r) => formatNum(r.count) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
];

const UNRESOLVED_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "orderStatus", label: "Order Status" },
  { key: "paymentStatus", label: "Payment" },
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
// HMR MART / HMRPH ONLINE report: fulfillment is determined from invoices
// in xv3.mart_net_sales (direct order_no match, or a probable match by
// customer name + date + fee-adjusted amount), never from order_status.
// HMRPH Online only — TikTok/Shopee orders don't flow through the same
// order/cancellation source table, so this page reports that limitation
// instead of fabricating a lifecycle for those channels. No Pick Rate —
// HMR MART runs its own WMS, PickApp picking_status isn't meaningful here.
export default function OrdersFulfillment({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const lifecycleSegments =
    data?.lifecycle?.map((l) => ({ label: l.label, value: l.value, color: LIFECYCLE_COLOR[l.label] || hrh.muted })) || [];
  const cancelledByMethodSegments =
    data?.cancellations?.byFulfillmentMethod?.map((m) => ({ label: m.method, value: m.count, color: CHECKOUT_METHOD_COLOR[m.method] || hrh.muted })) || [];
  const fulfillmentTrend =
    data?.fulfillmentTrend?.map((d) => ({
      dateLabel: formatShortDateLabel(d.date),
      fulfilled: d.fulfilled,
      cancelled: d.cancelled,
      awaiting: d.awaiting,
    })) || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Orders &amp; Fulfillment
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Orders & Fulfillment…" />}
      {error && <ErrorState label={`Couldn't load Orders & Fulfillment: ${error}`} />}

      {data && !error && data.meta?.unsupportedChannel && (
        <ErrorState label={data.meta.limitationNote} />
      )}

      {data && !error && !data.meta?.unsupportedChannel && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <KpiRow>
            <KpiCard label="Real Orders Received" value={formatNum(data.kpis.realOrdersReceived.value)} sub={data.kpis.realOrdersReceived.sub} />
            <KpiCard label="Fulfilled Orders" value={formatNum(data.kpis.fulfilledOrders.value)} />
            <KpiCard label="Completion Rate" value={formatPct(data.kpis.completionRate.value)} />
            <KpiCard label="Cancelled Orders" value={formatNum(data.kpis.cancelledOrders.value)} />
            <KpiCard label="Still Awaiting Fulfillment" value={formatNum(data.kpis.stillAwaitingFulfillment.value)} />
          </KpiRow>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Fulfillment Status Breakdown" subtitle="Reconciles to Real Orders Received above">
              <DonutChart segments={lifecycleSegments} centerValue={formatNum(data.kpis.realOrdersReceived.value)} centerLabel="Real Orders Received" />
            </Panel>
            <Panel title="Fulfillment Trend" subtitle="Fulfilled / Cancelled / Still Awaiting, by order date">
              <StackedAreaChart
                data={fulfillmentTrend}
                xKey="dateLabel"
                stacked
                valueFormatter={formatNum}
                categories={[
                  { key: "fulfilled", name: "Fulfilled", color: hrh.good },
                  { key: "cancelled", name: "Cancelled", color: hrh.bad },
                  { key: "awaiting", name: "Still Awaiting", color: hrh.muted },
                ]}
              />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Cancellation Reasons" subtitle="All real cancellations this period — 7-category grouping">
              <DataTable columns={CANCEL_REASON_COLUMNS} rows={data.cancellations?.reasons || []} emptyLabel="No cancellations in this period." />
            </Panel>
            <Panel title="Cancelled Orders by Fulfillment Method" subtitle="Pickup vs Delivery share of all real cancellations">
              <DonutChart
                segments={cancelledByMethodSegments}
                centerValue={formatNum(data.cancellations?.total || 0)}
                centerLabel="Cancelled Orders"
              />
              <DataTable
                columns={[
                  { key: "method", label: "Method" },
                  { key: "count", label: "Orders", render: (r) => formatNum(r.count) },
                  { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
                ]}
                rows={data.cancellations?.byFulfillmentMethod || []}
                emptyLabel="No cancellations in this period."
              />
            </Panel>
          </div>

          <Panel
            title="Unresolved Orders"
            subtitle="Still awaiting fulfillment after both direct and probable invoice matching"
            className="mb-4"
          >
            <DataTable
              columns={UNRESOLVED_COLUMNS}
              rows={data.unresolvedOrders}
              paginate
              pageSize={10}
              emptyLabel="Every real order this period has a direct or probable invoice match."
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
