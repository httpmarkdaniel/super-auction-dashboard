import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, DonutChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { bucketRows, bucketArrayField } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

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
// need. Same shape/order as data.kpis from api/_hrh-executive-overview.js.
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
// api/_hrh-executive-overview.js): Day shifts the whole selected window
// back 1 day, Week back 7 days, Month back 1 calendar month — whatever the
// window's own length or type (a single day, WTD, MTD, a custom span…).
const COMPARE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const CHANNEL_LABEL = {
  "HMRPH ONLINE": "HMRPH Online",
  TIKTOK: "TikTok",
  SHOPEE: "Shopee",
};

// Moved here from the Voucher page (formerly Sales Analytics) per explicit
// request — Channel Comparison/Payment Type/Checkout Method now render on
// Sales Overview instead (Payment Type/Checkout Method replace the Sales by
// Channel row's old Order Lifecycle/Customer Segments donuts; the
// GMV-by-channel Sales Trend that used to come along with them was dropped
// as redundant with this page's own Sales Trend above). Same
// /api/hrh-sales-analytics payload (default report, no
// `report=executiveOverview`), fetched separately below since it's a
// different response shape from this page's own data.
function formatRateWithCount(rate, count) {
  if (rate === null || rate === undefined) return "—";
  return `${formatPct(rate)} (${formatNum(count)})`;
}
// A Channel Comparison figure with its change vs the "Compare to" window
// underneath (row.previous, sent when compareTo is set). Amounts/counts
// show % change; rates show the change in percentage points, colored so
// that a rising cancellation/return rate reads as bad.
function ComparedCell({ main, value, previous, formatPrevious, rate = false }) {
  let delta = null;
  if (previous !== undefined && previous !== null && value !== null && value !== undefined) {
    if (rate) {
      const pp = value - previous;
      delta = { text: `${pp > 0 ? "▲" : pp < 0 ? "▼" : "▬"} ${Math.abs(pp).toFixed(1)} pp`, color: pp > 0 ? hrh.bad : pp < 0 ? hrh.good : hrh.muted };
    } else if (previous) {
      const pct = ((value - previous) / Math.abs(previous)) * 100;
      delta = { text: `${pct > 0 ? "▲" : pct < 0 ? "▼" : "▬"} ${formatPct(Math.abs(pct))}`, color: pct > 0 ? hrh.good : pct < 0 ? hrh.bad : hrh.muted };
    } else if (value) {
      delta = { text: "New", color: hrh.good };
    }
  }
  return (
    <div className="whitespace-nowrap leading-tight">
      <div>{main}</div>
      {delta && (
        <div className="text-[11px] mt-0.5" style={{ color: delta.color }}>
          {delta.text}
          <span style={{ color: hrh.muted }}> vs {formatPrevious(previous)}</span>
        </div>
      )}
    </div>
  );
}

const amountColumn = (key, label, format) => ({
  key,
  label,
  render: (r) => <ComparedCell main={format(r[key])} value={r[key]} previous={r.previous?.[key]} formatPrevious={format} />,
});
const rateColumn = (key, label, countKey) => ({
  key,
  label,
  render: (r) => (
    <ComparedCell
      main={formatRateWithCount(r[key], r[countKey])}
      value={r[key]}
      previous={r.previous?.[key]}
      formatPrevious={(v) => formatPct(v)}
      rate
    />
  ),
});

const CHANNEL_TABLE_COLUMNS = [
  { key: "channel", label: "Channel" },
  amountColumn("gmv", "GMV", formatPeso),
  amountColumn("nmv", "NMV", formatPeso),
  amountColumn("orders", "Orders", formatNum),
  amountColumn("units", "Units", formatNum),
  amountColumn("aov", "AOV", formatPeso),
  rateColumn("cancellationRate", "Cancellation Rate", "cancellations"),
  rateColumn("returnRate", "Return Rate", "returns"),
];

// Sales Trend is now a fixed trailing window (see
// api/_hrh-executive-overview.js's trailingFrom/trailingTo), independent of the page's Date
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

