import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { BarComparisonChart, DonutChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { bucketRows, bucketArrayField } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatPct, formatNum, formatCompactPeso } from "../format";

// How many individual labels to name in the "Other" bar's hover tooltip
// before collapsing the rest into a "+N more" tail — a specific bucket
// (one day, or one week/month once summed) rarely has more than a handful
// of non-top categories actually selling, so this is a display cap, not a
// data cap (the full per-bucket list is already computed server-side).
const OTHER_TOOLTIP_SHOWN = 8;

// Default ChartTooltip only shows each series' own number — for the
// "Other" bar specifically, that's an unexplained lump sum. This variant
// additionally names the real categories/subcategories collapsed into it
// for the SPECIFIC bucket being hovered (using the otherDetail array
// ContributionTrendPanel attaches to each data row via bucketArrayField),
// not just the whole-period breakdown shown as a footnote under the chart.
function OtherBreakdownTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md px-3 py-2 text-[12px] max-w-[280px]"
      style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}
    >
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => {
        const otherDetail = p.dataKey === "Other" ? p.payload?.otherDetail || [] : null;
        return (
          <div key={p.dataKey} className="mb-1 last:mb-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span style={{ color: "#a3adba" }}>{p.name}:</span>
              <span className="font-semibold">{valueFormatter(p.value)}</span>
            </div>
            {otherDetail && otherDetail.length > 0 && (
              <div className="ml-4 mt-1 pl-2 space-y-0.5" style={{ borderLeft: `1px solid ${hrh.navyBorder}` }}>
                {otherDetail.slice(0, OTHER_TOOLTIP_SHOWN).map((o) => (
                  <div key={o.label} className="flex items-center justify-between gap-3" style={{ color: "#a3adba" }}>
                    <span className="truncate">{o.label}</span>
                    <span className="shrink-0" style={{ color: "#fff" }}>
                      {valueFormatter(o.gmv)}
                    </span>
                  </div>
                ))}
                {otherDetail.length > OTHER_TOOLTIP_SHOWN && (
                  <div style={{ color: "#a3adba" }}>+{otherDetail.length - OTHER_TOOLTIP_SHOWN} more</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatRateWithCount(rate, count) {
  if (rate === null || rate === undefined) return "—";
  return `${formatPct(rate)} (${formatNum(count)})`;
}

const CHANNEL_TABLE_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "cancellationRate", label: "Cancellation Rate", render: (r) => formatRateWithCount(r.cancellationRate, r.cancellations) },
  { key: "returnRate", label: "Return Rate", render: (r) => formatRateWithCount(r.returnRate, r.returns) },
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
// list instead of a fixed GMV/Orders pair. `otherBreakdown` names what's
// actually inside the gray "Other" bar (its biggest real contributors, by
// GMV share) as a single compact line, rather than leaving it a black box.
function ContributionTrendPanel({ title, subtitle, contribution, bucket, onBucketChange }) {
  const series = contribution?.series || [];
  const otherDetailByBucket = bucketArrayField(contribution?.data, bucket, "otherDetail");
  const data = bucketRows(
    contribution?.data,
    bucket,
    series.map((s) => s.key),
  ).map((row) => ({ ...row, otherDetail: otherDetailByBucket.get(row.dateLabel) || [] }));
  const otherBreakdown = contribution?.otherBreakdown || [];
  const otherMoreCount = contribution?.otherMoreCount || 0;
  return (
    <Panel title={title} subtitle={subtitle} action={<TrendBucketPills value={bucket} onChange={onBucketChange} />} className="mb-4">
      <BarComparisonChart
        data={data}
        series={series}
        xKey="dateLabel"
        valueFormatter={formatCompactPeso}
        tooltipContent={OtherBreakdownTooltip}
      />
      {otherBreakdown.length > 0 && (
        <p className="text-[11px] mt-2.5" style={{ color: "#94a0ae" }}>
          <span style={{ color: "#5b6573", fontWeight: 600 }}>Other</span> includes:{" "}
          {otherBreakdown.map((o, i) => (
            <span key={o.label}>
              {i > 0 && ", "}
              {o.label} ({formatPct(o.pct, 0)})
            </span>
          ))}
          {otherMoreCount > 0 && `, +${otherMoreCount} more`}
        </p>
      )}
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
