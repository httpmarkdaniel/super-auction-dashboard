import { useCallback, useEffect, useRef, useState } from "react";
import DateFilter from "./DateFilter";
import { rangeLabel } from "./period";
import "./customer-analytics.css";

// Marketing dashboard (customer list) — layout and styling are a 1:1 port of
// public/LIVE DASHBOARD UNIFORM FORMAT.html (sidebar, topbar, alert bar,
// eyebrow/title/lead, KPI grid, table card with tabs + filter row, detail
// drawer, toast), rendered with real data from api/_customer-analytics.js
// (report=caStores/caCustomers via /api/retail-analytics). The date filter
// (default All time) picks who's listed — customers who bought in the
// period — and the lifecycle segment is measured at the period's end (see
// SEGMENTS). The topbar search matches department/category/subcategory;
// the store dropdown filters on All Store Visited.

const PAGE_SIZE = 10;
const EXPORT_CHUNK = 5000;

function peso(v) {
  return "₱" + Number(v).toLocaleString("en-PH", { maximumFractionDigits: 2 });
}
function num(v) {
  return Number(v || 0).toLocaleString("en-PH");
}
function pct(part, whole) {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}
// Marketing lifecycle segments — same rules as api/_customer-analytics.js
// SEGMENT_KEYS, with M = the month the selected period ends in and M-1 /
// M-2 the two months before it. `cond` builds the rule with real month
// names for the cards.
const SEGMENTS = [
  { key: "New", cls: "st-blue", goal: "Welcome & Onboard", cond: (m) => `First purchase ever is in ${m[0]}` },
  { key: "Retained", cls: "st-green", goal: "Reward Loyalty", cond: (m) => `Purchased in ${m[0]} AND (in ${m[1]} or ${m[2]})` },
  { key: "Reactivated", cls: "st-purple", goal: "Understand Return Driver", cond: (m) => `Purchased in ${m[0]} but zero sales in ${m[1]} and ${m[2]}` },
  { key: "Slipped", cls: "st-amber", goal: "Immediate Win-back", cond: (m) => `Zero sales in ${m[0]}, last visit within 60 days` },
  { key: "Inactive", cls: "st-red", goal: "Re-engagement Campaign", cond: (m) => `Zero sales in ${m[0]}, last visit over 60 days ago` },
];
const SEGMENT_BY_KEY = Object.fromEntries(SEGMENTS.map((x) => [x.key, x]));
function segClass(key) {
  return SEGMENT_BY_KEY[key]?.cls || "st-blue";
}
// ["Sep 2026", "Aug 2026", "Jul 2026"] for an as-of date of 2026-09-xx.
function segmentMonths(asOf) {
  const [y, mo] = (asOf || new Date().toISOString().slice(0, 10)).split("-").map(Number);
  return [0, 1, 2].map((back) => new Date(y, mo - 1 - back, 1).toLocaleDateString("en-PH", { month: "short", year: "numeric" }));
}
function csvCell(v) {
  return `"${String(v ?? "").replaceAll('"', '""')}"`;
}

// `sort` = api SORTS key (sortable header); `clip` truncates long text.
const COLUMNS = [
  { key: "customerName", label: "Customer Name", sort: "name", cls: "name nowrap" },
  { key: "email", label: "Email", cls: "clip" },
  { key: "phone", label: "Phone", cls: "mono nowrap" },
  { key: "firstOrder", label: "First Order Date", sort: "firstOrder", cls: "mono nowrap" },
  { key: "lastVisit", label: "Last Visit", sort: "lastVisit", cls: "mono nowrap" },
  { key: "daysInactive", label: "Days Inactive", sort: "daysInactive", cls: "nowrap", render: (r) => num(r.daysInactive) },
  { key: "lastItem", label: "Last Item Bought", cls: "clip" },
  { key: "topCategory", label: "Primary Category of Interest", cls: "nowrap" },
  { key: "allStores", label: "All Store Visited", cls: "clip" },
  { key: "topStore", label: "Frequent Store Visited", cls: "nowrap" },
  { key: "topSc", label: "Frequent Assisting SC", cls: "nowrap" },
  // Header reads "Sales in Period" once a date filter is on.
  { key: "sales", label: "Lifetime Sales", periodLabel: "Sales in Period", sort: "sales", cls: "nowrap", render: (r) => peso(Math.round(r.sales)) },
  { key: "segment", label: "Customer Segment", cls: "nowrap", render: (r) => <span className={`status ${segClass(r.segment)}`}>{r.segment}</span> },
];

