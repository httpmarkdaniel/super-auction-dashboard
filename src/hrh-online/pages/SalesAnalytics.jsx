import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { BarComparisonChart, DonutChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { bucketRows } from "../trendBucket";
import { formatPeso, formatPct, formatNum, formatCompactPeso } from "../format";

const CHANNEL_TABLE_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "cancellationRate", label: "Cancellation Rate", render: (r) => formatPct(r.cancellationRate) },
  { key: "returnRate", label: "Return Rate", render: (r) => formatPct(r.returnRate) },
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

// A top-N-by-GMV + "Other" { series, data } contribution trend (see
// api/hrh-sales-analytics.js's buildTopSeriesTrend) rendered as a grouped
// bar chart, re-bucketable Day/Week/Month client-side — same pattern as
// Executive Overview's Sales Trend, just with a dynamic per-category series
// list instead of a fixed GMV/Orders pair.
function ContributionTrendPanel({ title, subtitle, contribution, bucket, onBucketChange }) {
  const series = contribution?.series || [];
  const data = bucketRows(
    contribution?.data,
    bucket,
    series.map((s) => s.key),
  );
  return (
    <Panel title={title} subtitle={subtitle} action={<TrendBucketPills value={bucket} onChange={onBucketChange} />} className="mb-4">
      <BarComparisonChart data={data} series={series} xKey="dateLabel" valueFormatter={formatCompactPeso} />
    </Panel>
  );
}

// Real ClickHouse-backed Sales Analytics — see api/hrh-sales-analytics.js
// for the queries (same locked GMV/NMV/Orders/Units/AOV contract as Product
// Analytics/Executive Overview). Channel Comparison always shows all 3
// channels (it IS the channel breakdown, so the filter would just hide
// rows); the panels below it respect the page's Channel + Date Range filter
// like everywhere else on the dashboard.
export default function SalesAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryBucket, setCategoryBucket] = useState("day");
  const [subcategoryBucket, setSubcategoryBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (ch, params, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...params });
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

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Sales Analytics
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Sales Analytics…" />}
      {error && <ErrorState label={`Couldn't load Sales Analytics: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Channel Comparison" className="mb-4">
            <DataTable columns={CHANNEL_TABLE_COLUMNS} rows={data.channelComparison} />
          </Panel>

          <ContributionTrendPanel
            title="Category Contribution"
            subtitle="Top categories by GMV, bucketed by day/week/month"
            contribution={data.categoryContribution}
            bucket={categoryBucket}
            onBucketChange={setCategoryBucket}
          />

          <ContributionTrendPanel
            title="Subcategory Contribution"
            subtitle="Top subcategories by GMV, bucketed by day/week/month"
            contribution={data.subcategoryContribution}
            bucket={subcategoryBucket}
            onBucketChange={setSubcategoryBucket}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="Payment Type" subtitle={data.meta?.checkoutCoverageNote || "Orders share by payment method"}>
              <DonutChart
                segments={data.paymentType}
                centerValue={formatNum(data.paymentType.reduce((s, x) => s + x.value, 0))}
                centerLabel="Orders"
              />
            </Panel>
            <Panel title="Checkout / Fulfillment Method" subtitle={data.meta?.checkoutCoverageNote || "Orders share by fulfillment method"}>
              <DonutChart
                segments={data.fulfillmentMethod}
                centerValue={formatNum(data.fulfillmentMethod.reduce((s, x) => s + x.value, 0))}
                centerLabel="Orders"
              />
              <p className="text-[11px] mt-2.5" style={{ color: "#94a0ae" }}>
                A separate dimension from Payment Type above — Pickup is fulfillment behavior, not a payment method.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
