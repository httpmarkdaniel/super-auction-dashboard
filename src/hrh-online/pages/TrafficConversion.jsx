import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ShareBar from "../components/ShareBar";
import FunnelList from "../components/FunnelList";
import DemoBadge from "../components/DemoBadge";
import { TrendChart } from "../components/Charts";
import { trafficConversion } from "../mock/data";
import { formatPct, formatNum } from "../format";

const SOURCE_COLUMNS = [
  { key: "source", label: "Source / Medium" },
  { key: "sessions", label: "Sessions", render: (r) => formatNum(r.sessions) },
  { key: "users", label: "Users", render: (r) => formatNum(r.users) },
  { key: "conversionRate", label: "Conversion Rate", render: (r) => formatPct(r.conversionRate) },
];

export default function TrafficConversion() {
  const { kpis, funnel, conversionTrend, trafficByChannel, sourceMedium } = trafficConversion;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Traffic &amp; Conversion
        </div>
        <DemoBadge text="Demo Data — Analytics Integration Pending" />
      </div>

      <KpiRow>
        <KpiCard label="Sessions" value={formatNum(kpis.sessions.value)} delta={kpis.sessions.delta} />
        <KpiCard label="Users" value={formatNum(kpis.users.value)} delta={kpis.users.delta} />
        <KpiCard label="Engaged Sessions" value={formatNum(kpis.engagedSessions.value)} delta={kpis.engagedSessions.delta} />
        <KpiCard label="Conversion Rate" value={formatPct(kpis.conversionRate.value)} delta={kpis.conversionRate.delta} />
        <KpiCard label="Revenue / Session" value={`₱${kpis.revenuePerSession.value.toFixed(1)}`} delta={kpis.revenuePerSession.delta} />
      </KpiRow>

      <Panel title="Conversion Funnel" className="mb-4">
        <FunnelList stages={funnel} />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Panel title="Conversion Trend" className="xl:col-span-2">
          <TrendChart data={conversionTrend} series={[{ key: "conversionRate", name: "Conversion Rate" }]} valueFormatter={(v) => `${v.toFixed(1)}%`} />
        </Panel>
        <Panel title="Traffic by Channel">
          <ShareBar segments={trafficByChannel} />
        </Panel>
      </div>

      <Panel title="Source / Medium">
        <DataTable columns={SOURCE_COLUMNS} rows={sourceMedium} />
      </Panel>
    </div>
  );
}
