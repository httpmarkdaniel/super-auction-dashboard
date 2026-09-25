import { useEffect, useState } from "react";
import Panel from "../../retail/components/Panel";
import Pagination from "../../retail/components/Pagination";
import ToggleSm from "../../retail/components/ToggleSm";
import { LoadingState, ErrorState, EmptyState } from "../../retail/components/States";
import { retail } from "../../retail/theme";
import { formatPeso, formatNum } from "../../retail/format";
import StoreMultiSelect from "../components/StoreMultiSelect";
import { fetchCa, formatDate } from "../api";
import { SEGMENTS, SEGMENT_COLOR } from "../segments";

const PAGE_SIZE = 25;
const EXPORT_CHUNK = 5000;

// `sort` = api/_customer-analytics.js SORTS key; columns without one
// aren't sortable. `csv` = value written to the export.
const COLUMNS = [
  { key: "customerName", label: "Customer", sort: "name", width: 190 },
  { key: "email", label: "Email", maxWidth: 200 },
  { key: "phone", label: "Phone" },
  { key: "firstOrder", label: "First Order", sort: "firstOrder", render: (r) => formatDate(r.firstOrder) },
  { key: "lastVisit", label: "Last Visit", sort: "lastVisit", render: (r) => formatDate(r.lastVisit) },
  { key: "daysInactive", label: "Days Inactive", sort: "daysInactive", render: (r) => formatNum(r.daysInactive) },
  { key: "lastItem", label: "Last Item Bought", maxWidth: 200 },
  { key: "topCategory", label: "Primary Category" },
  { key: "allStores", label: "All Stores Visited", maxWidth: 260 },
  { key: "topStore", label: "Frequent Store" },
  { key: "topSc", label: "Frequent Assisting SC", maxWidth: 180 },
  { key: "lifetimeSales", label: "Lifetime Sales", sort: "sales", render: (r) => formatPeso(r.lifetimeSales), csv: (r) => r.lifetimeSales.toFixed(2) },
  { key: "visits", label: "Visits", sort: "visits", render: (r) => formatNum(r.visits) },
  {
    key: "segment",
    label: "Segment",
    render: (r) => (
      <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${SEGMENT_COLOR[r.segment]}1f`, color: SEGMENT_COLOR[r.segment] }}>
        {r.segment}
      </span>
    ),
  },
];

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Every customer who ever bought at the selected stores, one row per
// customer name, all time — the dashboard version of the business's own
// Superset customer list. Server-paged and server-sorted (the full list
// can be 380k+ customers); Export CSV pulls every matching row in chunks.
export default function CustomerExplorer({ stores, storesError, preset }) {
  const [sel, setSel] = useState(preset.stores || []);
  const [match, setMatch] = useState(preset.match || "any");
  const [scope, setScope] = useState(preset.scope || "selected");
  const [segment, setSegment] = useState(preset.segment || "");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "sales", dir: "desc" });
  const [pageInfo, setPageInfo] = useState({ key: "", page: 1 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);

  // Debounce the search box so every keystroke isn't a full query.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const effectiveMatch = sel.length >= 2 ? match : "any";
  const params = { stores: sel, match: effectiveMatch, scope, segment, q, sort: sort.key, dir: sort.dir };

  // The page number belongs to one filter combination — any filter change
  // lands back on page 1 without a separate reset render/fetch.
  const filterKey = JSON.stringify(params);
  const page = pageInfo.key === filterKey ? pageInfo.page : 1;
  const setPage = (p) => setPageInfo({ key: filterKey, page: p });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCa("caCustomers", { ...params, page, pageSize: PAGE_SIZE }, controller.signal)
      .then(setData)
      .catch((err) => err.name !== "AbortError" && setError(err.message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params is fully captured by filterKey
  }, [filterKey, page]);

  function onSort(col) {
    if (!col.sort) return;
    setSort((s) => (s.key === col.sort ? { key: s.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: col.sort, dir: col.sort === "name" ? "asc" : "desc" }));
  }

  async function exportCsv() {
    const total = data?.totalRows || 0;
    if (!total) return;
    const lines = [COLUMNS.map((c) => csvCell(c.label)).join(",")];
    try {
      for (let p = 1; (p - 1) * EXPORT_CHUNK < total; p++) {
        setExporting(Math.min(p * EXPORT_CHUNK, total));
        const chunk = await fetchCa("caCustomers", { ...params, page: p, pageSize: EXPORT_CHUNK });
        for (const r of chunk.rows) lines.push(COLUMNS.map((c) => csvCell(c.csv ? c.csv(r) : r[c.key])).join(","));
      }
      const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const storePart = sel.length ? sel.join("_").replace(/[^A-Za-z0-9_]+/g, "-") : "all-stores";
      a.href = url;
      a.download = `customers_${storePart}${segment ? `_${segment}` : ""}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalRows / PAGE_SIZE)) : 1;
  const segCounts = data?.segments;

  let summary = "Every registered customer, all time.";
  if (sel.length === 1) summary = `Customers who have ever bought at ${sel[0]}.`;
  else if (sel.length > 1) summary = `Customers who have ever bought at ${effectiveMatch === "all" ? "ALL of" : "ANY of"} ${sel.join(", ")}.`;
  if (sel.length) summary += scope === "selected" ? " Metrics count purchases at the selected stores only." : " Metrics count purchases at every store.";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Customer Explorer
        </div>
      </div>

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <StoreMultiSelect stores={stores} value={sel} onChange={setSel} />
          {sel.length >= 2 && (
            <ToggleSm
              value={match}
              onChange={setMatch}
              options={[
                { key: "any", label: "Any selected store" },
                { key: "all", label: "All selected stores" },
              ]}
            />
          )}
          {sel.length >= 1 && (
            <ToggleSm
              value={scope}
              onChange={setScope}
              options={[
                { key: "selected", label: "Metrics: selected stores" },
                { key: "all", label: "Metrics: all stores" },
              ]}
            />
          )}
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search name, email or phone…"
            className="text-[13px] px-3 h-10 rounded-xl outline-none flex-1 min-w-[200px]"
            style={{ background: retail.bg, border: `1px solid ${retail.border}`, color: retail.ink }}
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data?.totalRows || exporting !== null}
            className="text-[13px] font-semibold px-3.5 h-10 rounded-xl disabled:opacity-50"
            style={{ background: retail.navy, color: "#fff" }}
          >
            {exporting !== null ? `Exporting ${formatNum(exporting)} / ${formatNum(data.totalRows)}…` : `Export CSV${data ? ` (${formatNum(data.totalRows)})` : ""}`}
          </button>
        </div>
        <p className="text-[12px] mt-2.5 mb-0" style={{ color: retail.muted }}>
          {summary}
        </p>
        {storesError && <p className="text-[12px] mt-1 mb-0" style={{ color: retail.bad }}>Couldn't load the store list: {storesError}</p>}

        <div className="flex flex-wrap gap-2 mt-3">
          {[{ key: "", color: retail.navy }, ...SEGMENTS].map((s) => {
            const active = segment === s.key;
            const count = segCounts ? (s.key ? segCounts[s.key].customers : data.totalCustomers) : null;
            return (
              <button
                key={s.key || "all"}
                type="button"
                onClick={() => setSegment(s.key)}
                title={s.definition}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={active ? { background: s.color, color: "#fff", border: `1px solid ${s.color}` } : { background: retail.surface, color: retail.ink2, border: `1px solid ${retail.border}` }}
              >
                {s.key && <span className="w-2 h-2 rounded-full" style={{ background: active ? "#fff" : s.color }} />}
                {s.key || "All"}
                {count !== null && <span style={{ opacity: 0.75 }}>{formatNum(count)}</span>}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        {loading && !data && <LoadingState label="Loading customers… (all-time, can take a few seconds)" />}
        {error && <ErrorState label={`Couldn't load customers: ${error}`} />}
        {data && !error && data.rows.length === 0 && <EmptyState label="No customers match these filters." />}
        {data && !error && data.rows.length > 0 && (
          <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    {COLUMNS.map((c, i) => {
                      const active = c.sort && sort.key === c.sort;
                      return (
                        <th
                          key={c.key}
                          onClick={() => onSort(c)}
                          className="text-left px-2.5 py-2.5 font-semibold whitespace-nowrap text-[12px] uppercase tracking-[0.02em] select-none"
                          style={{
                            color: active ? retail.blueDark : retail.muted,
                            background: retail.tableHeaderBg,
                            cursor: c.sort ? "pointer" : undefined,
                            ...(i === 0 ? { position: "sticky", left: 0, zIndex: 2, minWidth: c.width } : null),
                          }}
                        >
                          {c.label}
                          {active && (sort.dir === "desc" ? " ↓" : " ↑")}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.customerName} style={{ borderBottom: "1px solid #ebf0f6" }}>
                      {COLUMNS.map((c, i) => (
                        <td
                          key={c.key}
                          className={`px-3 py-2 whitespace-nowrap ${c.maxWidth ? "overflow-hidden text-ellipsis" : ""}`}
                          style={{
                            color: retail.ink,
                            ...(c.maxWidth ? { maxWidth: c.maxWidth } : null),
                            ...(i === 0 ? { position: "sticky", left: 0, zIndex: 1, background: retail.surface, fontWeight: 600, minWidth: c.width } : null),
                          }}
                          title={c.maxWidth && typeof r[c.key] === "string" ? r[c.key] : undefined}
                        >
                          {c.render ? c.render(r) : r[c.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} totalRows={data.totalRows} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        )}
      </Panel>
    </div>
  );
}
