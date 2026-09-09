import { useEffect, useState, useCallback } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SeverityBadge from "../components/SeverityBadge";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { CHANNEL_OPTIONS } from "../mock/filterOptions";
import { formatPeso, formatNum, formatPct } from "../format";

const TREND_GLYPH = { up: "▲", down: "▼", flat: "▬" };
const TREND_COLOR = { up: hrh.good, down: hrh.bad, flat: hrh.muted };
// HAS STOCK is the one that needs a human to look at it (sold out despite
// stock on hand) — deliberately the "warning" (orange) tone, not "good".
const STATUS_SEVERITY = { "OUT OF STOCK": "good", "HAS STOCK": "warning", "UNKNOWN STOCK": "critical" };

function changeCell(pct) {
  if (pct === null || pct === undefined) return "—";
  const color = pct > 0 ? hrh.good : pct < 0 ? hrh.bad : hrh.muted;
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "▬";
  return (
    <span className="font-semibold" style={{ color }}>
      {arrow} {formatPct(Math.abs(pct))}
    </span>
  );
}

const REPEAT_SELLER_COLUMNS = [
  { key: "sku", label: "SKU" },
  { key: "product", label: "Product" },
  { key: "category", label: "Category", render: (r) => r.category || "—" },
  { key: "wk1Gmv", label: "Wk1 GMV", render: (r) => formatPeso(r.wk1Gmv) },
  { key: "wk1Units", label: "Wk1 Units", render: (r) => formatNum(r.wk1Units) },
  { key: "wk2Gmv", label: "Wk2 GMV", render: (r) => formatPeso(r.wk2Gmv) },
  { key: "wk2Units", label: "Wk2 Units", render: (r) => formatNum(r.wk2Units) },
  { key: "wk3Gmv", label: "Wk3 GMV", render: (r) => formatPeso(r.wk3Gmv) },
  { key: "wk3Units", label: "Wk3 Units", render: (r) => formatNum(r.wk3Units) },
  { key: "wk4Gmv", label: "Wk4 GMV", render: (r) => formatPeso(r.wk4Gmv) },
  { key: "wk4Units", label: "Wk4 Units", render: (r) => formatNum(r.wk4Units) },
  {
    key: "trend",
    label: "Trend",
    render: (r) => (
      <span className="font-semibold" style={{ color: TREND_COLOR[r.trend] || hrh.muted }}>
        {TREND_GLYPH[r.trend] || "—"}
      </span>
    ),
  },
  { key: "currentStockQty", label: "Current Stock", render: (r) => (r.currentStockQty === null ? "—" : formatNum(r.currentStockQty)) },
  { key: "currentStockValue", label: "Current Stock Value", render: (r) => (r.currentStockValue === null ? "—" : formatPeso(r.currentStockValue)) },
];

const TOP_PRODUCT_COLUMNS = [
  { key: "sku", label: "SKU" },
  { key: "product", label: "Product" },
  { key: "category", label: "Category", render: (r) => r.category || "—" },
  { key: "currentGmv", label: "Current GMV", render: (r) => formatPeso(r.currentGmv) },
  { key: "currentUnits", label: "Current Units", render: (r) => formatNum(r.currentUnits) },
  { key: "previousGmv", label: "Previous GMV", render: (r) => formatPeso(r.previousGmv) },
  { key: "previousUnits", label: "Previous Units", render: (r) => formatNum(r.previousUnits) },
  { key: "gmvChangePct", label: "GMV Change", render: (r) => changeCell(r.gmvChangePct) },
  { key: "unitsChangePct", label: "Units Change", render: (r) => changeCell(r.unitsChangePct) },
  { key: "currentStockQty", label: "Current Stock", render: (r) => (r.currentStockQty === null ? "—" : formatNum(r.currentStockQty)) },
  { key: "currentStockValue", label: "Current Stock Value", render: (r) => (r.currentStockValue === null ? "—" : formatPeso(r.currentStockValue)) },
];

