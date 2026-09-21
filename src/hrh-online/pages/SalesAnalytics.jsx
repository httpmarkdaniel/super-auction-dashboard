import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { KpiCard, KpiRow } from "../components/Kpi";
import { PairedBarLineChart } from "../components/Charts";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatNum } from "../format";

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
        <PairedBarLineChart data={voucherComboData} series={voucherSeries} xKey="dateLabel" stacked />
      </div>
      <TopSalesDriversPanel topSalesDrivers={voucherAssistedSales?.topSalesDrivers} />
    </Panel>
  );
}

// Real ClickHouse-backed Voucher page — see api/hrh-sales-analytics.js for
// the queries (same locked GMV/NMV/Orders/Units/AOV contract as Product
// Analytics/Executive Overview). Sales Trend/Channel Comparison/Payment
// Type/Checkout Method used to live on this page too; they now render on
// Sales Overview instead (per explicit request), so this page only ever
// asks for the same /api/hrh-sales-analytics payload to read its
// voucherAssistedSales field.
export default function SalesAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Voucher
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Voucher…" />}
      {error && <ErrorState label={`Couldn't load Voucher: ${error}`} />}

      {data && !error && (
        <VoucherAssistedSalesPanel voucherAssistedSales={data.voucherAssistedSales} bucket={voucherBucket} onBucketChange={setVoucherBucket} />
      )}
    </div>
  );
}
