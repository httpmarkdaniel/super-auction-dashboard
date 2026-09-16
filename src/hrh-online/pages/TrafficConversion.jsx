import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import FunnelList from "../components/FunnelList";
import ShareBar from "../components/ShareBar";
import { TrendChart, RateTrendComboChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { formatShortDateLabel } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso } from "../format";

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

// Real, HRH-Online-scoped Traffic & Conversion — see
// api/_hrh-traffic-analytics.js's file-header comment for the full scoping
// investigation. Short version: Users/Page Views are GA4 data filtered to
// hmr.ph/shop/ONP (HRH Online's own storefront pages), genuinely store-
// scoped, but GA4 has no "sessions" metric at that grain. Purchases/Revenue
// are real HRH Online website orders, not GA4 purchase events — GA4's
// ecommerce events have no page dimension anywhere in this warehouse, so
// they can't be scoped to one store. Add to Cart/Begin Checkout are left
// out of the funnel entirely rather than shown as unscoped/fabricated
// numbers. Device Mix, Source/Medium, and an hourly heatmap are NOT here —
// no ClickHouse table anywhere crosses pagePath with device/source/hour
// (verified against every ga4.* table's full column list), so those would
// need a direct GA4 Data API integration, not this ClickHouse-ETL'd data —
// tracked separately, not silently faked here. Not affected by the page's
// Channel filter — this page IS the website channel (TikTok/Shopee don't
// send traffic to hmr.ph).
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
      const qs = new URLSearchParams({ report: "traffic", ...params });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
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

  const kpis = data?.kpis;

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
          <p className="text-[11px] mb-4" style={{ color: "#94a0ae" }}>
            {data.meta?.scopeNote}
          </p>

          <KpiRow>
            <KpiCard label="Users" value={formatNum(kpis.users.value)} delta={kpis.users.delta} />
            <KpiCard label="Page Views" value={formatNum(kpis.pageViews.value)} delta={kpis.pageViews.delta} />
            <KpiCard label="Purchases" value={formatNum(kpis.purchases.value)} delta={kpis.purchases.delta} />
            <KpiCard label="Conversion Rate" value={formatPct(kpis.conversionRate.value, 2)} delta={kpis.conversionRate.delta} />
            <KpiCard label="Revenue / Page View" value={formatPeso(kpis.revenuePerView.value)} delta={kpis.revenuePerView.delta} />
            <KpiCard label="Page Views / User" value={kpis.pageViewsPerUser.value.toFixed(2)} delta={kpis.pageViewsPerUser.delta} />
          </KpiRow>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Traffic Trend" subtitle="Daily Users and Page Views (hmr.ph/shop/ONP)">
              <TrendChart
                data={data.trafficTrend.map((d) => ({ ...d, dateLabel: formatShortDateLabel(d.date) }))}
                series={[
                  { key: "pageViews", name: "Page Views", color: hrh.accent },
                  { key: "users", name: "Users", color: hrh.series[0] },
                ]}
                xKey="dateLabel"
                valueFormatter={formatNum}
              />
            </Panel>
            <Panel title="Purchases & Conversion" subtitle="Daily Purchases (real store orders) and Conversion Rate">
              <RateTrendComboChart
                data={data.conversionTrend.map((d) => ({ ...d, dateLabel: formatShortDateLabel(d.date) }))}
                bars={[{ key: "purchases", name: "Purchases", color: hrh.accent }]}
                rateKey="conversionRate"
                rateName="Conversion Rate"
              />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Conversion Funnel" subtitle="Page Views (hmr.ph/shop/ONP) -> Purchases (real HRH Online website orders)">
              <FunnelList stages={data.funnel.map((f) => ({ label: f.stage, value: f.count }))} />
            </Panel>
            <Panel title="New vs Returning Users" subtitle="Share of users in this period (hmr.ph/shop/ONP)">
              <ShareBar
                segments={[
                  { label: "New Users", value: data.newVsReturning[0].value, color: hrh.series[0] },
                  { label: "Returning Users", value: data.newVsReturning[1].value, color: hrh.accent },
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
