import { useCallback, useEffect, useRef, useState } from "react";
import "./customer-analytics.css";

// Marketing dashboard (customer list) — layout and styling are a 1:1 port of
// public/LIVE DASHBOARD UNIFORM FORMAT.html (sidebar, topbar, alert bar,
// eyebrow/title/lead, KPI grid, table card with tabs + filter row, detail
// drawer, toast), rendered with real data from api/_customer-analytics.js
// (report=caStores/caCustomers via /api/retail-analytics). All time — no
// date filter. The topbar search matches department/category/subcategory;
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
function typeClass(t) {
  return t === "Returning" ? "st-green" : "st-blue";
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
  { key: "sales", label: "Lifetime Sales", sort: "sales", cls: "nowrap", render: (r) => peso(Math.round(r.sales)) },
  { key: "customerType", label: "Customer Segment", cls: "nowrap", render: (r) => <span className={`status ${typeClass(r.customerType)}`}>{r.customerType}</span> },
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
  ...COLUMNS.map((c) => ({ key: c.key, label: c.label })),
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
  const [type, setType] = useState("");
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

  const params = { store, cat, q, type, sort: sort.key, dir: sort.dir };
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
      const cols = [...CSV_COLUMNS.map((c) => ({ label: c.label, get: (r) => r[c.key] })), ...(withMatch ? MATCH_CSV_COLUMNS : [])];
      const lines = [cols.map((c) => csvCell(c.label)).join(",")];
      for (let p = 1; (p - 1) * EXPORT_CHUNK < total; p++) {
        toast(`Exporting ${num(Math.min(p * EXPORT_CHUNK, total))} of ${num(total)}…`);
        const chunk = await fetchCa("caCustomers", { ...params, page: p, pageSize: EXPORT_CHUNK });
        for (const r of chunk.rows) lines.push(cols.map((c) => csvCell(c.get(r))).join(","));
      }
      const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const parts = ["marketing-customers", store || "all-stores", cat, type].filter(Boolean).join("_").replace(/[^A-Za-z0-9_]+/g, "-");
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
  const returning = data?.returningCustomers ?? 0;
  const newC = data?.newCustomers ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.totalRows / PAGE_SIZE)) : 1;
  const storeLabel = store || "All stores";
  const updatedLabel = updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
            <span className="control hide-sm">▣ All time</span>
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
            <div className="alert-item">
              <strong style={{ color: "#17833b" }}>● {num(returning)}</strong> returning (2+ purchases)
            </div>
            <div className="alert-item">
              <strong style={{ color: "#1f6fb2" }}>● {num(newC)}</strong> new (1 purchase so far)
            </div>
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
            <div className="eyebrow">All time · {storeLabel}</div>
            <h1 className="page-title">Marketing</h1>
            <p className="lead">
              <b>{data ? num(total) : "…"}</b> registered customers{scopeText ? ` ${scopeText}` : ""}. {num(returning)} returning and {num(newC)} new, across every purchase since
              records began.
            </p>
            <div className="toolbar-inline">
              <span className="control">▣ All time</span>
              <span className="control">⌂ {storeLabel}</span>
              <span className="live">Live data</span>
              {cat && <span className="status st-amber">⌕ {cat}</span>}
              {error && <span className="status st-red">⚠ {error}</span>}
            </div>

            <div className="grid4 grid3">
              <Kpi label="Customers" value={data ? num(total) : "…"} meta="Registered (named) customers · all time" delta={scopeText || "No filters applied"}
                info="Distinct customer names with at least one non-voided purchase. Walk-in / unnamed sales aren't counted." />
              <Kpi label="Returning Customers" value={data ? num(returning) : "…"} meta="2 or more purchases (invoices)" delta={`${pct(returning, total)} of customers`} type="up"
                info="Customers with 2+ distinct invoices, all time." />
              <Kpi label="New Customers" value={data ? num(newC) : "…"} meta="Only 1 purchase so far" delta={`${pct(newC, total)} of customers`} type="warn"
                info="Customers with exactly 1 invoice, all time." />
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
                {[
                  { key: "", label: "All Customers", count: total },
                  { key: "Returning", label: "Returning", count: returning },
                  { key: "New", label: "New", count: newC },
                ].map((t) => (
                  <button key={t.key || "all"} type="button" className={type === t.key ? "active" : ""} onClick={() => setType(t.key)}>
                    {t.label} {data && <span className="badge">{num(t.count)}</span>}
                  </button>
                ))}
              </div>
              <div className="filter-row">
                {/* Same department/category/subcategory search as the topbar
                    (shared state) — the box right on the table is the one
                    people reach for first. Name search is separate and
                    labelled as such. */}
                <input value={catInput} onChange={(e) => setCatInput(e.target.value)} placeholder="⌕ Department, category or subcategory..." />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Customer name, email or phone..." />
              </div>

              {loading && !data && <div className="empty">Loading customers… (all time, can take a few seconds)</div>}
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
                                {c.label}
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
                <small>Customer Segment</small>
                <span className={`status ${typeClass(drawer.customerType)}`}>{drawer.customerType}</span>
              </div>
              <div className="drawer-card">
                <small>Lifetime Sales</small>
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
