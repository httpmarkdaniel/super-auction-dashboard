import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DemoBadge from "../components/DemoBadge";
import ShareBar from "../components/ShareBar";
import FunnelList from "../components/FunnelList";
import SeverityBadge from "../components/SeverityBadge";
import { TrendChart } from "../components/Charts";
import { overview } from "../mock/data";
import { formatPeso, formatPct, formatNum } from "../format";

export default function ExecutiveOverview() {
  const { kpis, conversionKpi, trend, channelContribution, orderFunnel, operationalFlagsPreview } = overview;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Executive Overview
        </div>
        <DemoBadge />
      </div>

      <KpiRow>
        <KpiCard label="GMV" value={formatPeso(kpis.gmv.value)} delta={kpis.gmv.delta} />
        <KpiCard label="NMV" value={formatPeso(kpis.nmv.value)} delta={kpis.nmv.delta} />
        <KpiCard label="Orders" value={formatNum(kpis.orders.value)} delta={kpis.orders.delta} />
        <KpiCard label="AOV" value={formatPeso(kpis.aov.value)} delta={kpis.aov.delta} />
        <KpiCard label="Cancellation Rate" value={formatPct(kpis.cancellationRate.value)} delta={kpis.cancellationRate.delta} />
        <KpiCard label="Pickup Share" value={formatPct(kpis.pickupShare.value)} delta={kpis.pickupShare.delta} />
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Panel title="GMV / NMV Trend" className="xl:col-span-2">
          <TrendChart data={trend} series={[{ key: "gmv", name: "GMV" }, { key: "nmv", name: "NMV" }]} />
        </Panel>
        <Panel title="Channel Contribution">
          <ShareBar segments={channelContribution} />
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e7eaf0" }}>
            <div className="text-[11px] uppercase tracking-[0.05em] font-semibold mb-1" style={{ color: "#5b6573" }}>
              {conversionKpi.label}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold" style={{ color: "#94a0ae" }}>—</span>
              <DemoBadge text={conversionKpi.note} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Order Status Funnel">
          <FunnelList stages={orderFunnel} />
        </Panel>
        <Panel title="Operational Flags Preview">
          <div className="space-y-2">
            {operationalFlagsPreview.map((f) => (
              <div key={f.issue} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: "1px solid #e7eaf0" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <SeverityBadge severity={f.severity} />
                  <span className="text-[13px] truncate" style={{ color: "#111827" }}>
                    {f.issue}
                  </span>
                </div>
                <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: "#111827" }}>
                  {formatNum(f.count)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