// Real ClickHouse-backed Executive Overview — see api/_hrh-executive-overview.js
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
      const qs = new URLSearchParams({ channel: ch, ...p, compareTo: cmp, report: "executiveOverview" });
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
    load(channel, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [channel, params, compareTo, ready, load]);

  // Second, independent fetch for the sections moved over from the Voucher
  // page (Channel Comparison/Payment Type/Checkout Method) — same endpoint,
  // default report (no report=executiveOverview), so it's a different
  // response shape from `data` above and needs its own state/effect rather
  // than being merged into the call above.
  const [channelData, setChannelData] = useState(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [channelError, setChannelError] = useState(null);

  const loadChannelData = useCallback(async (ch, p, cmp, signal) => {
    setChannelLoading(true);
    setChannelError(null);
    try {
      // compareTo: previous-period counts for Payment Type / Checkout Method.
      const qs = new URLSearchParams({ channel: ch, ...p, compareTo: cmp });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setChannelData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setChannelError(err instanceof Error ? err.message : String(err));
    } finally {
      setChannelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    loadChannelData(channel, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [channel, params, compareTo, ready, loadChannelData]);

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
    data?.channelMix.map((c) => ({
      label: c.channel,
      value: c.gmv,
      previous: c.previousGmv,
      color: hrh.series[["HMRPH ONLINE", "TIKTOK", "SHOPEE"].indexOf(c.channel) % hrh.series.length],
    })) || [];

  return (
    <div>
      {/* "Compare to" drives every change figure on this page — top-right,
          level with the page title, under the topbar's channel buttons (see
          .uf-compare-slot in src/uniform.css). */}
      <div className="uf-compare-slot">
        <div
          className="flex flex-col items-end gap-1.5 rounded-[10px] px-3.5 py-2"
          style={{ background: hrh.surface, border: `1px solid ${hrh.border}`, boxShadow: "0 1px 2px rgba(13,24,45,.06),0 8px 24px rgba(13,24,45,.04)" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ color: hrh.ink }}>
              Compare to
            </span>
            <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${hrh.border}` }}>
              {COMPARE_OPTIONS.map((o) => {
                const active = o.key === compareTo;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setCompareTo(o.key)}
                    className="text-[12.5px] font-bold px-3.5 h-7 transition-colors"
                    style={active ? { background: "#0e1b39", color: "#fff" } : { background: hrh.surface, color: hrh.ink2 }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          {data?.meta?.current && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: hrh.ink }}>
              {effectivePeriodLabel(data.meta.current)}
              <span className="font-normal" style={{ color: hrh.ink2 }}>
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
        </>
      )}

      {/* Moved from the Voucher page (formerly Sales Analytics) per explicit
          request — own fetch/loading/error state (channelData/channelLoading/
          channelError above), independent of this page's own `data`. Sales
          by Channel needs `data`, Payment Type/Checkout Method need
          `channelData` — this row waits on both rather than rendering a
          partially-populated grid. */}
      {channelError && <ErrorState label={`Couldn't load Channel Comparison: ${channelError}`} />}
      {ready && channelLoading && !channelData && <LoadingState label="Loading Channel Comparison…" />}

      {data && channelData && !error && !channelError && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Panel title="Sales by Channel" subtitle="GMV share for the selected period">
            <DonutChart
              segments={channelSegments}
              centerValue={formatCompactPeso(data.kpis.gmv.value)}
              centerLabel="Total GMV"
              valueFormatter={formatPeso}
              comparisonLabel={effectivePeriodLabel(data.meta.previous)}
            />
          </Panel>
          <Panel title="Payment Type" subtitle={channelData.meta?.checkoutCoverageNote || "Orders share by payment method"}>
            <DonutChart
              segments={channelData.paymentType}
              centerValue={formatNum(channelData.paymentType.reduce((s, x) => s + x.value, 0))}
              centerLabel="Orders"
              valueFormatter={(v) => `${formatNum(v)} orders`}
              comparisonLabel={channelData.meta?.comparison ? effectivePeriodLabel(channelData.meta.comparison) : undefined}
            />
          </Panel>
          <Panel
            title="Checkout / Fulfillment Method"
            subtitle={channelData.meta?.checkoutCoverageNote || "Orders share by fulfillment method"}
          >
            <DonutChart
              segments={channelData.fulfillmentMethod}
              centerValue={formatNum(channelData.fulfillmentMethod.reduce((s, x) => s + x.value, 0))}
              centerLabel="Orders"
              valueFormatter={(v) => `${formatNum(v)} orders`}
              comparisonLabel={channelData.meta?.comparison ? effectivePeriodLabel(channelData.meta.comparison) : undefined}
            />
          </Panel>
        </div>
      )}

      {channelData && !channelError && (
        <Panel
          title="Channel Comparison"
          subtitle={channelData.meta?.comparison ? `Changes vs ${effectivePeriodLabel(channelData.meta.comparison)} (Compare to above)` : undefined}
        >
          <DataTable columns={CHANNEL_TABLE_COLUMNS} rows={channelData.channelComparison} />
        </Panel>
      )}
    </div>
  );
}
