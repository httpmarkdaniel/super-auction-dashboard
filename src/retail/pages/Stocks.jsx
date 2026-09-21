import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { KpiCard, KpiRow } from "../components/Kpi";
import { LoadingState, ErrorState } from "../components/States";
import { retail } from "../theme";
import { formatPeso, formatNum } from "../format";

// Clickable column header for the two sortable columns (Qty/Stock Value) —
// click toggles asc/desc, an arrow marks whichever column is currently
// active. Same page-local pattern as HRH Online's own Stocks tab
// (src/hrh-online/pages/BarcodeAnalytics.jsx) — this is the only table on
// this page that needs sorting, so it's kept local rather than a generic
// DataTable feature.
function SortableHeader({ label, active, dir, onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 uppercase tracking-[0.02em]" style={{ color: retail.muted }}>
      {label}
      <span style={{ opacity: active ? 1 : 0.35 }}>{active && dir === "asc" ? "▲" : "▼"}</span>
    </button>
  );
}

function stockColumns(sortKey, sortDir, onSort) {
  return [
    { key: "product", label: "Product", maxWidth: 360 },
    {
      key: "qty",
      label: <SortableHeader label="On-Hand Qty" active={sortKey === "qty"} dir={sortDir} onClick={() => onSort("qty")} />,
      render: (r) => formatNum(r.qty),
    },
    {
      key: "stockValue",
      label: <SortableHeader label="On-Hand Stock Value" active={sortKey === "stockValue"} dir={sortDir} onClick={() => onSort("stockValue")} />,
      render: (r) => formatPeso(r.stockValue),
    },
  ];
}

// Real ClickHouse-backed Stocks — see api/_retail-stocks.js (dispatched
// via ?report=stocks). A live current-inventory snapshot, not affected by
// the Date Range filter (see that file's own comment) — Segment/Store
// still apply, same as every other page.
export default function Stocks({ filters }) {
  const { segment, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("stockValue");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(async (seg, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...(st ? { store: st } : {}), report: "stocks" });
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
    load(segment, store, controller.signal);
    return () => controller.abort();
  }, [segment, store, load]);

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    const sign = sortDir === "asc" ? 1 : -1;
    return [...data.items].sort((a, b) => sign * (a[sortKey] - b[sortKey]));
  }, [data, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Stocks
        </div>
      </div>

      {loading && !data && <LoadingState label="Loading Stocks…" />}
      {error && <ErrorState label={`Couldn't load Stocks: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="On-Hand Stock" subtitle="Live current inventory, by product — not affected by the Date Range filter above." className="mb-4">
            <KpiRow>
              <KpiCard label="On-Hand Qty" value={formatNum(data.totals.qty)} />
              <KpiCard label="On-Hand Stock Value" value={formatPeso(data.totals.stockValue)} />
            </KpiRow>
            <div className="mt-4">
              <DataTable columns={stockColumns(sortKey, sortDir, toggleSort)} rows={sortedItems} paginate pageSize={12} emptyLabel="No products currently on hand." />
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