// "Why matched" columns — shown right after Customer Name only while a
// department/category/subcategory search is active (row.match from the
// API): what they bought that put them in this search.
const MATCH_COLUMNS = [
  {
    key: "matchPaths",
    label: "Matched Dept › Category › Subcategory",
    cls: "match-cell",
    render: (r) =>
      r.match ? (
        <>
          <div className="match-path" title={r.match.paths.join("\n")}>
            {r.match.paths[0]}
          </div>
          {r.match.pathCount > 1 && <div className="sub">+{num(r.match.pathCount - 1)} more matching {r.match.pathCount - 1 === 1 ? "subcategory" : "subcategories"}</div>}
        </>
      ) : (
        <span className="sub">—</span>
      ),
  },
  {
    key: "matchItems",
    label: "Matched Items",
    cls: "match-cell",
    render: (r) =>
      r.match ? (
        <>
          <div className="name">
            {num(r.match.items)} {r.match.items === 1 ? "item" : "items"}
          </div>
          <div className="sub match-last" title={r.match.lastItem}>
            latest: {r.match.lastItem} · <span className="mono">{r.match.lastDate}</span>
          </div>
        </>
      ) : (
        <span className="sub">—</span>
      ),
  },
  { key: "matchSales", label: "Matched Sales", cls: "nowrap", render: (r) => (r.match ? peso(Math.round(r.match.sales)) : <span className="sub">—</span>) },
];

const MATCH_CSV_COLUMNS = [
  { label: "Matched Dept > Category > Subcategory", get: (r) => (r.match ? r.match.paths.join(" | ") : "") },
  { label: "Matched Items", get: (r) => (r.match ? r.match.items : "") },
  { label: "Latest Matched Item", get: (r) => (r.match ? r.match.lastItem : "") },
  { label: "Latest Matched Date", get: (r) => (r.match ? r.match.lastDate : "") },
  { label: "Matched Sales", get: (r) => (r.match ? r.match.sales.toFixed(2) : "") },
];

const CSV_COLUMNS = [
  ...COLUMNS.map((c) => ({ key: c.key, label: c.label, periodLabel: c.periodLabel })),
  { key: "visits", label: "Visits" },
];

async function fetchCa(report, params = {}, signal) {
  const qs = new URLSearchParams({ report });
  for (const [k, v] of Object.entries(params)) if (v !== "" && v !== undefined && v !== null) qs.set(k, String(v));
  const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // handled below
  }
  if (!res.ok || !json || json.error) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
  return json;
}

function Kpi({ label, value, meta, delta, type, info }) {
  const cls = type === "up" ? "delta-up" : type === "down" ? "delta-down" : type === "warn" ? "delta-warn" : "";
  return (
    <div className="card kpi">
      <div className="khead">
        <div className="klabel">{label}</div>
        <div className="info" title={info}>
          ⓘ
        </div>
      </div>
      <div className="kvalue">{value}</div>
      <div className="kmeta">{meta}</div>
      <div className={`kmeta ${cls}`} style={{ marginTop: 10 }}>
        {delta}
      </div>
    </div>
  );
}

