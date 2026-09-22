import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "./Panel";
import DataTable from "./DataTable";
import { LoadingState, ErrorState } from "./States";
import { retail } from "../theme";

const STATUS_STYLE = {
  Critical: { bg: "#faeaea", color: retail.bad },
  "Action Required": { bg: "#fdf3e3", color: "#8a5a12" },
  Investigate: { bg: "#eaf1fe", color: retail.blueDark },
  Monitor: { bg: "#f1eefc", color: retail.purple },
  Healthy: { bg: "#e9f9ef", color: retail.good },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Monitor;
  return (
    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function impactMagnitude(text) {
  const m = String(text).match(/[\d,.]+/);
  if (!m) return 0;
  const n = parseFloat(m[0].replace(/,/g, ""));
  return text.includes("-") ? -n : n;
}

const SUMMARY_CARDS = [
  { key: "critical", label: "Critical", match: (r) => r.status === "Critical" },
  { key: "needsReview", label: "Needs Review", match: (r) => r.status === "Action Required" || r.status === "Investigate" },
  { key: "monitor", label: "Monitor", match: (r) => r.status === "Monitor" },
  { key: "healthy", label: "Resolved / Healthy", match: (r) => r.status === "Healthy" },
];

const COLUMNS = [
  { key: "priority", label: "Priority" },
  { key: "area", label: "Area" },
  { key: "entity", label: "Entity" },
  { key: "issue", label: "Issue", maxWidth: 220 },
  { key: "currentMetric", label: "Current Metric" },
  { key: "benchmark", label: "Previous / Benchmark" },
  { key: "businessImpact", label: "Business Impact" },
  { key: "recommendedAction", label: "Recommended Investigation", maxWidth: 240 },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

function FilterSelect({ value, onChange, options, allLabel, className = "" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-[12.5px] rounded-lg px-2.5 py-1.5 ${className}`}
      style={{ background: retail.surface, border: `1px solid ${retail.border}`, color: retail.ink }}
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

// Real ClickHouse-backed exception-management view — see
// api/_retail-needs-attention.js (dispatched via ?report=needsAttention).
// Every issue is a fixed threshold over an already-computed real field
// (see that file's own dataQuality notes), not an AI-generated judgment
// call.
export default function NeedsAttentionCenter({ filters }) {
  const { segment, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priority, setPriority] = useState("all");
  const [area, setArea] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("priority");

  const load = useCallback(async (seg, dr, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...dateRangeParams(dr), report: "needsAttention" });
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
    load(segment, dateRange, controller.signal);
    return () => controller.abort();
  }, [segment, dateRange, load]);

  const allIssues = useMemo(() => data?.issues || [], [data]);
  const priorities = useMemo(() => [...new Set(allIssues.map((r) => r.priority))], [allIssues]);
  const areas = useMemo(() => [...new Set(allIssues.map((r) => r.area))], [allIssues]);
  const statuses = useMemo(() => [...new Set(allIssues.map((r) => r.status))], [allIssues]);

  const rows = useMemo(() => {
    const filtered = allIssues.filter(
      (r) => (priority === "all" || r.priority === priority) && (area === "all" || r.area === area) && (status === "all" || r.status === status)
    );
    return [...filtered].sort((a, b) => {
      if (sortBy === "impact") return impactMagnitude(a.businessImpact) - impactMagnitude(b.businessImpact);
      if (sortBy === "issueType") return a.area.localeCompare(b.area) || a.issue.localeCompare(b.issue);
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
  }, [allIssues, priority, area, status, sortBy]);

  return (
    <Panel title="Needs Attention" subtitle="Operational issues and opportunities requiring investigation" className="mt-4">
      {loading && !data && <LoadingState label="Loading Needs Attention…" />}
      {error && <ErrorState label={`Couldn't load Needs Attention: ${error}`} />}
      {data && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {SUMMARY_CARDS.map((c) => (
              <div key={c.key} className="rounded-2xl p-3.5" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
                <div className="text-[12px] font-semibold" style={{ color: retail.muted }}>
                  {c.label}
                </div>
                <div className="text-[20px] font-extrabold mt-1" style={{ color: retail.ink }}>
                  {allIssues.filter(c.match).length}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <FilterSelect value={priority} onChange={setPriority} options={priorities} allLabel="All Priorities" />
            <FilterSelect value={area} onChange={setArea} options={areas} allLabel="All Areas" />
            <FilterSelect value={status} onChange={setStatus} options={statuses} allLabel="All Statuses" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-[12.5px] rounded-lg px-2.5 py-1.5 ml-auto"
              style={{ background: retail.surface, border: `1px solid ${retail.border}`, color: retail.ink }}
            >
              <option value="priority">Sort by Priority</option>
              <option value="impact">Sort by Business Impact</option>
              <option value="issueType">Sort by Issue Type</option>
            </select>
          </div>

          <DataTable columns={COLUMNS} rows={rows} paginate pageSize={10} emptyLabel="No issues match these filters." />
        </>
      )}
    </Panel>
  );
}
