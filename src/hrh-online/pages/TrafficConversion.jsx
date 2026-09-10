import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import FunnelList from "../components/FunnelList";
import ShareBar from "../components/ShareBar";
import { TrendChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum } from "../format";

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}
function isDateRangeReady(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return Boolean(dateRange.from && dateRange.to && dateRange.from <= dateRange.to);
  }
  return Boolean(dateRange);
}

// Re-aggregates the API's daily { date, sessions, purchases } rows into
// weekly totals once the range gets long enough that a daily chart turns
// into unreadable noise (YTD can be 250+ points) — auto-selected by range
// length rather than a user-facing toggle, since the approved layout for
// this page doesn't have one. conversionRate is recomputed per bucket from
// the summed sessions/purchases (the same definition as the KPI), not
// averaged from the daily rates.
function bucketConversionTrend(rows) {
  if (!rows || rows.length === 0) return [];
  const bucket = rows.length > 60 ? "week" : "day";
  return bucketRows(rows, bucket, ["sessions", "purchases"]).map((r) => ({
    ...r,
    conversionRate: r.sessions > 0 ? (r.purchases / r.sessions) * 100 : 0,
  }));
}

const CHANNEL_COLORS = [hrh.blue, hrh.accent, ...hrh.series];

// Real GA4-backed Traffic & Conversion — see api/hrh-traffic-analytics.js
// for the discovery/reconciliation this was built against (GA4 exports
// already ETL'd into ClickHouse's ga4.* tables, same CLICKHOUSE_* creds as
// every other api/hrh-*.js file — no separate Google credentials). Uses
// only the dashboard-wide Date Range filter; the sales-channel filter
// (HMRPH Online/TikTok/Shopee) is hidden on this page (see Header.jsx's
// comment) since GA4's acquisition-channel dimension is a different,
// unrelated concept with no verified mapping to those 3 commerce channels.
export default function TrafficConversion({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (params, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await fetch(`/api/hrh-traffic-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    load(dateRangeParams(dateRange), controller.signal);
    return () => controller.abort();
  }, [dateRange, ready, load]);

  const conversionTrend = bucketConversionTrend(data?.conversionTrend);
  const acquisitionChannels =
    data?.acquisitionChannels.map((c, i) => ({ label: c.channel, value: c.sessions, color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] })) || [];
  const funnelStages = data?.funnel.map((f) => ({ label: f.stage, value: f.count })) || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Traffic &amp; Conversion
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Traffic & Conversion…" />}
      {error && <ErrorState label={`Couldn't load Traffic & Conversion: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="Sessions" value={formatNum(data.kpis.sessions.value)} delta={data.kpis.sessions.delta} />
            <KpiCard label="Users" value={formatNum(data.kpis.users.value)} delta={data.kpis.users.delta} />
            <KpiCard label="Engaged Sessions" value={formatNum(data.kpis.engagedSessions.value)} delta={data.kpis.engagedSessions.delta} />
            <KpiCard label="Conversion Rate" value={formatPct(data.kpis.conversionRate.value, 2)} delta={data.kpis.conversionRate.delta} />
            <KpiCard label="Revenue / Session" value={`₱${data.kpis.revenuePerSession.value.toFixed(1)}`} delta={data.kpis.revenuePerSession.delta} />
          </KpiRow>

          <Panel title="Conversion Funnel" subtitle="Sessions -> Product View -> Add to Cart -> Begin Checkout -> Purchase" className="mb-4">
            <FunnelList stages={funnelStages} />
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel title="Conversion Trend" subtitle={data.meta?.conversionRateNote} className="xl:col-span-2">
              <TrendChart
                data={conversionTrend}
                series={[{ key: "conversionRate", name: "Conversion Rate", color: hrh.accent }]}
                xKey="dateLabel"
                valueFormatter={(v) => `${v.toFixed(1)}%`}
              />
            </Panel>
            <Panel title="Traffic by Acquisition Channel" subtitle="Sessions share by GA4 default channel grouping">
              <ShareBar segments={acquisitionChannels} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
