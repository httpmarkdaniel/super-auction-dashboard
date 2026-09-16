import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";

// Small hand-drawn stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons / TrafficConversion.jsx's KPI icons — kept local
// to this file rather than shared, same "self-contained per file"
// convention this codebase already uses for other small pieces.
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  tag: (
    <Icon>
      <path d="M20.59 13.41 11 3.83a2 2 0 0 0-1.41-.58H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82Z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  peso: (
    <Icon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </Icon>
  ),
  clock: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Icon>
  ),
};

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 200, width: 200 },
  { key: "category", label: "Category", width: 130 },
  { key: "markdownPct", label: "Markdown %", render: (r) => `${r.markdownPct}%` },
  { key: "ageDays", label: "Age (days)", render: (r) => (r.ageDays === null ? "—" : formatNum(r.ageDays)) },
  { key: "units", label: "Current Stock", render: (r) => formatNum(r.units) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
  { key: "status", label: "Status" },
];

// Real ClickHouse-backed Markdown Analytics — see
// api/_hrh-markdown-analytics.js (dispatched from api/hrh-sales-analytics.js
// via ?report=markdownAnalytics) for the queries. Markdown % comes from
// original_price vs current_srp, both real fields already on this table —
// no price-history integration needed for that. What's NOT computable is a
// pre/post-markdown GMV comparison (no price-change timestamp), so that
// mock panel is replaced with Marked-Down Items by Category. Same locked
// snapshot contract as Barcode Analytics/Inventory Aging — ignores the
// Date Range/Channel filter, always "as of right now" for HRH Online.
export default function MarkdownAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hrh-sales-analytics?report=markdownAnalytics`, { signal });
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
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const markdownDepthDistribution = data?.markdownDepthDistribution || [];
  const markedDownByCategory = data?.markedDownByCategory || [];
  const agedVsMarkdown = data?.agedVsMarkdown || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Markdown Analytics
      </div>

      {loading && !data && <LoadingState label="Loading Markdown Analytics…" />}
      {error && <ErrorState label={`Couldn't load Markdown Analytics: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.snapshotNote}
          </div>

          <KpiRow>
            <KpiCard label="Items Marked Down" icon={ICONS.tag} value={formatNum(data.kpis.itemsMarkedDown.value)} />
            <KpiCard label="Average Markdown %" icon={ICONS.percent} value={formatPct(data.kpis.avgMarkdownPct.value)} />
            <KpiCard
              label="Marked-Down GMV"
              icon={ICONS.peso}
              value={formatPeso(data.kpis.markedDownGmv.value)}
              sub="lifetime sales, currently marked-down items"
            />
            <KpiCard label="Aged + Marked + Unsold" icon={ICONS.clock} value={formatNum(data.kpis.agedMarkedUnsold.value)} sub="61+ days, never sold" />
          </KpiRow>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Markdown Depth Distribution" subtitle="Marked-down items, real stock on hand">
              <BarComparisonChart data={markdownDepthDistribution} series={[{ key: "value", name: "Items" }]} valueFormatter={formatNum} />
            </Panel>
            <Panel title="Marked-Down Items by Category" subtitle="Real stock on hand">
              <BarComparisonChart data={markedDownByCategory} series={[{ key: "value", name: "Items", color: hrh.accent }]} valueFormatter={formatNum} horizontal />
            </Panel>
          </div>

          <Panel
            title="Aged Inventory vs Markdown Value (by category)"
            subtitle={data.meta?.markdownNote}
            className="mb-4"
          >
            <BarComparisonChart
              data={agedVsMarkdown}
              series={[{ key: "agedValue", name: "Aged Value" }, { key: "markedDownValue", name: "Marked-Down Value", color: hrh.accent }]}
              valueFormatter={formatPeso}
            />
          </Panel>

          <Panel title="Markdown Products" subtitle="Highest current stock value first">
            <DataTable columns={PRODUCT_COLUMNS} rows={data.markdownProductTable} paginate pageSize={10} stickyColumns={2} emptyLabel="No marked-down items with stock on hand right now." />
          </Panel>
        </>
      )}
    </div>
  );
}
