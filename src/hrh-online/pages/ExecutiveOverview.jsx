import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SeverityBadge from "../components/SeverityBadge";
import { LoadingState, ErrorState } from "../components/States";
import { SalesTrendComboChart, DonutChart } from "../components/Charts";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";
import { formatManila } from "../../utils/manilaTime";

// Real order_status values from xv3.mart_xv3_order_report (verified, not
// assumed), plus the synthetic "Unknown/Unmapped" bucket the API assigns to
// a canonical order with no match in that table — see
// api/hrh-executive-overview.js's comment for why the Order Status donut
// classifies the SAME canonical order population as the Orders KPI (so the
// two always sum to the same total), rather than a separate one.
const ORDER_STATUS_SEVERITY = {
  Paid: "good",
  Completed: "good",
  "For Delivery": "warning",
  Processing: "warning",
  Pending: "warning",
  Cancelled: "critical",
  "Unknown/Unmapped": "warning",
};
const ORDER_STATUS_COLOR = {
  Paid: hrh.good,
  Completed: hrh.series[2],
  "For Delivery": hrh.series[1],
  Processing: hrh.accent,
  Pending: hrh.muted,
  Cancelled: hrh.bad,
  "Unknown/Unmapped": "#c7cdd6",
};

const TOP_PRODUCT_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 200 },
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
];

const RECENT_ORDER_COLUMNS = [
  { key: "orderNumber", label: "Order #" },
  { key: "createdAt", label: "Date", render: (r) => formatManila(r.createdAt) },
  { key: "customer", label: "Customer", maxWidth: 160 },
  { key: "channel", label: "Channel", render: (r) => r.channel || "—" },
  { key: "status", label: "Status", render: (r) => <SeverityBadge severity={ORDER_STATUS_SEVERITY[r.status] || "good"} text={r.status} /> },
  { key: "amount", label: "Amount", render: (r) => (r.amount === null ? "—" : formatPeso(r.amount)) },
];

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

  const salesTrend = data?.salesTrend.map((d) => ({ dateLabel: formatShortDateLabel(d.date), gmv: d.gmv, orders: d.orders })) || [];
  const channelSegments =
    data?.channelMix.map((c) => ({ label: c.channel, value: c.gmv, color: hrh.series[["HMRPH ONLINE", "TIKTOK", "SHOPEE"].indexOf(c.channel) % hrh.series.length] })) || [];
  const orderStatusSegments = data?.orderStatus.map((s) => ({ label: s.status, value: s.count, color: ORDER_STATUS_COLOR[s.status] || hrh.muted })) || [];
  const totalOrderStatusCount = orderStatusSegments.reduce((s, x) => s + x.value, 0);

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

          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr_1fr] gap-4 mb-4">
            <Panel title="Sales Trend" subtitle="Daily GMV and Orders for the selected period">
              <SalesTrendComboChart data={salesTrend} />
            </Panel>
            <Panel title="Sales by Channel" subtitle="GMV share for the selected period">
              <DonutChart segments={channelSegments} centerValue={formatCompactPeso(data.kpis.gmv.value)} centerLabel="Total GMV" />
            </Panel>
            <Panel
              title="Order Status"
              subtitle={data.meta?.orderStatusNote || "Status breakdown of the selected period's Orders"}
            >
              <DonutChart segments={orderStatusSegments} centerValue={formatNum(totalOrderStatusCount)} centerLabel="Total Orders" />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Top Products" subtitle="Highest GMV in the selected period">
              <DataTable columns={TOP_PRODUCT_COLUMNS} rows={data.topProducts} paginate pageSize={10} />
            </Panel>
            <Panel title="Recent Orders" subtitle="Latest orders across all channels">
              <DataTable columns={RECENT_ORDER_COLUMNS} rows={data.recentOrders} paginate pageSize={10} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
