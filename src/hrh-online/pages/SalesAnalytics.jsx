import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ShareBar from "../components/ShareBar";
import { salesAnalytics } from "../mock/data";
import { formatPeso, formatPct, formatNum } from "../format";

const CHANNEL_TABLE_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "cancellationRate", label: "Cancellation Rate", render: (r) => formatPct(r.cancellationRate) },
  { key: "returnRate", label: "Return Rate", render: (r) => formatPct(r.returnRate) },
];

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product" },
  { key: "category", label: "Category" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
];

// Channel filter does a real (cheap) client-side filter of this page's own
// channel-keyed table — every other control on the global filter bar stays
// visual-only for this phase (see Header.jsx's comment).
export default function SalesAnalytics({ filters }) {
  const { kpis, channelTable, categoryContribution, departmentContribution, topProducts, bottomProducts, paymentType, fulfillmentMethod } = salesAnalytics;
  const rows = filters.channel === "All Channels" ? channelTable : channelTable.filter((r) => r.channel === filters.channel);

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Sales Analytics
      </div>

      <KpiRow>
        <KpiCard label="GMV" value={formatPeso(kpis.gmv.value)} delta={kpis.gmv.delta} />
        <KpiCard label="NMV" value={formatPeso(kpis.nmv.value)} delta={kpis.nmv.delta} />
        <KpiCard label="Orders" value={formatNum(kpis.orders.value)} delta={kpis.orders.delta} />
        <KpiCard label="Units" value={formatNum(kpis.units.value)} delta={kpis.units.delta} />
        <KpiCard label="AOV" value={formatPeso(kpis.aov.value)} delta={kpis.aov.delta} />
        <KpiCard label="Voucher-Assisted Sales" value={formatPeso(kpis.voucherAssistedSales.value)} delta={kpis.voucherAssistedSales.delta} />
      </KpiRow>

      <Panel title="Channel Comparison" className="mb-4">
        <DataTable columns={CHANNEL_TABLE_COLUMNS} rows={rows} />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Panel title="Category Contribution">
          <ShareBar segments={categoryContribution} />
        </Panel>
        <Panel title="Department Contribution">
          <ShareBar segments={departmentContribution} />
        </Panel>
        <Panel title="Payment Type">
          <ShareBar segments={paymentType} />
        </Panel>
        <Panel
          title="Checkout / Fulfillment Method"
        >
          <ShareBar segments={fulfillmentMethod} />
          <p className="text-[11px] mt-2.5" style={{ color: "#94a0ae" }}>
            A separate dimension from Payment Type above — Pickup is fulfillment behavior, not a payment method.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Top Products">
          <DataTable columns={PRODUCT_COLUMNS} rows={topProducts} />
        </Panel>
        <Panel title="Bottom Products">
          <DataTable columns={PRODUCT_COLUMNS} rows={bottomProducts} />
        </Panel>
      </div>
    </div>
  );
}
