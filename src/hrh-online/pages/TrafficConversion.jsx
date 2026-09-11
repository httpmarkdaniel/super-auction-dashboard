import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import FunnelList from "../components/FunnelList";
import ShareBar from "../components/ShareBar";
import { TrendChart } from "../components/Charts";
import { formatPct, formatNum } from "../format";

// This page was previously wired to real GA4 data (via ClickHouse, see
// api/_hrh-traffic-analytics.js) but the funnel's Add to Cart/Begin
// Checkout/Purchase stages track HMR's WHOLE website, not HRH Online
// specifically — no verified way to scope them to just this store. Per
// explicit decision, no longer fetched live; every value below is a static
// 0 rather than a real-but-mis-scoped number that could be mistaken for a
// trustworthy metric. Labels/categories are kept so the layout still shows
// its real shape, just with nothing tracked yet.
const ZERO_DATA = {
  kpis: {
    sessions: { value: 0, delta: null },
    users: { value: 0, delta: null },
    engagedSessions: { value: 0, delta: null },
    conversionRate: { value: 0, delta: null },
    revenuePerSession: { value: 0, delta: null },
  },
  funnel: [
    { label: "Sessions", value: 0 },
    { label: "Product View", value: 0 },
    { label: "Add to Cart", value: 0 },
    { label: "Begin Checkout", value: 0 },
    { label: "Purchase", value: 0 },
  ],
  conversionTrend: [],
  acquisitionChannels: [],
};

export default function TrafficConversion() {
  const { kpis, funnel, conversionTrend, acquisitionChannels } = ZERO_DATA;

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Traffic &amp; Conversion
      </div>

      <KpiRow>
        <KpiCard label="Sessions" value={formatNum(kpis.sessions.value)} delta={kpis.sessions.delta} />
        <KpiCard label="Users" value={formatNum(kpis.users.value)} delta={kpis.users.delta} />
        <KpiCard label="Engaged Sessions" value={formatNum(kpis.engagedSessions.value)} delta={kpis.engagedSessions.delta} />
        <KpiCard label="Conversion Rate" value={formatPct(kpis.conversionRate.value, 2)} delta={kpis.conversionRate.delta} />
        <KpiCard label="Revenue / Session" value={`₱${kpis.revenuePerSession.value.toFixed(1)}`} delta={kpis.revenuePerSession.delta} />
      </KpiRow>

      <Panel title="Conversion Funnel" subtitle="Sessions -> Product View -> Add to Cart -> Begin Checkout -> Purchase" className="mb-4">
        <FunnelList stages={funnel} />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Conversion Trend" className="xl:col-span-2">
          <TrendChart
            data={conversionTrend}
            series={[{ key: "conversionRate", name: "Conversion Rate", color: "#eb6834" }]}
            xKey="dateLabel"
            valueFormatter={(v) => `${v.toFixed(1)}%`}
          />
        </Panel>
        <Panel title="Traffic by Acquisition Channel" subtitle="Sessions share by GA4 default channel grouping">
          <ShareBar segments={acquisitionChannels} />
        </Panel>
      </div>
    </div>
  );
}
