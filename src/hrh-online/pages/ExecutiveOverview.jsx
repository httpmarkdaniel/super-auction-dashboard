import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, DonutChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { bucketRows, bucketArrayField } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

// Small inline stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons / TrafficConversion.jsx's KPI icons — kept
// page-local (not a shared module) so this file has no cross-page
// dependency. `trendKey` names the field in data.salesTrend this KPI has a
// real daily series for — omitted (undefined) means no daily breakdown
// exists in the API response, so that card gets an icon only, no
// sparkline (never a fabricated/derived-on-the-fly trend).
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  chartLine: (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-4 4" />
    </Icon>
  ),
  peso: (
    <Icon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </Icon>
  ),
  cart: (
    <Icon>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Icon>
  ),
  box: (
    <Icon>
      <path d="M21 8V21H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </Icon>
  ),
};

// The 5 KPI scorecards, each paired with the formatter its value/previous
// need. Same shape/order as data.kpis from api/hrh-executive-overview.js.
// `trendKey`: see ICONS comment above — only gmv/orders/units have a real
// daily series in data.salesTrend; nmv/aov don't, so they get no sparkline.
const KPI_CARDS = [
  { key: "gmv", label: "GMV", formatter: formatPeso, icon: ICONS.chartLine, trendKey: "gmv" },
  { key: "nmv", label: "NMV", formatter: formatPeso, icon: ICONS.peso },
  { key: "aov", label: "AOV", formatter: formatPeso, icon: ICONS.peso },
  { key: "orders", label: "Orders", formatter: formatNum, icon: ICONS.cart, trendKey: "orders" },
  { key: "units", label: "Units", formatter: formatNum, icon: ICONS.box, trendKey: "units" },
];

// "Compare to" — an explicit, independent choice of comparison basis for
// every scorecard's bottom-of-card delta, decoupled from the Date Range
// filter itself (see resolveComparisonWindow in
// api/hrh-executive-overview.js): Day shifts the whole selected window
// back 1 day, Week back 7 days, Month back 1 calendar month — whatever the
// window's own length or type (a single day, WTD, MTD, a custom span…).
const COMPARE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// Canonical lifecycle buckets (Fulfilled/Cancelled/Still Awaiting) — same
// definitions as Orders & Fulfillment (api/_hrh-orders-fulfillment.js's
// computeHmrphOnlineLifecycle), never the raw order_status field. See
// api/hrh-executive-overview.js's comment for why this is fixed to HMRPH
// Online regardless of the page's Channel filter.
const ORDER_LIFECYCLE_COLOR = {
  Fulfilled: hrh.good,
  Cancelled: hrh.bad,
  "Still Awaiting Fulfillment": hrh.muted,
};

const CHANNEL_LABEL = {
  "HMRPH ONLINE": "HMRPH Online",
  TIKTOK: "TikTok",
  SHOPEE: "Shopee",
};

// Sales Trend is now a fixed trailing window (see api/hrh-executive-
// overview.js's trailingFrom/trailingTo), independent of the page's Date
// Range filter — Day shows the last 30 days, Week the last 4 weeks, Month
// the last 6 months, always ending today, regardless of what's selected
// above. These counts are how many of bucketRows' most-recent buckets to
// keep after re-bucketing the same underlying daily data.
const TRAILING_BUCKET_COUNT = { day: 30, week: 4, month: 6 };

