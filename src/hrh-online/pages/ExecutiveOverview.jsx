import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import SeverityBadge from "../components/SeverityBadge";
import { TrendChart, DonutChart } from "../components/Charts";
import { overview, merchandising } from "../mock/data";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

const ORDER_STATUS_SEVERITY = { Paid: "good", Pending: "warning", Cancelled: "critical" };

const TOP_PRODUCT_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "category", label: "Category" },
  { key: "branch", label: "Branch" },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
];

const RECENT_ORDER_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "channel", label: "Channel" },
  { key: "status", label: "Status", render: (r) => <SeverityBadge severity={ORDER_STATUS_SEVERITY[r.status] || "good"} text={r.status} /> },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
];

export default function ExecutiveOverview() {
  const { kpis, trend, channelContribution, orderStatus, recentOrders } = overview;
  const topProducts = [...merchandising.productTable].sort((a, b) => b.gmv - a.gmv).slice(0, 5);

  const totalChannelGmv = channelContribution.reduce((s, c) => s + c.value, 0);
  const totalOrders = orderStatus.reduce((s, c) => s + c.value, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Executive Overview
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Key performance metrics and trends for HRH Online
          </p>
        </div>
        <DemoBadge />
      </div>

      <KpiRow>
        <KpiCard label="GMV" value={formatPeso(kpis.gmv.value)} delta={kpis.gmv.delta} />
        <KpiCard label="NMV" value={formatPeso(kpis.nmv.value)} delta={kpis.nmv.delta} />
        <KpiCard label="AOV" value={formatPeso(kpis.aov.value)} delta={kpis.aov.delta} />
        <KpiCard label="Orders" value={formatNum(kpis.orders.value)} delta={kpis.orders.delta} />
        <KpiCard label="Units" value={formatNum(kpis.units.value)} delta={kpis.units.delta} />
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr_1fr] gap-4 mb-4">
        <Panel title="Sales Trend" subtitle="Weekly GMV and NMV">
          <TrendChart data={trend} series={[{ key: "gmv", name: "GMV" }, { key: "nmv", name: "NMV" }]} />
        </Panel>
        <Panel title="Sales by Channel" subtitle="GMV share for the selected period">
          <DonutChart segments={channelContribution} centerValue={formatCompactPeso(totalChannelGmv)} centerLabel="Total GMV" />
        </Panel>
        <Panel title="Order Status" subtitle="Order breakdown for the selected period">
          <DonutChart segments={orderStatus} centerValue={formatNum(totalOrders)} centerLabel="Total Orders" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Top Products" subtitle="Highest GMV in the selected period">
          <DataTable columns={TOP_PRODUCT_COLUMNS} rows={topProducts} />
        </Panel>
        <Panel title="Recent Orders" subtitle="Latest orders across all channels">
          <DataTable columns={RECENT_ORDER_COLUMNS} rows={recentOrders} />
        </Panel>
      </div>
    </div>
  );
}
