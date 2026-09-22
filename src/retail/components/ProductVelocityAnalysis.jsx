import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "./Kpi";
import Panel from "./Panel";
import DataTable from "./DataTable";
import { BubbleChart } from "./Charts";
import { LoadingState, ErrorState } from "./States";
import { retail } from "../theme";
import { formatPeso, formatNum } from "../format";

const STATUS_PILL_STYLE = {
  "Fast Moving": { bg: "#eaf1fe", color: retail.blueDark },
  Healthy: { bg: "#e9f9ef", color: retail.good },
  "Slow Moving": { bg: "#fdf3e3", color: "#8a5a12" },
  "Replenishment Risk": { bg: "#faeaea", color: retail.bad },
};
const STATUS_DOT_COLOR = {
  "Fast Moving": retail.blue,
  Healthy: retail.good,
  "Slow Moving": retail.orange,
  "Replenishment Risk": retail.bad,
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
    ["Days of Supply", p.x === null ? "No sales (30d)" : p.x.toFixed(0)],
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
  { key: "daysOfSupply", label: "Days of Supply", render: (r) => (r.daysOfSupply === null ? "—" : r.daysOfSupply.toFixed(0)) },
  { key: "salesValue", label: "Sales Value", render: (r) => formatPeso(r.salesValue) },
  { key: "status", label: "Velocity Status", render: (r) => <VelocityPill status={r.status} /> },
  { key: "action", label: "Recommended Action", maxWidth: 220 },
];

// Real ClickHouse-backed Product Velocity Analysis — see
// api/_retail-product-velocity.js (dispatched via ?report=productVelocity).
// Fixed 30-day trailing window, independent of the dashboard-wide Date
// Range filter — same convention as Stocks/Top Products' own Item
// subview. Not a statement that the fastest seller is the "best" product
// — see the accompanying Days-of-Supply/velocity table.
export default function ProductVelocityAnalysis({ filters }) {
  const { segment, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (seg, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...(st ? { store: st } : {}), report: "productVelocity" });
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

  if (loading && !data) {
    return (
      <Panel title="Product Velocity Analysis" subtitle="Fast movers, healthy stock, and replenishment risk — last 30 days" className="mb-4">
        <LoadingState label="Loading Product Velocity Analysis…" />
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title="Product Velocity Analysis" className="mb-4">
        <ErrorState label={`Couldn't load Product Velocity Analysis: ${error}`} />
      </Panel>
    );
  }
  if (!data) return null;

  const items = data.items || [];
  const counts = items.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const bubbleData = items
    .filter((p) => p.daysOfSupply !== null)
    .map((p) => ({
      x: p.daysOfSupply,
      y: p.avgDailySales,
      z: p.salesValue,
      label: p.product,
      color: STATUS_DOT_COLOR[p.status] || retail.good,
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

      <DataTable columns={COLUMNS} rows={items} paginate pageSize={10} emptyLabel="No product velocity data for this selection." />
    </Panel>
  );
}
