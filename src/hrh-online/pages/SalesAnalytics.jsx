import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { KpiCard, KpiRow } from "../components/Kpi";
import { DonutChart, BarComparisonChart, PairedBarLineChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatPct, formatNum, formatCompactPeso } from "../format";

// Sales Trend is a fixed trailing window (last 30 days/4 weeks/6 months,
// always ending today), independent of the page's Date Range filter — same
// pattern as Executive Overview's Sales Trend (see api/hrh-sales-
// analytics.js's trailingFrom/trailingTo). These counts are how many of
// bucketRows' most-recent buckets to keep after re-bucketing. GMV only,
// stacked by channel (HMRPH Online/TikTok/Shopee) — no Orders/Units here,
// per explicit request.
const TRAILING_BUCKET_COUNT = { day: 30, week: 4, month: 6 };
// Colors per explicit request, not each brand's own real color — just this
// chart's own consistent code: HMRPH Online = dark blue, TikTok = orange
// (hrh.accent, HMR's own brand orange), Shopee = green (hrh.good).
const SALES_TREND_CHANNEL_SERIES = [
  { key: "gmvHmrphOnline", name: "HMRPH Online", color: hrh.series[0] },
  { key: "gmvTiktok", name: "TikTok", color: hrh.accent },
  { key: "gmvShopee", name: "Shopee", color: hrh.good },
];

// Small hand-drawn stroke icons for VoucherAssistedSalesPanel's KPI row —
// same feather-icon convention as TrafficConversion.jsx / Sidebar.jsx
// (24x24 viewBox, stroke=currentColor). Kept local to this file rather than
// a shared module since each HRH Online page owns its own icon picks, same
// spirit as this codebase's per-file API duplication convention.
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  cart: (
    <Icon>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Icon>
  ),
  users: (
    <Icon>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  peso: (
    <Icon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </Icon>
  ),
  tag: (
    <Icon>
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L3 3v6.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83Z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  ),
};

function formatRateWithCount(rate, count) {
  if (rate === null || rate === undefined) return "—";
  return `${formatPct(rate)} (${formatNum(count)})`;
}

const DRIVER_VALUE_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 220 },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
];
const DRIVER_QTY_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 220 },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
];
// Real per-product GMV/Units among voucher-assisted orders only (see
// api/hrh-sales-analytics.js's voucherDriverRows — joins voucher orders
// back to their real line-item sales; ~85% coverage, not every voucher
// order has a matching sales record, see that file's comment).
function TopSalesDriversPanel({ topSalesDrivers }) {
  const data = topSalesDrivers || { byValue: [], byQty: [] };
  return (
    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${hrh.border}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2.5" style={{ color: hrh.ink2 }}>
        Top Sales Drivers — Voucher Assisted Only
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] font-semibold mb-1.5" style={{ color: hrh.ink2 }}>
            By Value
          </div>
          <DataTable columns={DRIVER_VALUE_COLUMNS} rows={data.byValue} emptyLabel="No voucher-assisted sales in this window" />
        </div>
        <div>
          <div className="text-[11px] font-semibold mb-1.5" style={{ color: hrh.ink2 }}>
            By Qty
          </div>
          <DataTable columns={DRIVER_QTY_COLUMNS} rows={data.byQty} emptyLabel="No voucher-assisted sales in this window" />
        </div>
      </div>
    </div>
  );
}

const CHANNEL_TABLE_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "cancellationRate", label: "Cancellation Rate", render: (r) => formatRateWithCount(r.cancellationRate, r.cancellations) },
  { key: "returnRate", label: "Return Rate", render: (r) => formatRateWithCount(r.returnRate, r.returns) },
];

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

