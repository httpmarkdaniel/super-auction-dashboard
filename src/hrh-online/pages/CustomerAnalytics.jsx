import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { ComboBarLineChart, BarComparisonChart } from "../components/Charts";
import PhilippinesMap from "../components/PhilippinesMap";
import { LoadingState, ErrorState } from "../components/States";
import { formatShortDateLabel, formatWeekRangeLabel, formatMonthLabel } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatPct, formatNum } from "../format";

const TREND_LABEL_FORMATTER = { day: formatShortDateLabel, week: formatWeekRangeLabel, month: formatMonthLabel };

// The 5 KPI scorecards, each paired with the formatter its value/previous
// need — same shape/order as data.kpis from api/_hrh-customer-analytics.js.
const KPI_CARDS = [
  { key: "uniqueCustomers", label: "Unique Customers", formatter: formatNum },
  { key: "newCustomers", label: "New Customers", formatter: formatNum, sub: "1 lifetime order" },
  { key: "returningCustomers", label: "Returning Customers", formatter: formatNum, sub: "2+ lifetime orders" },
  { key: "repeatRate", label: "Repeat Rate", formatter: formatPct },
  { key: "salesPerCustomer", label: "Sales / Customer", formatter: formatPeso },
];

// "Compare to" — an explicit, independent choice of comparison basis for
// every scorecard's bottom-of-card delta, decoupled from the Date Range
// filter itself (same control as Executive Overview — see
// resolveComparisonWindow in api/_hrh-customer-analytics.js): Day shifts
// the whole selected window back 1 day, Week back 7 days, Month back 1
// calendar month, regardless of the window's own length or type.
const COMPARE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

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

// "Preferred Category/Subcategory" per gender is the single highest-GMV
// category/subcategory for that gender in the selected window — computed
// server-side from independently-rolled-up totals (not just the single
// best category+subcategory pairing, which would undercount a category
// whose sales spread across several subcategories — see
// api/_hrh-customer-analytics.js's comment for the reconciliation).
const DEMOGRAPHICS_COLUMNS = [
  { key: "gender", label: "Gender" },
  { key: "customers", label: "Customers", render: (r) => formatNum(r.customers) },
  { key: "share", label: "% of Total", render: (r) => formatPct(r.share) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "preferredCategory", label: "Preferred Category", render: (r) => r.preferredCategory || "—" },
  { key: "preferredSubcategory", label: "Preferred Subcategory", render: (r) => r.preferredSubcategory || "—" },
];

const TOP_CUSTOMER_COLUMNS = [
  { key: "customer", label: "Customer", maxWidth: 200 },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "firstPurchase", label: "First Purchase" },
  { key: "lastBuy", label: "Last Buy" },
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

