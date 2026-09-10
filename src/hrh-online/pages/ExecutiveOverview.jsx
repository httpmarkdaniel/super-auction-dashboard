import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, DonutChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

// Real order_status values from xv3.mart_xv3_order_report (verified, not
// assumed), plus a per-channel "Unmapped (Channel)" bucket the API assigns
// to a canonical order with no match in that table — see
// api/hrh-executive-overview.js's comment for why the Order Status donut
// classifies the SAME canonical order population as the Orders KPI (so the
// two always sum to the same total), rather than a separate one, and why
// Unmapped is split by channel (it means something different per channel —
// TikTok/Shopee orders are never tracked in that table at all, HMRPH Online
// unmapped orders are a real smaller coverage gap).
const ORDER_STATUS_COLOR = {
  Paid: hrh.good,
  Completed: hrh.series[2],
  "For Delivery": hrh.series[1],
  Processing: hrh.accent,
  Pending: hrh.muted,
  Cancelled: hrh.bad,
  "Unmapped (HMRPH Online)": "#c7cdd6",
  "Unmapped (TikTok)": "#a9b1bd",
  "Unmapped (Shopee)": "#8b95a3",
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

  const salesTrend = bucketRows(data?.salesTrend, trendBucket, ["gmv", "orders"]);
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