export default function MarketingApp() {
  const [dark, setDark] = useState(false);
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState("");
  const [catInput, setCatInput] = useState("");
  const [cat, setCat] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("");
  const [period, setPeriod] = useState({ key: "all", from: "", to: "" });
  const [sort, setSort] = useState({ key: "sales", dir: "desc" });
  const [pageInfo, setPageInfo] = useState({ key: "", page: 1 });
  const [compact, setCompact] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(() => new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 1800);
  }, []);

  useEffect(() => {
    document.title = "Marketing · HMR Analytics";
    const controller = new AbortController();
    fetchCa("caStores", {}, controller.signal)
      .then((j) => setStores(j.stores))
      .catch((err) => err.name !== "AbortError" && toast(`Couldn't load stores: ${err.message}`));
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setDrawer(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      controller.abort();
      document.removeEventListener("keydown", onKey);
    };
  }, [toast]);

  // Debounce both search boxes so every keystroke isn't a full query.
  useEffect(() => {
    const t = setTimeout(() => setCat(catInput.trim()), 450);
    return () => clearTimeout(t);
  }, [catInput]);
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 450);
    return () => clearTimeout(t);
  }, [qInput]);

  const params = { from: period.from, to: period.to, store, cat, q, segment, sort: sort.key, dir: sort.dir };
  // Page belongs to one filter combination — any filter change lands on
  // page 1 without a separate reset render/fetch.
  const filterKey = JSON.stringify(params);
  const page = pageInfo.key === filterKey ? pageInfo.page : 1;
  const setPage = (p) => setPageInfo({ key: filterKey, page: p });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCa("caCustomers", { ...params, page, pageSize: PAGE_SIZE }, controller.signal)
      .then((j) => {
        setData(j);
        setUpdated(new Date());
      })
      .catch((err) => err.name !== "AbortError" && setError(err.message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params is fully captured by filterKey
  }, [filterKey, page, refreshKey]);

  function onSortHeader(col) {
    if (!col.sort) return;
    setSort((s) => (s.key === col.sort ? { key: s.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: col.sort, dir: col.sort === "name" ? "asc" : "desc" }));
  }

  async function exportCsv() {
    const total = data?.totalRows || 0;
    if (!total) return toast("Nothing to export");
    setExporting(true);
    try {
      const withMatch = Boolean(data?.meta?.catActive);
      const cols = [...CSV_COLUMNS.map((c) => ({ label: colLabel(c), get: (r) => r[c.key] })), ...(withMatch ? MATCH_CSV_COLUMNS : [])];
      const lines = [cols.map((c) => csvCell(c.label)).join(",")];
      for (let p = 1; (p - 1) * EXPORT_CHUNK < total; p++) {
        toast(`Exporting ${num(Math.min(p * EXPORT_CHUNK, total))} of ${num(total)}…`);
        const chunk = await fetchCa("caCustomers", { ...params, page: p, pageSize: EXPORT_CHUNK });
        for (const r of chunk.rows) lines.push(cols.map((c) => csvCell(c.get(r))).join(","));
      }
      const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const parts = ["marketing-customers", period.key === "all" ? "all-time" : `${period.from}_to_${period.to}`, store || "all-stores", cat, segment].filter(Boolean).join("_").replace(/[^A-Za-z0-9_]+/g, "-");
      a.href = URL.createObjectURL(blob);
      a.download = `${parts}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("CSV exported");
    } catch (err) {
      toast(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  function refresh() {
    setRefreshKey((k) => k + 1);
    toast("Dashboard refreshed");
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast(`Couldn't copy ${label.toLowerCase()}`);
    }
  }

  const tableColumns = data?.meta?.catActive ? [COLUMNS[0], ...MATCH_COLUMNS, ...COLUMNS.slice(1)] : COLUMNS;
  const total = data?.totalCustomers ?? 0;
  const segCounts = data?.segments || {};
  const allTime = period.key === "all";
  const periodText = rangeLabel(period);
  const months = segmentMonths(data?.meta?.asOf || period.to);
  // A period inside one month only lists people who bought that month, so
  // it can't contain Slipped/Inactive (zero sales in that month) — say so
  // instead of showing two unexplained zeros.
  const noLapsed = data && !allTime && !segCounts.Slipped && !segCounts.Inactive;
  const totalPages = data ? Math.max(1, Math.ceil(data.totalRows / PAGE_SIZE)) : 1;
  const storeLabel = store || "All stores";
  const updatedLabel = updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function colLabel(c) {
    return !allTime && c.periodLabel ? c.periodLabel : c.label;
  }
  const scopeText = [store ? `who visited ${store}` : "", cat ? `who bought from a “${cat}” department, category or subcategory` : "", q ? `with name/email/phone matching “${q}”` : ""].filter(Boolean).join(", ");

  return (
    <div className={`ca${dark ? " dark" : ""}`}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brandmark">👥</div>
            <div>
              <strong>Marketing</strong>
              <small>HMR Analytics</small>
            </div>
          </div>
          <div className="nav-title">Marketing</div>
          <nav className="nav">
            <button type="button" className="active">
              <span className="nav-ico">▦</span>Customer List {data && <span className="badge dark">{num(total)}</span>}
            </button>
            <a href="/">
              <span className="nav-ico">⌂</span>Analytics Home
            </a>
          </nav>
          <div className="branch-status">
            <span className="dot" />
            <div>
              <strong>{store || "ALL STORES"}</strong>
              <div className="sub mono">{error ? "Sync error" : "Synced - Online"}</div>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="top-title">
              <strong>Marketing</strong>
              <small className="mono">Updated {updatedLabel}</small>
            </div>
            <label className="search">
              ⌕ <input ref={searchRef} value={catInput} onChange={(e) => setCatInput(e.target.value)} placeholder="Search department, category, subcategory" />
              <span className="key">Ctrl K</span>
            </label>
            <DateFilter value={period} onChange={setPeriod} className="hide-sm" />
            <select className="control" value={store} onChange={(e) => setStore(e.target.value)} title="Filter by All Store Visited">
              <option value="">⌂ All stores</option>
              {stores.map((s) => (
                <option key={s.store} value={s.store}>
                  ⌂ {s.store}
                </option>
              ))}
            </select>
            <span className="live">LIVE DATA</span>
            <button type="button" className="control" onClick={exportCsv} disabled={exporting}>
              ⇩ Export
            </button>
            <button type="button" className="icon-btn" title="Refresh" onClick={refresh}>
              ↻
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Toggle theme"
              onClick={() => {
                setDark((d) => !d);
                toast(dark ? "Light mode on" : "Dark mode on");
              }}
            >
              ◔
            </button>
          </header>

          <div className="alertbar">
            <div className="alert-item hot">
              <strong>● {data ? num(total) : "…"} customers</strong>
            </div>
            {SEGMENTS.map((x) => (
              <div key={x.key} className="alert-item">
                <strong className={`seg-text ${x.cls}`}>● {num(segCounts[x.key])}</strong> {x.key.toLowerCase()}
              </div>
            ))}
            <div className="alert-item">
              <strong>● {storeLabel}</strong> store filter
            </div>
            {cat && (
              <div className="alert-item">
                <strong style={{ color: "#b27000" }}>● {cat}</strong> department / category / subcategory
              </div>
            )}
          </div>

          <div className="workspace">
            <div className="eyebrow">
              {periodText} · {storeLabel}
            </div>
            <h1 className="page-title">Marketing</h1>
            <p className="lead">
              <b>{data ? num(total) : "…"}</b> registered customers {allTime ? "since records began" : "who bought in this period"}
              {scopeText ? `, ${scopeText}` : ""}. Segments are as of <b>{months[0]}</b>, compared with {months[1]} and {months[2]}.
            </p>
            <div className="toolbar-inline">
              <DateFilter value={period} onChange={setPeriod} />
              <span className="control">⌂ {storeLabel}</span>
              <span className="live">Live data</span>
              {cat && <span className="status st-amber">⌕ {cat}</span>}
              {error && <span className="status st-red">⚠ {error}</span>}
            </div>

            <div className="grid4 grid3">
              <Kpi label="Customers" value={data ? num(total) : "…"} meta={allTime ? "Registered (named) customers · all time" : `Bought in ${periodText}`} delta={scopeText || "No filters applied"}
                info="Distinct customer names with at least one non-voided purchase in the period. Walk-in / unnamed sales aren't counted." />
              {SEGMENTS.map((x) => (
                <Kpi
                  key={x.key}
                  label={x.key}
                  value={data ? num(segCounts[x.key]) : "…"}
                  meta={`${x.cond(months)} · ${pct(segCounts[x.key] || 0, total)} of customers`}
                  delta={`Goal: ${x.goal}`}
                  type={x.key === "Retained" || x.key === "New" ? "up" : x.key === "Inactive" ? "down" : "warn"}
                  info={`${x.key}: ${x.cond(months)}.`}
                />
              ))}
            </div>

            <section className="card section-card">
              <div className="section-h">
                <div>
                  <h3>Customer List ⓘ</h3>
                  <p>Click any row to open detail — search and filter this table</p>
                </div>
                <div>
                  <button type="button" className="control" onClick={() => setCompact((c) => !c)}>
                    ☰ {compact ? "Compact" : "Comfortable"}
                  </button>{" "}
                  <button type="button" className="control" onClick={exportCsv} disabled={exporting}>
                    ⇩ Export
                  </button>
                </div>
              </div>
              <div className="table-tabs">
                {[{ key: "", label: "All Customers", count: total }, ...SEGMENTS.map((x) => ({ key: x.key, label: x.key, count: segCounts[x.key] }))].map((t) => (
                  <button key={t.key || "all"} type="button" className={segment === t.key ? "active" : ""} onClick={() => setSegment(t.key)}>
                    {t.label} {data && <span className="badge">{num(t.count)}</span>}
                  </button>
                ))}
              </div>
              {noLapsed && (
                <div className="callout seg-note">
                  <strong>No Slipped or Inactive customers here:</strong> both mean zero sales in {months[0]}, but this period only lists people who bought in it. Pick a period that
                  starts earlier (e.g. <em>Last 3 months</em> or <em>All time</em>) to see them.
                </div>
              )}
              <div className="filter-row">
                {/* Same department/category/subcategory search as the topbar
                    (shared state) — the box right on the table is the one
                    people reach for first. Name search is separate and
                    labelled as such. */}
                <input value={catInput} onChange={(e) => setCatInput(e.target.value)} placeholder="⌕ Department, category or subcategory..." />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Customer name, email or phone..." />
              </div>

              {loading && !data && <div className="empty">Loading customers… (can take a few seconds)</div>}
              {error && !data && <div className="empty">Couldn't load customers: {error}</div>}
              {data && data.rows.length === 0 && !loading && <div className="empty">No customers match these filters.</div>}
              {data && data.rows.length > 0 && (
                <div className={loading ? "loading-dim" : ""}>
                  <div className="table-wrap">
                    <table className={compact ? "compact" : ""}>
                      <thead>
                        <tr>
                          {tableColumns.map((c) => {
                            const active = c.sort && sort.key === c.sort;
                            return (
                              <th key={c.key} className={`${c.sort ? "sortable" : ""}${active ? " sorted" : ""}`} onClick={() => onSortHeader(c)}>
                                {colLabel(c)}
                                {active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r) => (
                          <tr key={r.customerName} onClick={() => setDrawer(r)}>
                            {tableColumns.map((c) => (
                              <td key={c.key} className={c.cls} title={c.cls.includes("clip") ? r[c.key] : undefined}>
                                {c.render ? c.render(r) : r[c.key] || <span className="sub">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pager">
                    <span>
                      Showing {num((page - 1) * PAGE_SIZE + 1)}–{num(Math.min(page * PAGE_SIZE, data.totalRows))} of {num(data.totalRows)}
                    </span>
                    <div className="pager-btns">
                      <button type="button" className="pill-btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                        ‹ Prev
                      </button>
                      <span className="mono">
                        Page {num(page)} of {num(totalPages)}
                      </span>
                      <button type="button" className="pill-btn" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>
                        Next ›
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      <div className={`overlay${drawer ? " show" : ""}`} onClick={(e) => e.target === e.currentTarget && setDrawer(null)}>
        {drawer && (
          <aside className="drawer">
            <button type="button" className="drawer-close" onClick={() => setDrawer(null)}>
              ✕
            </button>
            <div className="eyebrow">Customer Detail</div>
            <h2>{drawer.customerName}</h2>
            <p className="lead" style={{ fontSize: 14 }}>
              {[drawer.email, drawer.phone].filter(Boolean).join(" · ") || "No contact details on file"}
            </p>
            <div className="drawer-grid">
              <div className="drawer-card">
                <small>Customer Segment · as of {months[0]}</small>
                <span className={`status ${segClass(drawer.segment)}`}>{drawer.segment}</span>
                <div className="sub" style={{ marginTop: 6 }}>
                  Goal: {SEGMENT_BY_KEY[drawer.segment]?.goal}
                </div>
              </div>
              <div className="drawer-card">
                <small>{allTime ? "Lifetime Sales" : "Sales in Period"}</small>
                <b>{peso(drawer.sales)}</b>
              </div>
              <div className="drawer-card">
                <small>Visits (invoices)</small>
                <b>{num(drawer.visits)}</b>
              </div>
              <div className="drawer-card">
                <small>Days Inactive</small>
                <b>{num(drawer.daysInactive)}</b>
              </div>
              <div className="drawer-card">
                <small>First Order Date</small>
                <span className="mono">{drawer.firstOrder}</span>
              </div>
              <div className="drawer-card">
                <small>Last Visit</small>
                <span className="mono">{drawer.lastVisit}</span>
              </div>
              <div className="drawer-card">
                <small>Frequent Store Visited</small>
                <b>{drawer.topStore || "—"}</b>
              </div>
              <div className="drawer-card">
                <small>Frequent Assisting SC</small>
                <b>{drawer.topSc || "—"}</b>
              </div>
            </div>
            {drawer.match && (
              <div className="drawer-card" style={{ marginTop: 10 }}>
                <small>Why this customer matched “{cat}”</small>
                <b>
                  {num(drawer.match.items)} matching {drawer.match.items === 1 ? "item" : "items"} · {peso(Math.round(drawer.match.sales))}
                </b>
                <div className="sub" style={{ marginTop: 6 }}>
                  Latest: {drawer.match.lastItem} · <span className="mono">{drawer.match.lastDate}</span>
                </div>
                {drawer.match.paths.map((path) => (
                  <div key={path} className="match-path" style={{ marginTop: 6 }}>
                    {path}
                  </div>
                ))}
                {drawer.match.pathCount > drawer.match.paths.length && <div className="sub">+{num(drawer.match.pathCount - drawer.match.paths.length)} more</div>}
              </div>
            )}
            <div className="drawer-card" style={{ marginTop: 10 }}>
              <small>Last Item Bought</small>
              <b>{drawer.lastItem || "—"}</b>
            </div>
            <div className="drawer-card" style={{ marginTop: 10 }}>
              <small>Primary Category of Interest</small>
              <b>{drawer.topCategory || "—"}</b>
            </div>
            <div className="drawer-card" style={{ marginTop: 10 }}>
              <small>All Store Visited</small>
              <b>{drawer.allStores || "—"}</b>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="control" onClick={() => copy(drawer.customerName, "Name")}>
                Copy Name
              </button>
              {drawer.phone && (
                <button type="button" className="control" onClick={() => copy(drawer.phone, "Phone")}>
                  Copy Phone
                </button>
              )}
              {drawer.email && (
                <button type="button" className="control" onClick={() => copy(drawer.email, "Email")}>
                  Copy Email
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