// Real ClickHouse-backed Customer Analytics — see api/_hrh-customer-analytics.js
// (dispatched from api/hrh-sales-analytics.js via ?report=customers, co-located
// only because of the Vercel Hobby plan's 12-function cap) for the queries.
// New/Returning is "one-time buyer status" — New = exactly one lifetime
// order across all of HMR (any store/channel) as of today, Returning = 2+.
// Deliberately NOT tied to the selected date range (see
// api/_hrh-customer-analytics.js's isOneTimeBuyer comment for why an
// earlier "first order fell inside this window" definition was replaced).
// Customer Trend's Day/Week/Month toggle switches
// between 3 PRECOMPUTED server-side series (data.customerTrend.day/week/
// month), not a client-side re-aggregation of one daily series — distinct-
// customer counts can't be safely summed across days the way GMV/Orders
// sums can (bucketRows() would double-count a customer active on 2+ days
// within the same week/month bucket).
export default function CustomerAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [compareTo, setCompareTo] = useState("week");
  const [hoveredProvince, setHoveredProvince] = useState(null);

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (ch, params, cmp, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...params, compareTo: cmp, report: "customers" });
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
    load(channel, dateRangeParams(dateRange), compareTo, controller.signal);
    return () => controller.abort();
  }, [channel, dateRange, compareTo, ready, load]);

  const formatTrendLabel = TREND_LABEL_FORMATTER[trendBucket];
  const customerTrend =
    data?.customerTrend[trendBucket].map((r) => ({
      dateLabel: formatTrendLabel(r.bucket),
      newCustomers: r.newCustomers,
      returningCustomers: r.returningCustomers,
    })) || [];
  const purchaseFrequencyRows = data?.purchaseFrequency.map((r) => ({ label: r.bucket, customers: r.count })) || [];
  const spendDistributionRows = data?.spendDistribution.map((r) => ({ label: r.bucket, customers: r.count })) || [];
  const customersByProvince = data?.customersByProvince || [];
  const totalMappedCustomers = customersByProvince.reduce((s, p) => s + p.customers, 0);
  const activeProvinceName = hoveredProvince || customersByProvince[0]?.province || null;
  const activeProvince = customersByProvince.find((p) => p.province === activeProvinceName) || null;
  const byGender = data?.customerDemographics?.byGender || [];
  const totalGenderCustomers = byGender.reduce((s, g) => s + g.customers, 0);
  const demographicsRows = byGender.map((g) => ({ ...g, share: totalGenderCustomers > 0 ? (g.customers / totalGenderCustomers) * 100 : 0 }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Customer Analytics
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
      {ready && loading && !data && <LoadingState label="Loading Customer Analytics…" />}
      {error && <ErrorState label={`Couldn't load Customer Analytics: ${error}`} />}

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
                  sub={c.sub}
                  previousLabel={c.formatter(k.previous)}
                />
              );
            })}
          </KpiRow>

          <Panel
            title="Customer Trend"
            subtitle="New vs Returning customers over time"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <ComboBarLineChart
              data={customerTrend}
              xKey="dateLabel"
              barKey="newCustomers"
              barName="New"
              barColor={hrh.blue}
              lineKey="returningCustomers"
              lineName="Returning"
              lineColor={hrh.accent}
              valueFormatter={formatNum}
            />
          </Panel>

          <Panel title="Customers by Province" subtitle={data.meta?.provinceScopeNote} className="mb-4">
            {customersByProvince.length === 0 ? (
              <div className="text-[13px] py-6 text-center" style={{ color: hrh.muted }}>
                No customers with a matched province in this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
                <PhilippinesMap data={customersByProvince} onHoverChange={setHoveredProvince} />
                <div className="space-y-3">
                  {activeProvince && (
                    <div className="rounded-md p-3" style={{ background: hrh.blueSoft, border: `1px solid ${hrh.border}` }}>
                      <div className="text-[14px] font-bold leading-tight" style={{ color: hrh.ink }}>
                        {activeProvince.province}
                      </div>
                      <div className="font-display text-[30px] leading-none mt-1" style={{ color: hrh.blueText }}>
                        {formatNum(activeProvince.customers)}
                      </div>
                      <div className="text-[11px]" style={{ color: hrh.muted }}>
                        {activeProvince.customers === 1 ? "customer" : "customers"}
                      </div>
                      {activeProvince.cities.length > 0 && (
                        <div className="mt-2.5 pt-2 space-y-1" style={{ borderTop: `1px solid ${hrh.border}` }}>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] mb-1" style={{ color: hrh.blueText }}>
                            Top Cities
                          </div>
                          {activeProvince.cities.slice(0, 6).map((c) => (
                            <div key={c.city} className="flex items-center justify-between text-[12px]" style={{ color: hrh.ink2 }}>
                              <span className="truncate pr-2">{c.city}</span>
                              <span className="font-semibold shrink-0" style={{ color: hrh.ink }}>
                                {formatNum(c.customers)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                    {customersByProvince.map((p) => (
                      <div key={p.province} className="flex items-center justify-between text-[12px]" style={{ color: hrh.ink2 }}>
                        <span className="truncate pr-2">{p.province}</span>
                        <span className="font-semibold shrink-0" style={{ color: hrh.ink }}>
                          {formatNum(p.customers)}
                        </span>
                      </div>
                    ))}
                    <div
                      className="pt-2 mt-1.5 text-[11.5px] flex items-center justify-between"
                      style={{ borderTop: `1px solid ${hrh.border}`, color: hrh.muted }}
                    >
                      <span>Total mapped</span>
                      <span className="font-semibold" style={{ color: hrh.ink }}>
                        {formatNum(totalMappedCustomers)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Customer Demographics" subtitle="By gender, with each segment's top-selling category and subcategory" className="mb-4">
            <DataTable columns={DEMOGRAPHICS_COLUMNS} rows={demographicsRows} emptyLabel="No customers with a matched gender in this period." />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Purchase Frequency">
              <BarComparisonChart
                data={purchaseFrequencyRows}
                xKey="label"
                series={[{ key: "customers", name: "Customers", color: hrh.blue }]}
                valueFormatter={formatNum}
                xAxisLabel="Customers"
                horizontal
              />
            </Panel>
            <Panel title="Customer Spend Distribution">
              <BarComparisonChart
                data={spendDistributionRows}
                xKey="label"
                series={[{ key: "customers", name: "Customers", color: hrh.accent }]}
                valueFormatter={formatNum}
                xAxisLabel="Customers"
                horizontal
              />
            </Panel>
          </div>

          <Panel title="Top Customers" subtitle="Ranked by GMV for the selected period">
            <DataTable columns={TOP_CUSTOMER_COLUMNS} rows={data.topCustomers} paginate pageSize={10} />
          </Panel>
        </>
      )}
    </div>
  );
}
