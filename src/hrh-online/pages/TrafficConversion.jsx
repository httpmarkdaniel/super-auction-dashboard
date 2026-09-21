import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import FunnelList from "../components/FunnelList";
import ShareBar from "../components/ShareBar";
import DemoBadge from "../components/DemoBadge";
import { TrendChart } from "../components/Charts";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
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

// Small hand-drawn stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons — one per KPI card, purely decorative.
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  users: (
    <Icon>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  eye: (
    <Icon>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  cart: (
    <Icon>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  peso: (
    <Icon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </Icon>
  ),
  layers: (
    <Icon>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  ),
};

// Shared KPI row + Traffic Trend + Funnel + New/Returning block, used for
// both the Whole Site section (added on top, per explicit request, for
// direct comparison) and the original HRH-Online-scoped section below it —
// same components/layout, different data + labels, so the two read as a
// clean before/after rather than two differently-shaped panels.
function TrafficKpiFunnelSection({ kpis, trend, funnelStages, funnelSubtitle, totalRevenue, newVsReturning, newVsReturningSubtitle }) {
  return (
    <>
      <KpiRow>
        <KpiCard label="Users" icon={ICONS.users} value={formatNum(kpis.users.value)} delta={kpis.users.delta} sparkline={trend.map((d) => d.users)} />
        <KpiCard
          label="Page Views"
          icon={ICONS.eye}
          value={formatNum(kpis.pageViews.value)}
          delta={kpis.pageViews.delta}
          sparkline={trend.map((d) => d.pageViews)}
        />
        <KpiCard
          label="Orders"
          icon={ICONS.cart}
          value={formatNum(kpis.orders.value)}
          delta={kpis.orders.delta}
          sparkline={trend.map((d) => d.orders)}
        />
        <KpiCard
          label="Conversion Rate"
          icon={ICONS.percent}
          value={formatPct(kpis.conversionRate.value, 2)}
          delta={kpis.conversionRate.delta}
          sparkline={trend.map((d) => d.conversionRate)}
        />
        <KpiCard
          label="Revenue / Page View"
          icon={ICONS.peso}
          value={formatPeso(kpis.revenuePerView.value)}
          delta={kpis.revenuePerView.delta}
          sparkline={trend.map((d) => d.revenuePerView)}
        />
        <KpiCard
          label="Page Views / User"
          icon={ICONS.layers}
          value={kpis.pageViewsPerUser.value.toFixed(2)}
          delta={kpis.pageViewsPerUser.delta}
          sparkline={trend.map((d) => d.pageViewsPerUser)}
        />
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-4">
        <div className="xl:col-span-2">
          <Panel title="Traffic Trend" subtitle="Daily Users and Page Views" className="h-full">
            <TrendChart
              data={trend.map((d) => ({ ...d, dateLabel: formatShortDateLabel(d.date) }))}
              series={[
                { key: "pageViews", name: "Page Views", color: hrh.accent },
                { key: "users", name: "Users", color: hrh.series[0] },
              ]}
              xKey="dateLabel"
              valueFormatter={formatNum}
            />
          </Panel>
        </div>
        <div className="xl:col-span-3">
          <Panel title="Conversion Funnel" subtitle={funnelSubtitle} className="h-full">
            <FunnelList stages={funnelStages.map((f) => ({ label: f.stage, value: f.count }))} stageHeight={76} gap={8} />
            <div className="mt-4 pt-3.5 flex items-center justify-between" style={{ borderTop: `1px solid ${hrh.border}` }}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: hrh.ink2 }}>
                Total Revenue
              </span>
              <span className="font-display text-[18px] tabular-nums" style={{ color: hrh.ink }}>
                {formatPeso(totalRevenue)}
              </span>
            </div>
            <p className="text-[10.5px] mt-1.5" style={{ color: hrh.muted }}>
              Not a funnel stage — pesos aren't the same unit as the counts above, so it's shown separately rather than distorting the bar widths.
            </p>
          </Panel>
        </div>
      </div>

      <Panel title="New vs Returning Users" subtitle={newVsReturningSubtitle}>
        <ShareBar
          segments={[
            { label: "New Users", value: newVsReturning[0].value, color: hrh.series[0] },
            { label: "Returning Users", value: newVsReturning[1].value, color: hrh.accent },
          ]}
        />
      </Panel>
    </>
  );
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
// numbers. Device Mix, Source/Medium, and an hourly heatmap are shown as
// explicit "not available" panels (kept in the layout, not silently
// dropped) — no ClickHouse table anywhere crosses pagePath with
// device/source/hour (verified against every ga4.* table's full column
// list); those need a direct GA4 Data API integration, not this
// ClickHouse-ETL'd data. Not affected by the page's Channel filter — this
// page IS the website channel (TikTok/Shopee don't send traffic to hmr.ph).
export default function TrafficConversion({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Branch dropdown — every option EXCLUDES HRH Online (that's its own
  // fixed section below, not a dropdown choice) per explicit request.
  // Options come from data.meta.branches once loaded; "" means none picked.
  const [branchCode, setBranchCode] = useState("");

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (params, br, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ report: "traffic", ...params, ...(br ? { branch: br } : {}) });
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
    load(dateRangeParams(dateRange), branchCode, controller.signal);
    return () => controller.abort();
  }, [dateRange, branchCode, ready, load]);

  const hrhData = data?.hrh;
  const hrhTrend = hrhData?.dailyTrend || [];
  const wholeSite = data?.wholeSite;
  const wholeTrend = wholeSite?.dailyTrend || [];
  const branchData = data?.branch;
  const branchTrend = branchData?.dailyTrend || [];
  const branches = data?.meta?.branches || [];

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
          {/* Branch picker — moved to the very TOP of the page (was
              previously the 3rd section, after two full KPI/trend/funnel
              blocks — easy to miss without a lot of scrolling) so it's the
              first thing visible, no scrolling required. HRH Online is
              never an option here (see api file's BRANCHES comment). */}
          <div
            className="rounded-lg p-4 mb-6 flex items-center justify-between gap-3 flex-wrap"
            style={{ border: `1px solid ${hrh.border}`, background: hrh.surface }}
          >
            <div>
              <div className="text-[12.5px] font-semibold" style={{ color: hrh.ink }}>
                Compare a Branch
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: hrh.muted }}>
                Pick any one other branch to see its Traffic &amp; Conversion below, using the same methodology as HRH Online.
              </p>
            </div>
            <select
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              className="text-[13px] rounded-md px-3 py-2 outline-none font-medium"
              style={{ border: `1px solid ${hrh.border}`, color: hrh.ink, background: "#fff" }}
            >
              <option value="">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {branchCode && branchData && (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.ink2 }}>
                  Branch — {branchData.label}
                </span>
              </div>
              <div className="rounded-md px-3.5 py-2.5 mb-4 text-[11.5px]" style={{ background: hrh.blueSoft, color: hrh.blueText }}>
                {data.meta?.branchScopeNote}
              </div>
              <TrafficKpiFunnelSection
                kpis={branchData.kpis}
                trend={branchTrend}
                funnelStages={branchData.funnel}
                funnelSubtitle={`Page Views -> Users -> Checkout -> Completed Order (${branchData.label})`}
                totalRevenue={branchData.totalRevenue}
                newVsReturning={branchData.newVsReturning}
                newVsReturningSubtitle={`Share of users in this period (${branchData.label}) — same GA4 "new" caveat as HRH Online below.`}
              />
              <div className="my-6 pt-1" style={{ borderTop: `1px solid ${hrh.border}` }} />
            </>
          )}

          {/* Whole Site — the sum of the 6 OTHER branches that currently
              have a real online store (Pioneer/Cainta/Sucat/Mabalacat/Santa
              Rosa Road/Subic — never HRH Online), added on top per explicit
              request so it's a direct comparison against the HRH-Online-
              scoped section below. See api/_hrh-traffic-analytics.js's
              BRANCHES/wholeSiteRows comments. */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.ink2 }}>
              Whole Site
            </span>
            <span
              className="text-[10.5px] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded whitespace-nowrap"
              style={{ background: hrh.blueSoft, color: hrh.blueText }}
            >
              Pioneer + Cainta + Sucat + Mabalacat + Santa Rosa Road + Subic
            </span>
          </div>
          <div className="rounded-md px-3.5 py-2.5 mb-4 text-[11.5px]" style={{ background: hrh.blueSoft, color: hrh.blueText }}>
            {data.meta?.wholeSiteScopeNote}
          </div>

          <TrafficKpiFunnelSection
            kpis={wholeSite.kpis}
            trend={wholeTrend}
            funnelStages={wholeSite.funnel}
            funnelSubtitle="Page Views -> Users -> Checkout -> Completed Order"
            totalRevenue={wholeSite.totalRevenue}
            newVsReturning={wholeSite.newVsReturning}
            newVsReturningSubtitle="Share of users in this period, across all 6 branches — see api file comment: GA4's “new” is whole-property, not per-branch, so this skews heavily Returning"
          />

          <div className="my-6 pt-1" style={{ borderTop: `1px solid ${hrh.border}` }} />

          <div className="flex items-start justify-between gap-3 mb-3">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.ink2 }}>
              HRH Online
            </span>
            <span
              className="text-[10.5px] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded whitespace-nowrap"
              style={{ background: hrh.blueSoft, color: hrh.blueText }}
            >
              HRH Online Only · hmr.ph/shop/ONP
            </span>
          </div>
          <div className="rounded-md px-3.5 py-2.5 mb-4 text-[11.5px]" style={{ background: hrh.blueSoft, color: hrh.blueText }}>
            {data.meta?.scopeNote}
          </div>

          <TrafficKpiFunnelSection
            kpis={hrhData.kpis}
            trend={hrhTrend}
            funnelStages={hrhData.funnel}
            funnelSubtitle="Page Views (hmr.ph/shop/ONP) -> Users -> Checkout -> Completed Order"
            totalRevenue={hrhData.totalRevenue}
            newVsReturning={hrhData.newVsReturning}
            newVsReturningSubtitle="Share of users in this period (hmr.ph/shop/ONP) — see api file comment: GA4's “new” is whole-site, not this-page, so this skews heavily Returning"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Device Mix" subtitle="Share of users by device type" badge={<DemoBadge text="Needs GA4 Data API" />}>
              <EmptyState label="No ClickHouse table crosses this store's pages with device type — would need a direct GA4 Data API query, not yet wired up." />
            </Panel>
            <Panel title="Source / Medium" subtitle="Top traffic sources for this store's pages" badge={<DemoBadge text="Needs GA4 Data API" />}>
              <EmptyState label="No ClickHouse table crosses this store's pages with source/medium — whole-site acquisition tables can't be scoped to one store. Needs a direct GA4 Data API query." />
            </Panel>
            <Panel title="Traffic Heatmap" subtitle="Users by day of week and hour" badge={<DemoBadge text="Needs GA4 Data API" />}>
              <EmptyState label="This warehouse's GA4 data is daily-grain only, everywhere — no hour-of-day dimension exists at all yet, scoped or not." />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
