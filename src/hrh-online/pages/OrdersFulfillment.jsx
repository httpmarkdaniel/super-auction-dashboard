import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import FunnelList from "../components/FunnelList";
import { BarComparisonChart } from "../components/Charts";
import { fulfillment } from "../mock/data";
import { formatPct, formatNum } from "../format";

const QUEUE_COLUMNS = [
  { key: "order", label: "Order" },
  { key: "store", label: "Store" },
  { key: "ageHours", label: "Age (hours)", render: (r) => formatNum(r.ageHours) },
  { key: "status", label: "Status" },
];

export default function OrdersFulfillment() {
  const { kpis, funnel, pendingPickQueue, performanceByStore, pickDispatchTimeDistribution } = fulfillment;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Orders &amp; Fulfillment
        </div>
        <DemoBadge text="Timestamp completeness unvalidated" />
      </div>

      <KpiRow>
        <KpiCard label="Orders Requiring Pick" value={formatNum(kpis.ordersRequiringPick.value)} delta={kpis.ordersRequiringPick.delta} />
        <KpiCard label="Pick Rate" value={formatPct(kpis.pickRate.value)} delta={kpis.pickRate.delta} />
        <KpiCard label="Pending Picks" value={formatNum(kpis.pendingPicks.value)} delta={kpis.pendingPicks.delta} />
        <KpiCard label="Avg Pick Time" value={`${kpis.avgPickTime.value} ${kpis.avgPickTime.sub}`} />
        <KpiCard label="Fulfillment Rate" value={formatPct(kpis.fulfillmentRate.value)} delta={kpis.fulfillmentRate.delta} />
      </KpiRow>

      <Panel title="Order Fulfillment Funnel" className="mb-4">
        <FunnelList stages={funnel} />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Panel title="Pending Pick Queue">
          <DataTable columns={QUEUE_COLUMNS} rows={pendingPickQueue} />
        </Panel>
        <Panel title="Fulfillment Performance by Store">
          <BarComparisonChart data={performanceByStore} series={[{ key: "fulfillmentRate", name: "Fulfillment Rate" }]} valueFormatter={(v) => `${v}%`} />
        </Panel>
      </div>

      <Panel title="Pick / Dispatch Time Distribution">
        <BarComparisonChart data={pickDispatchTimeDistribution} series={[{ key: "value", name: "Orders", color: "#d99a3d" }]} valueFormatter={formatNum} />
      </Panel>
    </div>
  );
}
