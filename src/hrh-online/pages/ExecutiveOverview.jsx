import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, DonutChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

// The 5 KPI scorecards, each paired with the formatter its value/previous
// need. Same shape/order as data.kpis from api/hrh-executive-overview.js.
const KPI_CARDS = [
  { key: "gmv", label: "GMV", formatter: formatPeso },
  { key: "nmv", label: "NMV", formatter: formatPeso },
  { key: "aov", label: "AOV", formatter: formatPeso },
  { key: "orders", label: "Orders", formatter: formatNum },
  { key: "units", label: "Units", formatter: formatNum },
  { key: "projectedMonthEndSales", label: "Projected Month-End Sales", formatter: formatPeso },
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

  const salesTrend = bucketRows(data?.salesTrend, trendBucket, ["gmv", "orders", "units"]);
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
                  value={c.formatter(k.value)}
                  delta={k.delta}
                  previousLabel={c.formatter(k.previous)}
                />
              );
            })}
          </KpiRow>

          <Panel
            title="Sales Trend"
            subtitle={`GMV, Orders, and Units Sold for the selected period, bucketed by ${trendBucket}`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <SalesTrendComboChart data={salesTrend} />
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
