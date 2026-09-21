import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ToggleSm from "../components/ToggleSm";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, BarComparisonChart } from "../components/Charts";
import { formatShortDateLabel } from "../trendBucket";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

const VIEW_OPTIONS = [
  { key: "daily", label: "Daily (This Month)" },
  { key: "weekly", label: "Weekly (Last 4 Weeks)" },
];

const ITEM_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 320 },
  { key: "stores", label: "Store(s)" },
  { key: "channel", label: "Channel" },
  { key: "sales", label: "Sales", render: (r) => formatPeso(r.sales) },
  { key: "qty", label: "Qty", render: (r) => formatNum(r.qty) },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatWeekLabel(weekStart, weekEnd) {
  const [, sm, sd] = weekStart.split("-").map(Number);
  const [, em, ed] = weekEnd.split("-").map(Number);
  return sm === em ? `${SHORT_MONTHS[sm - 1]}${sd}-${ed}` : `${SHORT_MONTHS[sm - 1]}${sd}-${SHORT_MONTHS[em - 1]}${ed}`;
}

// Real ClickHouse-backed Trend — see api/_retail-trend.js (dispatched via
// ?report=trend). Daily view covers the current calendar month to date;
// Weekly covers the last 4 full Mon-Sun weeks. Click any point on the
// Daily chart for that day's top items (a separate on-demand fetch, see
// ?day=YYYY-MM-DD).
export default function Trend({ filters }) {
  const { segment, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("daily");
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);

  const load = useCallback(async (seg, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...(st ? { store: st } : {}), report: "trend" });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setData(json);
      if (json.daily?.length) {
        setSelectedDay(json.daily[json.daily.length - 1].date);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(segment, store, controller.signal);
    return () => controller.abort();
  }, [segment, store, load]);

  const loadDayDetail = useCallback(async (seg, st, day, signal) => {
    setDayLoading(true);
    try {
      const qs = new URLSearchParams({ segment: seg, ...(st ? { store: st } : {}), report: "trend", day });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setDayDetail(json);
    } catch (err) {
      if (err.name === "AbortError") return;
    } finally {
      setDayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedDay) return;
    const controller = new AbortController();
    loadDayDetail(segment, store, selectedDay, controller.signal);
    return () => controller.abort();
  }, [segment, store, selectedDay, loadDayDetail]);

  const dailyByLabel = useMemo(() => {
    const map = new Map();
    (data?.daily || []).forEach((r) => map.set(formatShortDateLabel(r.date), r.date));
    return map;
  }, [data]);
  const dailyChartData = (data?.daily || []).map((r) => ({ dateLabel: formatShortDateLabel(r.date), gmv: r.revenue, orders: r.transactions, units: r.units }));
  const weeklyChartData = (data?.weekly || []).map((r) => ({ label: formatWeekLabel(r.weekStart, r.weekEnd), value: r.revenue }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Trend
          </div>
          <p className="text-[11.5px] mt-0.5" style={{ color: retail.muted }}>
            Fixed trailing windows (this month to date / last 4 weeks) — not affected by the Date Range filter above.
          </p>
        </div>
      </div>

      {loading && !data && <LoadingState label="Loading Trend…" />}
      {error && <ErrorState label={`Couldn't load Trend: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Revenue, Transactions &amp; Units — Combined View" action={<ToggleSm value={view} onChange={setView} options={VIEW_OPTIONS} />} className="mb-4">
            <div className="text-[11.5px] mb-2" style={{ color: retail.muted }}>
              {view === "daily" ? "Click any point for that day's top items." : "Revenue per full Mon-Sun week."}
            </div>
            {view === "daily" ? (
              <SalesTrendComboChart data={dailyChartData} onPointClick={(label) => dailyByLabel.has(label) && setSelectedDay(dailyByLabel.get(label))} />
            ) : (
              <BarComparisonChart data={weeklyChartData} xKey="label" series={[{ key: "value", name: "Revenue", color: retail.navy }]} valueFormatter={formatCompactPeso} />
            )}
          </Panel>

          <Panel title={`Item Detail for Selected Day: ${selectedDay ? formatShortDateLabel(selectedDay) : ""}`}>
            {dayLoading && <LoadingState label="Loading item detail…" />}
            {!dayLoading && dayDetail && <DataTable columns={ITEM_COLUMNS} rows={dayDetail.items} paginate pageSize={10} emptyLabel="No sales this day." />}
          </Panel>
        </>
      )}
    </div>
  );
}
