import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart } from "../components/Charts";
import StorePerformanceQuadrant from "../components/StorePerformanceQuadrant";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

// Real ClickHouse-backed Store Performance — see
// api/_retail-store-performance.js (dispatched via ?report=storePerformance).
// Date Range is now the dashboard-wide Header filter; "MTD" is still the
// one preset with a real target/attainment column (see api file comment).
export default function StorePerformance({ filters }) {
  const { segment, dateRange, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMtd = dateRange === "mtd";

  const load = useCallback(async (seg, dr, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...dateRangeParams(dr), ...(st ? { store: st } : {}), report: "storePerformance" });
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
    load(segment, dateRange, store, controller.signal);
    return () => controller.abort();
  }, [segment, dateRange, store, load]);

  const CURRENT_PERIOD_COLUMNS = [
    { key: "store", label: "Store" },
    { key: "curRev", label: "Current Period", render: (r) => formatPeso(r.curRev) },
    { key: "prevRev", label: "Previous Period", render: (r) => formatPeso(r.prevRev) },
    { key: "deltaPct", label: "Change %", render: (r) => (r.deltaPct === null ? "—" : `${r.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(r.deltaPct).toFixed(1)}%`) },
    { key: "txn", label: "Txn (Cur/Prev)", render: (r) => `${formatNum(r.curTxn)} / ${formatNum(r.prevTxn)}` },
    { key: "units", label: "Units (Cur/Prev)", render: (r) => `${formatNum(r.curUnits)} / ${formatNum(r.prevUnits)}` },
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

      {loading && !data && <LoadingState label="Loading Store Performance…" />}
      {error && <ErrorState label={`Couldn't load Store Performance: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Store-Level Performance" className="mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
              <DataTable columns={isMtd ? MTD_COLUMNS : CURRENT_PERIOD_COLUMNS} rows={data.table} paginate pageSize={12} emptyLabel="No sales in this period." />
              <DonutChart segments={donutSegments} centerValue={formatCompactPeso(data.totals.curRev)} centerLabel="Total" />
            </div>
          </Panel>

          <Panel title="MTD Target Achievement">
            <DataTable
              columns={[
                { key: "store", label: "Store" },
                { key: "curRev", label: "MTD Actual", render: (r) => formatPeso(r.curRev) },
                { key: "target", label: "Full Month Target", render: (r) => (r.target > 0 ? formatPeso(r.target) : "—") },
                { key: "attainmentPct", label: "Attainment", render: (r) => (r.attainmentPct === null ? "—" : formatPct(r.attainmentPct)) },
              ]}
              rows={isMtd ? data.table : []}
              emptyLabel={isMtd ? "No sales this month." : "Select the Month to Date preset in the Date Range filter above to see target achievement."}
              paginate
              pageSize={12}
            />
          </Panel>

          <StorePerformanceQuadrant filters={filters} />

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
