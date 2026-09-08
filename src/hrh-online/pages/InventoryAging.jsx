import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import ShareBar from "../components/ShareBar";
import { BarComparisonChart } from "../components/Charts";
import { inventoryAging } from "../mock/data";
import { formatPeso, formatNum } from "../format";

const OLDEST_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "category", label: "Category" },
  { key: "branch", label: "Branch" },
  { key: "ageDays", label: "Age (days)", render: (r) => formatNum(r.ageDays) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
];

export default function InventoryAging() {
  const { kpis, agingDistribution, agedByCategory, agedByBranch, oldestInventoryTable } = inventoryAging;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Inventory Aging
        </div>
        <DemoBadge text="Threshold definition pending" />
      </div>

      <KpiRow>
        <KpiCard label="Slow-Moving SKUs" value={formatNum(kpis.slowMovingSkus.value)} />
        <KpiCard label="Slow-Moving Value" value={formatPeso(kpis.slowMovingValue.value)} />
        <KpiCard label="Non-Moving SKUs" value={formatNum(kpis.nonMovingSkus.value)} />
        <KpiCard label="Non-Moving Value" value={formatPeso(kpis.nonMovingValue.value)} />
      </KpiRow>

      <Panel title="Aging Distribution (days)" className="mb-4">
        <BarComparisonChart data={agingDistribution} series={[{ key: "value", name: "SKUs" }]} valueFormatter={formatNum} />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel title="Aged Inventory Value by Category">
          <ShareBar segments={agedByCategory} />
        </Panel>
        <Panel title="Aged Inventory Value by Branch">
          <BarComparisonChart data={agedByBranch} series={[{ key: "value", name: "Aged Value", color: "#d99a3d" }]} />
        </Panel>
      </div>

      <Panel title="Oldest Inventory">
        <DataTable columns={OLDEST_COLUMNS} rows={oldestInventoryTable} />
      </Panel>
    </div>
  );
}
