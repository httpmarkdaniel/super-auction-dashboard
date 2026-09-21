import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ToggleSm from "../components/ToggleSm";
import { LoadingState, ErrorState } from "../components/States";
import { TrendChart, BarComparisonChart } from "../components/Charts";
import { formatShortDateLabel } from "../trendBucket";
import { retail } from "../theme";
import { formatNum, formatPct } from "../format";

const CHART_VIEW_OPTIONS = [
  { key: "daily", label: "Daily (This Month)" },
  { key: "weekly", label: "Weekly (Last 4 Weeks)" },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatWeekLabel(weekStart) {
  const [, sm, sd] = weekStart.split("-").map(Number);
  return `${SHORT_MONTHS[sm - 1]} ${sd}`;
}

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

// Real ClickHouse-backed Foot Traffic — see api/_retail-foot-traffic.js
// (dispatched via ?report=footTraffic). Always the 9 core walk-in
// branches, regardless of the page's segment toggle — Wholesale/HRH
// Online have no foot-traffic concept (see that file's own comment). Store
// drill-down still applies (narrows to one of those 9, if picked). The
// "By Store" table's comparison window follows the dashboard-wide Date
// Range filter now; the trend chart above it stays a fixed trailing
// window (Daily/Weekly toggle), same convention as Trend.jsx.
export default function FootTraffic({ filters }) {
  const { dateRange, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartView, setChartView] = useState("daily");
  const isMtd = dateRange === "mtd";

  const load = useCallback(async (dr, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...dateRangeParams(dr), ...(st ? { store: st } : {}), report: "footTraffic" });
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
    const controller = new AbortController();
    load(dateRange, store, controller.signal);
    return () => controller.abort();
  }, [dateRange, store, load]);

  const dailyChart = (data?.daily || []).map((r) => ({ dateLabel: formatShortDateLabel(r.date), traffic: r.traffic }));
  const weeklyChart = (data?.weekly || []).map((r) => ({ label: formatWeekLabel(r.weekStart), value: r.traffic }));

  const TABLE_COLUMNS = [
    { key: "store", label: "Store" },
    { key: "traffic", label: isMtd ? "Traffic (MTD/Last Month)" : "Traffic (Cur/Prev)", render: (r) => `${formatNum(r.curTraffic)} / ${formatNum(r.prevTraffic)}` },
    { key: "txn", label: isMtd ? "Txn (MTD/Last Month)" : "Txn (Cur/Prev)", render: (r) => `${formatNum(r.curTransactions)} / ${formatNum(r.prevTransactions)}` },
    {
      key: "conv",
      label: isMtd ? "Conversion (MTD/Last Month)" : "Conversion (Cur/Prev)",
      render: (r) => `${formatPct(r.curConversionPct)} / ${formatPct(r.prevConversionPct)}`,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Foot Traffic
        </div>
      </div>

      {loading && !data && <LoadingState label="Loading Foot Traffic…" />}
      {error && <ErrorState label={`Couldn't load Foot Traffic: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Foot Traffic Trend" action={<ToggleSm value={chartView} onChange={setChartView} options={CHART_VIEW_OPTIONS} />} className="mb-4">
            {chartView === "daily" ? (
              <TrendChart data={dailyChart} xKey="dateLabel" series={[{ key: "traffic", name: "Foot Traffic", color: retail.navy }]} valueFormatter={formatNum} />
            ) : (
              <BarComparisonChart data={weeklyChart} xKey="label" series={[{ key: "value", name: "Foot Traffic", color: retail.navy }]} valueFormatter={formatNum} />
            )}
          </Panel>

          <Panel title="Foot Traffic &amp; Conversion (By Store)">
            <DataTable columns={TABLE_COLUMNS} rows={data.table} paginate pageSize={9} emptyLabel="No foot traffic in this period." />
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes" className="mt-4">
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
