import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { TrendChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

const TREND_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const SUBCATEGORY_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
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

// Real ClickHouse-backed Category Performance — see
// api/_retail-category-performance.js (dispatched via
// ?report=categoryPerformance). Department is the usable top-level
// grouping (~30-80 real values depending on scope); the underlying
// category_name field is far too fragmented (~2,000 raw values) to group
// by directly, so it only appears as each department's own top
// sub-categories in the row-click drill-down below.
export default function CategoryPerformance({ filters }) {
  const { store, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [drilldownDept, setDrilldownDept] = useState(null);

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (st, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ store: st, ...p, report: "categoryPerformance" });
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
    load(store, params, controller.signal);
    return () => controller.abort();
  }, [store, params, ready, load]);

  const topDeptNames = data?.topDepartmentNames || [];
  const departmentTrend = bucketRows(data?.departmentTrend, trendBucket, topDeptNames);
  const periodLabel = data?.meta?.current ? effectivePeriodLabel(data.meta.current) : "";
  const drilldownRows = drilldownDept ? data?.subcategoriesByDepartment?.[drilldownDept] || [] : [];

  const DEPARTMENT_COLUMNS = [
    { key: "department", label: "Department" },
    { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
    { key: "transactions", label: "Transactions", render: (r) => formatNum(r.transactions) },
    { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Category Performance
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Sales by department — click a row for its top sub-categories
          </p>
        </div>
        {data?.meta?.current && (
          <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
            {periodLabel}
          </span>
        )}
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Category Performance…" />}
      {error && <ErrorState label={`Couldn't load Category Performance: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="Total Sales" value={formatPeso(data.kpis.totalGmv.value)} />
            <KpiCard label="Departments With Sales" value={formatNum(data.kpis.totalDepartments.value)} />
            {data.kpis.topDepartment && (
              <KpiCard label="Top Department" value={data.kpis.topDepartment.department} sub={`${formatPct(data.kpis.topDepartment.sharePct)} of sales`} />
            )}
          </KpiRow>

          <Panel
            title="Department Trend"
            subtitle={`Top ${topDeptNames.length} departments by sales, ${periodLabel}`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} options={TREND_OPTIONS} />}
            className="mb-4"
          >
            <TrendChart
              data={departmentTrend}
              xKey="dateLabel"
              series={topDeptNames.map((name, i) => ({ key: name, name, color: retail.series[i % retail.series.length] }))}
              valueFormatter={formatCompactPeso}
            />
          </Panel>

          <Panel title="Department Breakdown" subtitle="Click a row for its top sub-categories" className="mb-4">
            <DataTable
              columns={DEPARTMENT_COLUMNS}
              rows={data.departments}
              onRowClick={(r) => setDrilldownDept(r.department)}
              paginate
              pageSize={15}
              emptyLabel="No sales in this period."
            />
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

          <Modal open={Boolean(drilldownDept)} onClose={() => setDrilldownDept(null)} title={drilldownDept || ""} subtitle={`Top sub-categories — ${periodLabel}`}>
            <DataTable columns={SUBCATEGORY_COLUMNS} rows={drilldownRows} emptyLabel="No sub-category detail for this department." />
          </Modal>
        </>
      )}
    </div>
  );
}
