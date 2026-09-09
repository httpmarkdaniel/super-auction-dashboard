import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, DonutChart } from "../components/Charts";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

// Real order_status values from xv3.mart_xv3_order_report (verified, not
// assumed), plus the synthetic "Unknown/Unmapped" bucket the API assigns to
// a canonical order with no match in that table — see
// api/hrh-executive-overview.js's comment for why the Order Status donut
// classifies the SAME canonical order population as the Orders KPI (so the
// two always sum to the same total), rather than a separate one.
const ORDER_STATUS_COLOR = {
  Paid: hrh.good,
  Completed: hrh.series[2],
  "For Delivery": hrh.series[1],
  Processing: hrh.accent,
  Pending: hrh.muted,
  Cancelled: hrh.bad,
  "Unknown/Unmapped": "#c7cdd6",
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
function formatShortDateLabel(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}
function addDaysISOLocal(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function mondayOfWeekISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return addDaysISOLocal(iso, dow === 0 ? -6 : 1 - dow);
}
function formatWeekRangeLabel(weekStartIso) {
  const weekEndIso = addDaysISOLocal(weekStartIso, 6);
  const [, sm, sd] = weekStartIso.split("-").map(Number);
  const [, em, ed] = weekEndIso.split("-").map(Number);
  const start = `${SHORT_MONTHS[sm - 1]} ${sd}`;
  const end = sm === em ? `${ed}` : `${SHORT_MONTHS[em - 1]} ${ed}`;
  return `${start}–${end}`;
}
function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${y}`;
}

const TREND_BUCKETS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// Re-buckets the API's daily salesTrend rows into day/week/month totals —
// purely a client-side view of the SAME data already fetched for the
// selected Date Range filter, so it's a separate, lightweight "how do you
// want to look at it" control, not another data-fetching filter.
function bucketSalesTrend(rows, bucket) {
  if (!rows || rows.length === 0) return [];
  if (bucket === "day") {
    return rows.map((d) => ({ dateLabel: formatShortDateLabel(d.date), gmv: d.gmv, orders: d.orders }));
  }
  const keyFor = bucket === "week" ? (d) => mondayOfWeekISO(d.date) : (d) => d.date.slice(0, 7);
  const labelFor = bucket === "week" ? formatWeekRangeLabel : formatMonthLabel;
  const buckets = new Map();
  for (const d of rows) {
    const key = keyFor(d);
    const b = buckets.get(key) || { key, gmv: 0, orders: 0 };
    b.gmv += d.gmv;
    b.orders += d.orders;
    buckets.set(key, b);
  }
  return Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((b) => ({ dateLabel: labelFor(b.key), gmv: b.gmv, orders: b.orders }));
}

function TrendBucketPills({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {TREND_BUCKETS.map((b) => {
        const active = b.key === value;
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => onChange(b.key)}
            className="text-[11.5px] font-semibold px-2.5 h-6 rounded"
            style={
              active
                ? { background: hrh.navy, color: "#ffffff" }
                : { background: "transparent", color: hrh.ink2, border: `1px solid ${hrh.border}` }
            }
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
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

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p });
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
    load(channel, params, controller.signal);
    return () => controller.abort();
  }, [channel, params, ready, load]);

  const salesTrend = bucketSalesTrend(data?.salesTrend, trendBucket);
  const channelSegments =
    data?.channelMix.map((c) => ({ label: c.channel, value: c.gmv, color: hrh.series[["HMRPH ONLINE", "TIKTOK", "SHOPEE"].indexOf(c.channel) % hrh.series.length] })) || [];
  const orderStatusSegments = data?.orderStatus.map((s) => ({ label: s.status, value: s.count, color: ORDER_STATUS_COLOR[s.status] || hrh.muted })) || [];
  const totalOrderStatusCount = orderStatusSegments.reduce((s, x) => s + x.value, 0);
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

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Executive Overview…" />}
      {error && <ErrorState label={`Couldn't load Executive Overview: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="GMV" value={formatPeso(data.kpis.gmv.value)} delta={data.kpis.gmv.delta} />
            <KpiCard label="NMV" value={formatPeso(data.kpis.nmv.value)} delta={data.kpis.nmv.delta} />
            <KpiCard label="AOV" value={formatPeso(data.kpis.aov.value)} delta={data.kpis.aov.delta} />
            <KpiCard label="Orders" value={formatNum(data.kpis.orders.value)} delta={data.kpis.orders.delta} />
            <KpiCard label="Units" value={formatNum(data.kpis.units.value)} delta={data.kpis.units.delta} />
          </KpiRow>

          <Panel
            title="Sales Trend"
            subtitle={`GMV and Orders for the selected period, bucketed by ${trendBucket}`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <SalesTrendComboChart data={salesTrend} />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Sales by Channel" subtitle="GMV share for the selected period">
              <DonutChart segments={channelSegments} centerValue={formatCompactPeso(data.kpis.gmv.value)} centerLabel="Total GMV" />
            </Panel>
            <Panel
              title="Order Status"
              subtitle={data.meta?.orderStatusNote || "Status breakdown of the selected period's Orders"}
            >
              <DonutChart segments={orderStatusSegments} centerValue={formatNum(totalOrderStatusCount)} centerLabel="Total Orders" />
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
