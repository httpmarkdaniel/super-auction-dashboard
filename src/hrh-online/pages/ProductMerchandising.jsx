import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import FunnelList from "../components/FunnelList";
import { BarComparisonChart } from "../components/Charts";
import { merchandising } from "../mock/data";
import { formatPeso, formatNum } from "../format";

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "category", label: "Category" },
  { key: "branch", label: "Branch" },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "age", label: "Age (days)", render: (r) => formatNum(r.age) },
  { key: "status", label: "Status" },
];

export default function ProductMerchandising() {
  const { kpis, publishingFunnel, postingPerformanceByBranch, unpostedBacklogAging, productTable } = merchandising;

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Product &amp; Merchandising
      </div>

      <KpiRow>
        <KpiCard label="Barcoded Items" value={formatNum(kpis.barcodedItems.value)} delta={kpis.barcodedItems.delta} />
        <KpiCard label="Posted Items" value={formatNum(kpis.postedItems.value)} delta={kpis.postedItems.delta} />
        <KpiCard label="Posting Rate" value={`${kpis.postingRate.value.toFixed(1)}%`} delta={kpis.postingRate.delta} />
        <KpiCard label="Unposted Backlog" value={formatNum(kpis.unpostedBacklog.value)} delta={kpis.unpostedBacklog.delta} />
        <KpiCard label="Avg Barcode → Post Time" value={`${kpis.avgBarcodeToPostTime.value} ${kpis.avgBarcodeToPostTime.sub}`} />
      </KpiRow>

      <Panel title="Publishing Funnel" className="mb-4">
        <FunnelList stages={publishingFunnel} />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel title="Posting Performance by Branch">
          <BarComparisonChart data={postingPerformanceByBranch} series={[{ key: "posted", name: "Posted Items" }]} valueFormatter={formatNum} />
        </Panel>
        <Panel title="Unposted Backlog Aging">
          <BarComparisonChart data={unpostedBacklogAging} series={[{ key: "value", name: "Items", color: "#d99a3d" }]} valueFormatter={formatNum} />
        </Panel>
      </div>

      <Panel title="Product Performance">
        <DataTable columns={PRODUCT_COLUMNS} rows={productTable} />
      </Panel>
    </div>
  );
}