// Adds a per-channel GMV breakdown (HMRPH Online/TikTok/Shopee) under the
// default GMV/Orders/Units rows — `channelBreakdown` is attached to each
// bucketed row client-side (see the salesTrend construction below) via
// bucketArrayField, same pattern SalesAnalytics.jsx's OtherBreakdownTooltip
// uses for its "Other" bar. Channels with 0 GMV that bucket aren't listed
// (never a fabricated 0 row) since the backend only ever includes real,
// positive per-channel GMV in this array.
function SalesTrendChannelTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const channelBreakdown = row?.channelBreakdown || [];
  return (
    <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: "#a3adba" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}:
          </span>
          <span className="font-semibold">{p.dataKey === "gmv" ? formatCompactPeso(p.value) : formatNum(p.value)}</span>
        </div>
      ))}
      {channelBreakdown.length > 0 && (
        <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${hrh.navyBorder}` }}>
          <div style={{ color: "#a3adba" }}>GMV by channel:</div>
          {channelBreakdown.map((c) => (
            <div key={c.label} className="flex items-center justify-between gap-4">
              <span style={{ color: "#a3adba" }}>{CHANNEL_LABEL[c.label] || c.label}</span>
              <span className="font-semibold">{formatCompactPeso(c.gmv)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// HMRPH Online only — verified every TikTok/Shopee order carries
// customer_name = 'WALK IN' (no real buyer identity captured on HMR's
// side for marketplace orders), so this panel is fixed to HMRPH Online
// regardless of the page's Channel filter — see
// api/hrh-executive-overview.js's comment for the full reasoning.
const SEGMENT_COLOR = {
  New: hrh.good,
  Retained: hrh.series[0],
  Reactivated: hrh.accent,
  Unregistered: "#c7cdd6",
  Unknown: hrh.muted,
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatIsoDateLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
}
function effectivePeriodLabel(period) {
  if (!period) return null;
  const from = formatIsoDateLabel(period.from);
  const to = formatIsoDateLabel(period.to);
  if (!from || !to) return null;
  return from === to ? from : `${from} – ${to}`;
}

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

// Real ClickHouse-backed Executive Overview — see api/hrh-executive-overview.js
// for the query/reconciliation (same locked GMV/NMV/Orders/Units/AOV
// contract as Product Analytics). Uses the dashboard-wide Date Range +
// Channel filter (Header), refetches on either change; no polling.
export default function ExecutiveOverview({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [compareTo, setCompareTo] = useState("week");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, cmp, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, compareTo: cmp });
      const res = await fetch(`/api/hrh-executive-overview?${qs.toString()}`, { signal });
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
    load(channel, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [channel, params, compareTo, ready, load]);

  // Fixed trailing window, independent of the Date Range filter — see
  // TRAILING_BUCKET_COUNT comment. bucketArrayField merges the per-day
  // channelBreakdown array into whichever bucket each day lands in, keyed
  // by the same dateLabel bucketRows produces, so it can be attached back
  // onto each row for the hover tooltip.
  const salesTrendBuckets = bucketRows(data?.salesTrendTrailing, trendBucket, ["gmv", "orders", "units"]);
  const salesTrendChannelByBucket = bucketArrayField(data?.salesTrendTrailing, trendBucket, "channelBreakdown");
  const salesTrend = salesTrendBuckets.slice(-TRAILING_BUCKET_COUNT[trendBucket]).map((row) => ({
    ...row,
    channelBreakdown: salesTrendChannelByBucket.get(row.dateLabel) || [],
  }));
  const channelSegments =
    data?.channelMix.map((c) => ({ label: c.channel, value: c.gmv, color: hrh.series[["HMRPH ONLINE", "TIKTOK", "SHOPEE"].indexOf(c.channel) % hrh.series.length] })) || [];
  const orderLifecycleSegments =
    data?.orderLifecycle.map((s) => ({ label: s.status, value: s.count, color: ORDER_LIFECYCLE_COLOR[s.status] || hrh.muted })) || [];
  const customerSegments =
    data?.customerSegments.map((s) => ({ label: s.segment, value: s.orders, color: SEGMENT_COLOR[s.segment] || hrh.muted })) || [];
  const totalCustomerSegmentCount = customerSegments.reduce((s, x) => s + x.value, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Executive Overview
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Key performance metrics and trends for HRH Online
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.muted }}>
              Compare to
            </span>
            <TrendBucketPills value={compareTo} onChange={setCompareTo} options={COMPARE_OPTIONS} />
          </div>
          {data?.meta?.current && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: hrh.ink2 }}>
              {effectivePeriodLabel(data.meta.current)}
              <span className="font-normal" style={{ color: hrh.muted }}>
                {" "}
                vs {effectivePeriodLabel(data.meta.previous)}
              </span>
            </span>
          )}
        </div>
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Executive Overview…" />}
      {error && <ErrorState label={`Couldn't load Executive Overview: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            {KPI_CARDS.map((c) => {
              const k = data.kpis[c.key];
              return (
                <KpiCard
                  key={c.key}
                  label={c.label}
                  icon={c.icon}
                  value={c.formatter(k.value)}
                  delta={k.delta}
                  previousLabel={c.formatter(k.previous)}
                  sparkline={c.trendKey ? data.salesTrend.map((d) => d[c.trendKey]) : undefined}
                />
              );
            })}
          </KpiRow>

          <Panel
            title="Sales Trend"
            subtitle={`Last ${TRAILING_BUCKET_COUNT[trendBucket]} ${trendBucket === "day" ? "days" : trendBucket + "s"}, ending today — independent of the Date Range filter above. Hover a bar for the HMRPH Online/TikTok/Shopee breakdown.`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <SalesTrendComboChart data={salesTrend} tooltipContent={SalesTrendChannelTooltip} />
          </Panel>

          <Panel
            title="Avg Sales / Day by Channel"
            subtitle="All 3 channels, always — not affected by the Channel filter above. Sundays (store closed) excluded from the day count."
            className="mb-4"
          >
            <KpiRow>
              {data.avgSalesPerDayByChannel.map((c) => (
                <KpiCard
                  key={c.channel}
                  label={CHANNEL_LABEL[c.channel] || c.channel}
                  icon={ICONS.peso}
                  value={formatPeso(c.value)}
                  delta={c.delta}
                  previousLabel={formatPeso(c.previous)}
                />
              ))}
            </KpiRow>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Sales by Channel" subtitle="GMV share for the selected period">
              <DonutChart segments={channelSegments} centerValue={formatCompactPeso(data.kpis.gmv.value)} centerLabel="Total GMV" />
            </Panel>
            <Panel
              title="Order Lifecycle"
              subtitle={data.meta?.orderLifecycleNote || "Fulfilled / Cancelled / Still Awaiting Fulfillment"}
            >
              <DonutChart
                segments={orderLifecycleSegments}
                centerValue={formatNum(data.orderLifecycleTotal)}
                centerLabel="Real Orders Received"
              />
            </Panel>
            <Panel title="Customer Segments" subtitle="HMRPH Online only — not affected by the Channel filter above">
              <DonutChart segments={customerSegments} centerValue={formatNum(totalCustomerSegmentCount)} centerLabel="HMRPH Online Orders" />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
