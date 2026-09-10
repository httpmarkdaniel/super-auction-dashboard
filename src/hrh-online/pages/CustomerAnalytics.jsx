import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { ComboBarLineChart, DonutChart, StackedAreaChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { formatShortDateLabel, formatWeekRangeLabel, formatMonthLabel } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatPct, formatNum } from "../format";

const TREND_LABEL_FORMATTER = { day: formatShortDateLabel, week: formatWeekRangeLabel, month: formatMonthLabel };

const SEGMENT_COLOR = { New: hrh.blue, Returning: hrh.accent };

const TOP_CUSTOMER_COLUMNS = [
  { key: "customer", label: "Customer", maxWidth: 200 },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "firstPurchase", label: "First Purchase" },
  { key: "lastBuy", label: "Last Buy" },
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

// Real ClickHouse-backed Customer Analytics — see api/_hrh-customer-analytics.js
// (dispatched from api/hrh-sales-analytics.js via ?report=customers, co-located
// only because of the Vercel Hobby plan's 12-function cap) for the queries.
// New/Returning uses the customer's cross-store, all-time-first HRH order
// (not scoped to HRH Online alone) — same reasoning as Executive Overview's
// Customer Segments. Customer Trend's Day/Week/Month toggle switches
// between 3 PRECOMPUTED server-side series (data.customerTrend.day/week/
// month), not a client-side re-aggregation of one daily series — distinct-
// customer counts can't be safely summed across days the way GMV/Orders
// sums can (bucketRows() would double-count a customer active on 2+ days
// within the same week/month bucket).
export default function CustomerAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (ch, params, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...params, report: "customers" });
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
    load(channel, dateRangeParams(dateRange), controller.signal);
    return () => controller.abort();
  }, [channel, dateRange, ready, load]);

  const formatTrendLabel = TREND_LABEL_FORMATTER[trendBucket];
  const customerTrend =
    data?.customerTrend[trendBucket].map((r) => ({
      dateLabel: formatTrendLabel(r.bucket),
      newCustomers: r.newCustomers,
      returningCustomers: r.returningCustomers,
    })) || [];
  const newVsReturningSegments =
    data?.newVsReturning.map((s) => ({ label: s.segment, value: s.count, color: SEGMENT_COLOR[s.segment] || hrh.muted })) || [];
  const valueSegments = data?.valueSegments.map((s) => ({ label: s.segment, value: s.count })) || [];
  const purchaseFrequencyRows = data?.purchaseFrequency.map((r) => ({ label: r.bucket, customers: r.count })) || [];
  const spendDistributionRows = data?.spendDistribution.map((r) => ({ label: r.bucket, customers: r.count })) || [];
  const totalNewVsReturning = newVsReturningSegments.reduce((s, x) => s + x.value, 0);

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Customer Analytics
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Customer Analytics…" />}
      {error && <ErrorState label={`Couldn't load Customer Analytics: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="Unique Customers" value={formatNum(data.kpis.uniqueCustomers.value)} delta={data.kpis.uniqueCustomers.delta} />
            <KpiCard label="New Customers" value={formatNum(data.kpis.newCustomers.value)} delta={data.kpis.newCustomers.delta} />
            <KpiCard label="Returning Customers" value={formatNum(data.kpis.returningCustomers.value)} delta={data.kpis.returningCustomers.delta} />
            <KpiCard label="Repeat Rate" value={formatPct(data.kpis.repeatRate.value)} delta={data.kpis.repeatRate.delta} />
            <KpiCard label="Sales / Customer" value={formatPeso(data.kpis.salesPerCustomer.value)} delta={data.kpis.salesPerCustomer.delta} />
          </KpiRow>

          <Panel
            title="Customer Trend"
            subtitle="New vs Returning customers over time"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <ComboBarLineChart
              data={customerTrend}
              xKey="dateLabel"
              barKey="newCustomers"
              barName="New"
              barColor={hrh.blue}
              lineKey="returningCustomers"
              lineName="Returning"
              lineColor={hrh.accent}
              valueFormatter={formatNum}
            />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="New vs Returning">
              <DonutChart segments={newVsReturningSegments} centerValue={formatNum(totalNewVsReturning)} centerLabel="Customers" />
            </Panel>
            <Panel title="Customer Value Segments">
              <div className="space-y-2.5">
                {valueSegments.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-[13px]" style={{ color: hrh.ink2 }}>
                    <span>{s.label}</span>
                    <span className="font-semibold" style={{ color: hrh.ink }}>
                      {formatNum(s.value)} customers
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Purchase Frequency">
              <StackedAreaChart
                data={purchaseFrequencyRows}
                xKey="label"
                categories={[{ key: "customers", name: "Customers", color: hrh.blue }]}
                valueFormatter={formatNum}
                xAxisLabel="Orders per Customer"
                yAxisLabel="Customers"
              />
            </Panel>
            <Panel title="Customer Spend Distribution">
              <StackedAreaChart
                data={spendDistributionRows}
                xKey="label"
                categories={[{ key: "customers", name: "Customers", color: hrh.accent }]}
                valueFormatter={formatNum}
                xAxisLabel="Spend Range"
                yAxisLabel="Customers"
              />
            </Panel>
          </div>

          <Panel title="Top Customers" subtitle="Ranked by GMV for the selected period">
            <DataTable columns={TOP_CUSTOMER_COLUMNS} rows={data.topCustomers} paginate pageSize={10} />
          </Panel>
        </>
      )}
    </div>
  );
}
