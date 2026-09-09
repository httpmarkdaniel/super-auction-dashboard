import { useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import SeverityBadge from "../components/SeverityBadge";
import { hrh } from "../theme";
import { CHANNEL_OPTIONS } from "../mock/filterOptions";
import { productAnalytics } from "../mock/data";
import { formatPeso, formatNum } from "../format";

const TREND_GLYPH = { up: "▲", down: "▼", flat: "▬" };
const TREND_COLOR = { up: hrh.good, down: hrh.bad, flat: hrh.muted };

const REPEAT_SELLER_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "priorSales", label: "Prior-Period Sales", render: (r) => formatPeso(r.priorSales) },
  { key: "currentSales", label: "Current-Period Sales", render: (r) => formatPeso(r.currentSales) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  {
    key: "trend",
    label: "Trend",
    render: (r) => (
      <span className="font-semibold" style={{ color: TREND_COLOR[r.trend] || hrh.muted }}>
        {TREND_GLYPH[r.trend] || "—"}
      </span>
    ),
  },
  { key: "currentStock", label: "Current Stock", render: (r) => formatNum(r.currentStock) },
  { key: "currentStockValue", label: "Current Stock Value", render: (r) => formatPeso(r.currentStockValue) },
];

const TOP_PRODUCT_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "currentGmv", label: "Current GMV", render: (r) => formatPeso(r.currentGmv) },
  { key: "currentUnits", label: "Current Units", render: (r) => formatNum(r.currentUnits) },
  { key: "previousGmv", label: "Previous GMV", render: (r) => formatPeso(r.previousGmv) },
  { key: "previousUnits", label: "Previous Units", render: (r) => formatNum(r.previousUnits) },
  { key: "note", label: "Change / Note" },
];

const DROPPED_PRODUCT_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "previousSales", label: "Previous-Period Sales", render: (r) => formatPeso(r.previousSales) },
  { key: "previousUnits", label: "Previous-Period Units", render: (r) => formatNum(r.previousUnits) },
  { key: "currentStock", label: "Current Stock", render: (r) => formatNum(r.currentStock) },
  { key: "currentStockValue", label: "Current Stock Value", render: (r) => formatPeso(r.currentStockValue) },
  {
    key: "status",
    label: "Status",
    render: (r) => <SeverityBadge severity={r.status === "Out of Stock" ? "good" : "warning"} text={r.status} />,
  },
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

export default function ProductAnalytics() {
  const [channel, setChannel] = useState("All Channels");
  const data = productAnalytics[channel] || productAnalytics["All Channels"];
  const { kpis, repeatSellers, topProducts, droppedProducts } = data;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Product Analytics
        </div>
        <DemoBadge />
      </div>

      <div className="mb-4">
        <ChannelPills value={channel} onChange={setChannel} />
      </div>

      <KpiRow>
        <KpiCard label="GMV" value={formatPeso(kpis.gmv.value)} delta={kpis.gmv.delta} />
        <KpiCard label="NMV" value={formatPeso(kpis.nmv.value)} delta={kpis.nmv.delta} />
        <KpiCard label="AOV" value={formatPeso(kpis.aov.value)} delta={kpis.aov.delta} />
        <KpiCard label="Orders" value={formatNum(kpis.orders.value)} delta={kpis.orders.delta} />
        <KpiCard label="Units" value={formatNum(kpis.units.value)} delta={kpis.units.delta} />
      </KpiRow>

      <Panel title="Repeat Sellers" badge={<DemoBadge />} className="mb-4">
        <DataTable columns={REPEAT_SELLER_COLUMNS} rows={repeatSellers} />
      </Panel>

      <Panel title="Top Products — Current vs Previous Period" badge={<DemoBadge />} className="mb-4">
        <DataTable columns={TOP_PRODUCT_COLUMNS} rows={topProducts} />
      </Panel>

      <Panel title="Dropped Products / Stock Check" badge={<DemoBadge />}>
        <DataTable columns={DROPPED_PRODUCT_COLUMNS} rows={droppedProducts} />
      </Panel>
    </div>
  );
}
