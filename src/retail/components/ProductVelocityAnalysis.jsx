import { KpiCard, KpiRow } from "./Kpi";
import Panel from "./Panel";
import DataTable from "./DataTable";
import { BubbleChart } from "./Charts";
import { retail } from "../theme";
import { formatPeso, formatNum } from "../format";
import { PRODUCT_VELOCITY_DATA } from "../mockAnalytics";

const STATUS_PILL_STYLE = {
  "Fast Moving": { bg: "#eaf1fe", color: retail.blueDark },
  Healthy: { bg: "#e9f9ef", color: retail.good },
  "Slow Moving": { bg: "#fdf3e3", color: "#8a5a12" },
  "Replenishment Risk": { bg: "#faeaea", color: retail.bad },
};

function VelocityPill({ status }) {
  const s = STATUS_PILL_STYLE[status] || STATUS_PILL_STYLE.Healthy;
  return (
    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function VelocityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const rows = [
    ["Days of Supply", p.x.toFixed(0)],
    ["Avg Daily Units Sold", p.y.toFixed(1)],
    ["Sales Value", formatPeso(p.z)],
    ["Status", p.status],
  ];
  return (
    <div className="rounded-md px-3 py-2 text-[12px] min-w-[190px]" style={{ background: retail.navy, border: `1px solid ${retail.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
        {p.label}
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4" style={{ color: "#a3adba" }}>
          <span>{k}:</span>
          <span className="font-semibold" style={{ color: "#fff" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

const COLUMNS = [
  { key: "product", label: "Product", maxWidth: 220 },
  { key: "category", label: "Category" },
  { key: "currentStock", label: "Current Stock", render: (r) => formatNum(r.currentStock) },
  { key: "unitsSold30d", label: "Units Sold (30d)", render: (r) => formatNum(r.unitsSold30d) },
  { key: "avgDailySales", label: "Avg Daily Sales", render: (r) => r.avgDailySales.toFixed(1) },
  { key: "daysOfSupply", label: "Days of Supply", render: (r) => r.daysOfSupply.toFixed(0) },
  { key: "salesValue", label: "Sales Value", render: (r) => formatPeso(r.salesValue) },
  { key: "status", label: "Velocity Status", render: (r) => <VelocityPill status={r.status} /> },
  { key: "action", label: "Recommended Action", maxWidth: 220 },
];

// Fast/healthy/slow/replenishment-risk classification of product sell-
// through vs. current stock coverage — see classifyVelocity in
// ../mockAnalytics for the rule and PRODUCT_VELOCITY_DATA for the
// (currently mock) inputs. Not a statement that the fastest seller is the
// "best" product — see the accompanying Days-of-Supply/velocity table.
export default function ProductVelocityAnalysis() {
  const counts = PRODUCT_VELOCITY_DATA.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const bubbleData = PRODUCT_VELOCITY_DATA.map((p) => ({
    x: p.daysOfSupply,
    y: p.avgDailySales,
    z: p.salesValue,
    label: p.product,
    color: p.color,
    status: p.status,
  }));

  return (
    <Panel title="Product Velocity Analysis" subtitle="Fast movers, healthy stock, and replenishment risk — last 30 days" className="mb-4">
      <KpiRow>
        <KpiCard label="Fast Moving SKUs" value={formatNum(counts["Fast Moving"] || 0)} />
        <KpiCard label="Healthy SKUs" value={formatNum(counts["Healthy"] || 0)} />
        <KpiCard label="Slow Moving SKUs" value={formatNum(counts["Slow Moving"] || 0)} />
        <KpiCard label="Replenishment Risk" value={formatNum(counts["Replenishment Risk"] || 0)} />
      </KpiRow>

      <div className="mb-4">
        <div className="text-[13px] font-bold mb-2" style={{ color: retail.ink }}>
          Stock vs Sales Velocity
        </div>
        <BubbleChart data={bubbleData} xLabel="Days of Supply" yLabel="Avg Daily Units Sold" tooltipContent={VelocityTooltip} height={280} />
      </div>

      <DataTable columns={COLUMNS} rows={PRODUCT_VELOCITY_DATA} paginate pageSize={10} emptyLabel="No product velocity data." />
    </Panel>
  );
}
