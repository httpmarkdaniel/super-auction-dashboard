import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { TrendChart, DonutChart, BarComparisonChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

const KPI_CARDS = [
  { key: "gmv", label: "Sales (Gross)", formatter: formatPeso },
  { key: "nmv", label: "Sales (Net)", formatter: formatPeso },
  { key: "transactions", label: "Transactions", formatter: formatNum },
  { key: "avgBasket", label: "Avg Basket Value", formatter: formatPeso },
];

const COMPARE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const DEPARTMENT_COLUMNS = [
  { key: "department", label: "Department" },
  { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
  { key: "transactions", label: "Transactions", render: (r) => formatNum(r.transactions) },
  { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
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

// Real ClickHouse-backed Sales Analytics — see api/_retail-sales-analytics.js
// (dispatched via ?report=salesAnalytics). Sales Trend is bucketed from the
// page's OWN selected Date Range (unlike Executive Overview's fixed
// trailing window) — this page answers "how did the period I picked play
// out," not "what does the last N buckets look like regardless of filter."
// Sales by Store always shows all 11 branches regardless of the Store
// filter (see that file's own comment).
export default function SalesAnalytics({ filters }) {
  const { store, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [compareTo, setCompareTo] = useState("week");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (st, p, cmp, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ store: st, ...p, compareTo: cmp, report: "salesAnalytics" });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
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
    load(store, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [store, params, compareTo, ready, load]);

  const salesTrend = bucketRows(data?.salesTrend, trendBucket, ["nmv", "transactions"]);
  const salesByStore = (data?.salesByStore || []).map((r) => ({ label: r.store, value: r.gmv }));
  const departmentSegments = (data?.topDepartments || []).map((d, i) => ({ label: d.department, value: d.gmv, color: retail.series[i % retail.series.length] }));
  const totalDeptGmv = (data?.topDepartments || []).reduce((s, d) => s + d.gmv, 0);
  const periodLabel = data?.meta?.current ? effectivePeriodLabel(data.meta.current) : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Sales Analytics
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Sales trend, store comparison, and department breakdown
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: retail.muted }}>
              Compare to
            </span>
            <TrendBucketPills value={compareTo} onChange={setCompareTo} options={COMPARE_OPTIONS} />
          </div>
          {data?.meta?.current && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
              {periodLabel}
            </span>
          )}
        </div>
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Sales Analytics…" />}
      {error && <ErrorState label={`Couldn't load Sales Analytics: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            {KPI_CARDS.map((c) => {
              const k = data.kpis[c.key];
              return (
                <KpiCard
                  key={c.key}
                  label={c.label}
                  value={c.formatter(k.value)}
                  delta={k.delta}
                  previousLabel={c.formatter(k.previous)}
                />
              );
            })}
          </KpiRow>

          <Panel
            title="Sales Trend"
            subtitle={`${periodLabel} — by ${trendBucket}`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <TrendChart data={salesTrend} xKey="dateLabel" series={[{ key: "nmv", name: "Sales", color: retail.good }]} valueFormatter={formatCompactPeso} />
          </Panel>

          <Panel title="Sales by Store" subtitle="All 11 branches, current period — independent of the Store filter above" className="mb-4">
            <BarComparisonChart data={salesByStore} xKey="label" series={[{ key: "value", name: "Sales", color: retail.blue }]} valueFormatter={formatCompactPeso} horizontal />
          </Panel>

          <Panel title="Sales by Department" subtitle="Top 12 departments + Other, by gross sales" className="mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-start">
              <DonutChart segments={departmentSegments} centerValue={formatCompactPeso(totalDeptGmv)} centerLabel="Total Sales" />
              <DataTable columns={DEPARTMENT_COLUMNS} rows={data.topDepartments} paginate pageSize={13} emptyLabel="No sales in this period." />
            </div>
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: retail.ink2 }}>
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
