import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import { TrendChart } from "../components/Charts";
import { hrh } from "../theme";
import { channelPerformance } from "../mock/data";
import { formatPeso, formatPct, formatNum } from "../format";

const COMPARISON_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "traffic", label: "Traffic", render: (r) => formatNum(r.traffic) },
  { key: "conversionRate", label: "Conversion", render: (r) => formatPct(r.conversionRate) },
  { key: "cancellationRate", label: "Cancellation", render: (r) => formatPct(r.cancellationRate) },
  { key: "returnRate", label: "Returns", render: (r) => formatPct(r.returnRate) },
  { key: "fulfillmentRate", label: "Fulfillment", render: (r) => formatPct(r.fulfillmentRate) },
  { key: "customers", label: "Customers", render: (r) => formatNum(r.customers) },
];

const TREND_SERIES = [
  { key: "HMRPH Online", name: "HMRPH Online" },
  { key: "TikTok", name: "TikTok" },
  { key: "Shopee", name: "Shopee" },
];

export default function ChannelPerformance() {
  const { scorecards, comparisonTable, salesTrend, diagnostics } = channelPerformance;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Channel Performance
        </div>
        <DemoBadge />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {scorecards.map((c) => (
          <div key={c.channel} className="relative overflow-hidden rounded-md p-4" style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: hrh.accent }} />
            <div className="text-[14px] font-bold mb-2.5" style={{ color: hrh.ink }}>
              {c.channel}
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-[13px]">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em]" style={{ color: hrh.ink2 }}>GMV</div>
                <div className="font-semibold tabular-nums" style={{ color: hrh.ink }}>{formatPeso(c.gmv)}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em]" style={{ color: hrh.ink2 }}>Orders</div>
                <div className="font-semibold tabular-nums" style={{ color: hrh.ink }}>{formatNum(c.orders)}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em]" style={{ color: hrh.ink2 }}>Conversion</div>
                <div className="font-semibold tabular-nums" style={{ color: hrh.ink }}>{formatPct(c.conversionRate)}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em]" style={{ color: hrh.ink2 }}>Cancellation</div>
                <div className="font-semibold tabular-nums" style={{ color: hrh.ink }}>{formatPct(c.cancellationRate)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Panel title="Cross-Channel Comparison" className="mb-4">
        <DataTable columns={COMPARISON_COLUMNS} rows={comparisonTable} />
      </Panel>

      <Panel title="Sales Trend by Channel" className="mb-4">
        <TrendChart data={salesTrend} series={TREND_SERIES} />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Channel Diagnostics" className="md:col-span-1">
          <div className="space-y-3">
            {diagnostics.map((d) => (
              <div key={d.channel}>
                <div className="text-[12.5px] font-semibold" style={{ color: hrh.ink }}>{d.channel}</div>
                <div className="text-[12.5px]" style={{ color: hrh.ink2 }}>{d.note}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Composite Health Score">
          <div className="flex items-center justify-center py-6">
            <DemoBadge text="Composite Health Score — Coming Later" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