const DROPPED_PRODUCT_COLUMNS = [
  { key: "sku", label: "SKU" },
  { key: "product", label: "Product" },
  { key: "category", label: "Category", render: (r) => r.category || "—" },
  { key: "previousGmv", label: "Previous GMV", render: (r) => formatPeso(r.previousGmv) },
  { key: "previousUnits", label: "Previous Units", render: (r) => formatNum(r.previousUnits) },
  { key: "currentStockQty", label: "Current Stock", render: (r) => (r.currentStockQty === null ? "—" : formatNum(r.currentStockQty)) },
  { key: "currentStockValue", label: "Current Stock Value", render: (r) => (r.currentStockValue === null ? "—" : formatPeso(r.currentStockValue)) },
  { key: "status", label: "Status", render: (r) => <SeverityBadge severity={STATUS_SEVERITY[r.status] || "critical"} text={r.status} /> },
];

// Local, page-only channel selector — deliberately independent of the
// global Header channel filter (which drives other pages' tables). Product
// Analytics needs its own current/previous-period breakdown per channel,
// so it keeps its own state rather than reusing filters.channel.
function ChannelPills({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHANNEL_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="text-[12.5px] font-semibold px-3 h-8 rounded-md whitespace-nowrap"
            style={
              active
                ? { background: hrh.navy, color: "#ffffff", border: `1px solid ${hrh.navy}` }
                : { background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function formatAsOf(meta) {
  if (!meta) return null;
  const sales = meta.salesAsOf;
  const inventory = meta.inventoryAsOf ? meta.inventoryAsOf.slice(0, 10) : null;
  if (!sales && !inventory) return null;
  if (sales === inventory || (!inventory && sales)) return `Data as of ${sales}`;
  if (!sales) return `Inventory as of ${inventory}`;
  return `Sales as of ${sales} · Inventory as of ${inventory}`;
}

// Real ClickHouse-backed Product Analytics — see api/hrh-product-analytics.js
// for the query/reconciliation. Fetches on mount and whenever the channel
// changes; no polling (this is historical/analytical, not a live feed).
export default function ProductAnalytics() {
  const [channel, setChannel] = useState("All Channels");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (ch) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hrh-product-analytics?channel=${encodeURIComponent(ch)}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(channel);
  }, [channel, load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Product Analytics
        </div>
        <div className="flex items-center gap-3">
          {data?.meta && (
            <span className="text-[11.5px]" style={{ color: hrh.muted }}>
              {formatAsOf(data.meta)}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(channel)}
            disabled={loading}
            className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md"
            style={{ background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <ChannelPills value={channel} onChange={setChannel} />
      </div>

      {loading && !data && <LoadingState label="Loading Product Analytics…" />}
      {error && <ErrorState label={`Couldn't load Product Analytics: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="GMV" value={formatPeso(data.kpis.gmv.value)} delta={data.kpis.gmv.delta} />
            <KpiCard label="NMV" value={formatPeso(data.kpis.nmv.value)} delta={data.kpis.nmv.delta} />
            <KpiCard label="AOV" value={formatPeso(data.kpis.aov.value)} delta={data.kpis.aov.delta} />
            <KpiCard label="Orders" value={formatNum(data.kpis.orders.value)} delta={data.kpis.orders.delta} />
            <KpiCard label="Units" value={formatNum(data.kpis.units.value)} delta={data.kpis.units.delta} />
          </KpiRow>

          <Panel title="Repeat Sellers" className="mb-4">
            <DataTable columns={REPEAT_SELLER_COLUMNS} rows={data.repeatSellers} />
          </Panel>

          <Panel title="Top Products — Current vs Previous Period" className="mb-4">
            <DataTable columns={TOP_PRODUCT_COLUMNS} rows={data.topProducts} />
          </Panel>

          <Panel title="Dropped Products — Stock Check">
            <DataTable columns={DROPPED_PRODUCT_COLUMNS} rows={data.droppedProducts} />
          </Panel>
        </>
      )}
    </div>
  );
}
