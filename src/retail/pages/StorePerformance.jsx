import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ToggleSm from "../components/ToggleSm";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart } from "../components/Charts";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

const VIEW_OPTIONS = [
  { key: "weekly", label: "Weekly (WoW)" },
  { key: "mtd", label: "MTD (vs Last Month)" },
];

// Real ClickHouse-backed Store Performance — see
// api/_retail-store-performance.js (dispatched via ?report=storePerformance).
export default function StorePerformance({ filters }) {
  const { segment } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("weekly");

  const load = useCallback(async (seg, v, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, view: v, report: "storePerformance" });
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
    load(segment, view, controller.signal);
    return () => controller.abort();
  }, [segment, view, load]);

  const WEEKLY_COLUMNS = [
    { key: "store", label: "Store" },
    { key: "curRev", label: "This Week", render: (r) => formatPeso(r.curRev) },
    { key: "prevRev", label: "Last Week", render: (r) => formatPeso(r.prevRev) },
    { key: "deltaPct", label: "WoW %", render: (r) => (r.deltaPct === null ? "—" : `${r.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(r.deltaPct).toFixed(1)}%`) },
    { key: "txn", label: "Txn (TW/LW)", render: (r) => `${formatNum(r.curTxn)} / ${formatNum(r.prevTxn)}` },
    { key: "units", label: "Units (TW/LW)", render: (r) => `${formatNum(r.curUnits)} / ${formatNum(r.prevUnits)}` },
  ];
  const MTD_COLUMNS = [
    { key: "store", label: "Store" },
    { key: "curRev", label: "MTD Actual", render: (r) => formatPeso(r.curRev) },
    { key: "prevRev", label: "Last Month", render: (r) => formatPeso(r.prevRev) },
    { key: "deltaPct", label: "vs Last Month %", render: (r) => (r.deltaPct === null ? "—" : `${r.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(r.deltaPct).toFixed(1)}%`) },
    { key: "target", label: "Full Month Target", render: (r) => (r.target > 0 ? formatPeso(r.target) : "—") },
    { key: "attainmentPct", label: "Attainment", render: (r) => (r.attainmentPct === null ? "—" : formatPct(r.attainmentPct)) },
  ];

  const donutSegments = (data?.table || []).map((r, i) => ({ label: r.store, value: r.curRev, color: retail.series[i % retail.series.length] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Store Performance
        </div>
      </div>

      {loading && !data && <LoadingState label="Loading Store Performance…" />}
      {error && <ErrorState label={`Couldn't load Store Performance: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Store-Level Performance" action={<ToggleSm value={view} onChange={setView} options={VIEW_OPTIONS} />} className="mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
              <DataTable columns={view === "weekly" ? WEEKLY_COLUMNS : MTD_COLUMNS} rows={data.table} paginate pageSize={12} emptyLabel="No sales in this period." />
              <DonutChart segments={donutSegments} centerValue={formatCompactPeso(data.totals.curRev)} centerLabel="Total" />
            </div>
          </Panel>

          <Panel title="MTD Target Achievement (Always MTD)">
            <DataTable
              columns={[
                { key: "store", label: "Store" },
                { key: "curRev", label: "MTD Actual", render: (r) => formatPeso(r.curRev) },
                { key: "target", label: "Full Month Target", render: (r) => (r.target > 0 ? formatPeso(r.target) : "—") },
                { key: "attainmentPct", label: "Attainment", render: (r) => (r.attainmentPct === null ? "—" : formatPct(r.attainmentPct)) },
              ]}
              rows={view === "mtd" ? data.table : []}
              emptyLabel={view === "mtd" ? "No sales this month." : "Switch to the MTD toggle above to see target achievement."}
              paginate
              pageSize={12}
            />
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
