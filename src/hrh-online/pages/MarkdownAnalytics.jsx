import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import { BarComparisonChart } from "../components/Charts";
import { markdownAnalytics } from "../mock/data";
import { formatPeso, formatNum } from "../format";

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "category", label: "Category" },
  { key: "markdownPct", label: "Markdown %", render: (r) => `${r.markdownPct}%` },
  { key: "ageDays", label: "Age (days)", render: (r) => formatNum(r.ageDays) },
  { key: "status", label: "Status" },
];

export default function MarkdownAnalytics() {
  const { kpis, markdownDepthDistribution, markdownPerformance, agedVsMarkdown, markdownProductTable } = markdownAnalytics;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Markdown Analytics
        </div>
        <DemoBadge text="Price history integration pending" />
      </div>

      <KpiRow>
        <KpiCard label="Items Marked Down" value={formatNum(kpis.itemsMarkedDown.value)} />
        <KpiCard label="Average Markdown %" value={`${kpis.avgMarkdownPct.value}%`} />
        <KpiCard label="Marked-Down GMV" value={formatPeso(kpis.markedDownGmv.value)} />
        <KpiCard label="Aged + Marked + Unsold" value={formatNum(kpis.agedMarkedUnsold.value)} />
      </KpiRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel title="Markdown Depth Distribution">
          <BarComparisonChart data={markdownDepthDistribution} series={[{ key: "value", name: "Items" }]} valueFormatter={formatNum} />
        </Panel>
        <Panel title="Markdown Performance (GMV, pre vs post)">
          <BarComparisonChart
            data={markdownPerformance}
            series={[{ key: "preMarkdownGmv", name: "Pre-Markdown GMV" }, { key: "postMarkdownGmv", name: "Post-Markdown GMV" }]}
          />
        </Panel>
      </div>

      <Panel title="Aged Inventory vs Markdown (by category)" className="mb-4">
        <BarComparisonChart
          data={agedVsMarkdown}
          series={[{ key: "agedValue", name: "Aged Value" }, { key: "markedDownValue", name: "Marked-Down Value" }]}
        />
      </Panel>

      <Panel title="Markdown Products">
        <DataTable columns={PRODUCT_COLUMNS} rows={markdownProductTable} />
      </Panel>
    </div>
  );
}
