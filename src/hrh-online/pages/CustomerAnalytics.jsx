import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import ShareBar from "../components/ShareBar";
import DemoBadge from "../components/DemoBadge";
import { BarComparisonChart } from "../components/Charts";
import { customerAnalytics } from "../mock/data";
import { formatPeso, formatPct, formatNum } from "../format";

export default function CustomerAnalytics() {
  const { kpis, newVsReturning, purchaseFrequency, customerValueDistribution, customerSegment } = customerAnalytics;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Customer Analytics
        </div>
        <DemoBadge />
      </div>

      <KpiRow>
        <KpiCard label="Unique Customers" value={formatNum(kpis.uniqueCustomers.value)} delta={kpis.uniqueCustomers.delta} />
        <KpiCard label="New Customers" value={formatNum(kpis.newCustomers.value)} delta={kpis.newCustomers.delta} />
        <KpiCard label="Returning Customers" value={formatNum(kpis.returningCustomers.value)} delta={kpis.returningCustomers.delta} />
        <KpiCard label="Repeat Purchase Rate" value={formatPct(kpis.repeatPurchaseRate.value)} delta={kpis.repeatPurchaseRate.delta} />
        <KpiCard label="Customer AOV" value={formatPeso(kpis.customerAOV.value)} delta={kpis.customerAOV.delta} />
      </KpiRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel title="New vs Returning">
          <ShareBar segments={newVsReturning} />
        </Panel>
        <Panel title="Customer Type / Segment">
          <ShareBar segments={customerSegment} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Purchase Frequency">
          <BarComparisonChart
            data={purchaseFrequency}
            series={[{ key: "value", name: "Customers" }]}
            valueFormatter={(v) => formatNum(v)}
          />
        </Panel>
        <Panel title="Customer Value Distribution">
          <BarComparisonChart
            data={customerValueDistribution}
            series={[{ key: "value", name: "Customers", color: "#d99a3d" }]}
            valueFormatter={(v) => formatNum(v)}
          />
        </Panel>
      </div>
    </div>
  );
}