// cms.mart_cms_voucher_report has no sales_channel column and — verified —
// carries only HMRPH Online orders for this store, so this panel is fixed
// to HMRPH Online regardless of the page's Channel filter (same convention
// as Executive Overview's Customer Segments). Distinct Customers is a
// whole-window number only (see api/hrh-sales-analytics.js's comment on why
// it can't be correctly summed per bucket). Unlike Sales Trend above, this
// stays tied to the page's Date Range filter — not a fixed trailing window.
//
// The combo chart emphasizes WHICH specific vouchers are getting used (top
// 6 by orders + "Other", same series/colors as both bar and line for a
// given voucher — see api/hrh-sales-analytics.js's buildVoucherSeriesTrend)
// rather than the combined Order Value/Discount Value total this panel
// showed before. Discount Value (₱) is the bar (left axis), Orders (count)
// is the line (right axis), one dense combo chart per explicit request
// rather than two side-by-side ones.
function VoucherAssistedSalesPanel({ voucherAssistedSales, bucket, onBucketChange }) {
  const totals = voucherAssistedSales?.totals;
  const byVoucherTrend = voucherAssistedSales?.byVoucherTrend;
  const voucherSeries = byVoucherTrend?.series || [];
  const seriesKeys = voucherSeries.map((s) => s.key);
  const ordersByVoucher = bucketRows(byVoucherTrend?.ordersData, bucket, seriesKeys);
  const discountByVoucher = bucketRows(byVoucherTrend?.discountData, bucket, seriesKeys);
  // Merge the two same-length, same-order bucketed arrays into one combo
  // dataset — `${key}__bar` (Discount Value) and `${key}__line` (Orders)
  // per voucher, per bucket (see PairedBarLineChart in Charts.jsx).
  const voucherComboData = discountByVoucher.map((discountRow, i) => {
    const ordersRow = ordersByVoucher[i] || {};
    const row = { dateLabel: discountRow.dateLabel };
    for (const key of seriesKeys) {
      row[`${key}__bar`] = discountRow[key] || 0;
      row[`${key}__line`] = ordersRow[key] || 0;
    }
    return row;
  });
  return (
    <Panel
      title="Voucher Assisted Sales"
      subtitle="HMRPH Online only — not affected by the Channel filter above"
      action={<TrendBucketPills value={bucket} onChange={onBucketChange} />}
      className="mb-4"
    >
      <KpiRow>
        <KpiCard label="Orders" icon={ICONS.cart} value={formatNum(totals?.orders)} sparkline={voucherAssistedSales?.trend?.map((r) => r.orders)} />
        {/* Distinct Customers: whole-window-only aggregate (see file-header comment — uniqExact per day can't be summed into a per-bucket series), so icon only, no sparkline. */}
        <KpiCard label="Distinct Customers" icon={ICONS.users} value={formatNum(totals?.distinctCustomers)} />
        <KpiCard
          label="Total Order Value"
          icon={ICONS.peso}
          value={formatPeso(totals?.orderPrice)}
          sparkline={voucherAssistedSales?.trend?.map((r) => r.orderPrice)}
        />
        <KpiCard
          label="Total Discount Value"
          icon={ICONS.tag}
          value={formatPeso(totals?.discountPrice)}
          sparkline={voucherAssistedSales?.trend?.map((r) => r.discountPrice)}
        />
        {/* Average Order Value: a derived ratio (orderPrice/orders), not a real per-day summable quantity, so icon only, no sparkline. */}
        <KpiCard label="Average Order Value" icon={ICONS.peso} value={formatPeso(totals?.aov)} />
      </KpiRow>
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: hrh.ink2 }}>
            Discount Value &amp; Orders by Voucher
          </div>
          <div className="text-[10.5px]" style={{ color: hrh.muted }}>
            Bars = Discount Value (₱) · hover a bar for that voucher's Orders count
          </div>
        </div>
        <PairedBarLineChart data={voucherComboData} series={voucherSeries} xKey="dateLabel" />
      </div>
      <TopSalesDriversPanel topSalesDrivers={voucherAssistedSales?.topSalesDrivers} />
    </Panel>
  );
}

// Real ClickHouse-backed Sales Analytics — see api/hrh-sales-analytics.js
// for the queries (same locked GMV/NMV/Orders/Units/AOV contract as Product
// Analytics/Executive Overview). Channel Comparison always shows all 3
// channels (it IS the channel breakdown, so the filter would just hide
// rows); the panels below it respect the page's Channel + Date Range filter
// like everywhere else on the dashboard.
export default function SalesAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [voucherBucket, setVoucherBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (ch, params, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...params });
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
    load(channel, dateRangeParams(dateRange), controller.signal);
    return () => controller.abort();
  }, [channel, dateRange, ready, load]);

  // Fixed trailing window, independent of the Date Range filter — see
  // TRAILING_BUCKET_COUNT comment. Same bucketRows pattern Executive
  // Overview's own Sales Trend uses, just summing 3 per-channel GMV keys
  // instead of gmv/orders/units.
  const salesTrend = bucketRows(
    data?.salesTrendTrailing,
    trendBucket,
    SALES_TREND_CHANNEL_SERIES.map((s) => s.key),
  ).slice(-TRAILING_BUCKET_COUNT[trendBucket]);

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Sales Analytics
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Sales Analytics…" />}
      {error && <ErrorState label={`Couldn't load Sales Analytics: ${error}`} />}

      {data && !error && (
        <>
          <Panel
            title="Sales Trend"
            subtitle={`GMV by channel — last ${TRAILING_BUCKET_COUNT[trendBucket]} ${trendBucket === "day" ? "days" : trendBucket + "s"}, ending today, independent of the Date Range filter above`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <BarComparisonChart
              data={salesTrend}
              series={SALES_TREND_CHANNEL_SERIES}
              xKey="dateLabel"
              valueFormatter={formatCompactPeso}
              stacked={trendBucket === "day"}
            />
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            <div className="xl:col-span-2">
              <Panel title="Channel Comparison" className="h-full">
                <DataTable columns={CHANNEL_TABLE_COLUMNS} rows={data.channelComparison} />
              </Panel>
            </div>
            <div className="flex flex-col gap-4 h-full">
              <Panel
                title="Payment Type"
                subtitle={data.meta?.checkoutCoverageNote || "Orders share by payment method"}
                className="flex-1 flex flex-col"
              >
                <div className="flex-1 flex items-center">
                  <DonutChart
                    segments={data.paymentType}
                    size={84}
                    centerValue={formatNum(data.paymentType.reduce((s, x) => s + x.value, 0))}
                    centerLabel="Orders"
                  />
                </div>
              </Panel>
              <Panel
                title="Checkout / Fulfillment Method"
                subtitle={data.meta?.checkoutCoverageNote || "Orders share by fulfillment method"}
                className="flex-1 flex flex-col"
              >
                <div className="flex-1 flex items-center">
                  <DonutChart
                    segments={data.fulfillmentMethod}
                    size={84}
                    centerValue={formatNum(data.fulfillmentMethod.reduce((s, x) => s + x.value, 0))}
                    centerLabel="Orders"
                  />
                </div>
                <p className="text-[11px] mt-2.5" style={{ color: "#94a0ae" }}>
                  A separate dimension from Payment Type above — Pickup is fulfillment behavior, not a payment method.
                </p>
              </Panel>
            </div>
          </div>

          <VoucherAssistedSalesPanel voucherAssistedSales={data.voucherAssistedSales} bucket={voucherBucket} onBucketChange={setVoucherBucket} />
        </>
      )}
    </div>
  );
}
