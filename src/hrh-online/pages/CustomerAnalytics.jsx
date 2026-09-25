import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { BarComparisonChart, DonutChart } from "../components/Charts";
import PhilippinesMap from "../components/PhilippinesMap";
import { LoadingState, ErrorState } from "../components/States";
import { formatShortDateLabel, formatWeekRangeLabel, formatMonthLabel } from "../trendBucket";
import { hrh } from "../theme";
import { formatPeso, formatPct, formatNum } from "../format";

const TREND_LABEL_FORMATTER = { day: formatShortDateLabel, week: formatWeekRangeLabel, month: formatMonthLabel };

function safeDivide(a, b) {
  return b ? a / b : 0;
}

// Small hand-drawn stroke icons, same feather-style convention as
// Sidebar.jsx's nav icons / TrafficConversion.jsx's KPI icons — kept local
// to this page rather than imported cross-page.
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
};

// The 5 KPI scorecards, each paired with the formatter its value/previous
// need — same shape/order as data.kpis from api/_hrh-customer-analytics.js.
// `sparkline(dailyTrend)` derives a per-day array from the page's already-
// fetched daily customerTrend (new+returning counts only — no GMV at that
// grain, so salesPerCustomer has no sparkline function and gets icon only).
const KPI_CARDS = [
  { key: "uniqueCustomers", label: "Unique Customers", formatter: formatNum, icon: ICONS.users, sparkline: (t) => t.map((r) => r.newCustomers + r.returningCustomers) },
  { key: "newCustomers", label: "New Customers", formatter: formatNum, sub: "1 lifetime order", icon: ICONS.users, sparkline: (t) => t.map((r) => r.newCustomers) },
  {
    key: "returningCustomers",
    label: "Returning Customers",
    formatter: formatNum,
    sub: "2+ lifetime orders",
    icon: ICONS.users,
    sparkline: (t) => t.map((r) => r.returningCustomers),
  },
  {
    key: "repeatRate",
    label: "Repeat Rate",
    formatter: formatPct,
    icon: ICONS.percent,
    sparkline: (t) => t.map((r) => safeDivide(r.returningCustomers, r.newCustomers + r.returningCustomers) * 100),
  },
  { key: "salesPerCustomer", label: "Sales / Customer", formatter: formatPeso, icon: ICONS.peso },
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

// Same New (1 lifetime order) / Returning (2+) definition and colors as
// the KPI cards and Customer Trend chart above — see
// api/_hrh-customer-analytics.js's newCustomerDefinition note.
function CustomerTypePill({ type }) {
  const isNew = type === "New";
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: isNew ? hrh.blueSoft : hrh.accentSoft, color: isNew ? hrh.blueText : hrh.accentText }}
    >
      {type}
    </span>
  );
}

// Customer Type/Lifetime Orders/First Purchase/Last Buy are all LIFETIME
// at HRH Online (any of its 3 channels, not other HMR stores; not tied to
// the selected period — see api/_hrh-customer-analytics.js's
// isOneTimeBuyer note and the topCustomers comment above it). Only
// Orders/Units/GMV/AOV are scoped to the selected period. CHANGED
// 2026-09-17: First Purchase/Last Buy used to be period-scoped, which let
// a real Returning customer show First Purchase = Last Buy whenever their
// other order(s) fell outside the current filter — technically correct
// (Lifetime Orders showed 2+) but read as a mislabel. Now both dates are
// the customer's real earliest/most recent order at HRH Online, so a
// Returning customer will only ever show equal dates if that really is
// the only order they've ever placed within the window this data covers.
const TOP_CUSTOMER_COLUMNS = [
  { key: "customer", label: "Customer", maxWidth: 200 },
  { key: "customerType", label: "Customer Type", render: (r) => <CustomerTypePill type={r.customerType} /> },
  { key: "lifetimeOrders", label: "Lifetime Orders", render: (r) => formatNum(r.lifetimeOrders) },
  { key: "orders", label: "Orders (Period)", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units (Period)", render: (r) => formatNum(r.units) },
  { key: "gmv", label: "GMV (Period)", render: (r) => formatPeso(r.gmv) },
  { key: "aov", label: "AOV (Period)", render: (r) => formatPeso(r.aov) },
  { key: "firstPurchase", label: "First Purchase (Lifetime)" },
  { key: "lastBuy", label: "Last Buy (Lifetime)" },
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
// order at HRH Online (any of its 3 channels, not other HMR stores) as of
// today, Returning = 2+.
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
  const newVsReturning = data?.newVsReturning || [];
  const newSegment = newVsReturning.find((s) => s.segment === "New");
  const returningSegment = newVsReturning.find((s) => s.segment === "Returning");

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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
                  icon={c.icon}
                  value={c.formatter(k.value)}
                  delta={k.delta}
                  sub={c.sub}
                  previousLabel={c.formatter(k.previous)}
                  sparkline={c.sparkline ? c.sparkline(data.customerTrend?.day || []) : undefined}
                />
              );
            })}
          </KpiRow>

          {newSegment && returningSegment && (
            <Panel title="New vs Returning" subtitle="Share of unique customers and revenue, for the selected period" className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] mb-2" style={{ color: hrh.muted }}>
                    By Customers
                  </div>
                  <DonutChart
                    segments={[
                      { label: "New", value: newSegment.count, color: hrh.blue },
                      { label: "Returning", value: returningSegment.count, color: hrh.accent },
                    ]}
                    centerValue={formatNum(newSegment.count + returningSegment.count)}
                    centerLabel="Customers"
                  />
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] mb-2" style={{ color: hrh.muted }}>
                    By Revenue
                  </div>
                  <DonutChart
                    segments={[
                      { label: "New", value: newSegment.gmv, color: hrh.blue },
                      { label: "Returning", value: returningSegment.gmv, color: hrh.accent },
                    ]}
                    centerValue={formatPeso(newSegment.gmv + returningSegment.gmv)}
                    centerLabel="Revenue"
                  />
                </div>
              </div>
            </Panel>
          )}

          <Panel
            title="Customer Trend"
            subtitle="New vs Returning customers over time"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <BarComparisonChart
              data={customerTrend}
              xKey="dateLabel"
              series={[
                { key: "newCustomers", name: "New", color: hrh.blue },
                { key: "returningCustomers", name: "Returning", color: hrh.accent },
              ]}
              valueFormatter={formatNum}
            />
          </Panel>

          <Panel title="Customers by Province" subtitle={data.meta?.provinceScopeNote} className="mb-4">
            {customersByProvince.length === 0 ? (
              <div className="text-[13px] py-6 text-center" style={{ color: hrh.muted }}>
                No customers with a matched province in this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_220px] gap-4">
                <PhilippinesMap data={customersByProvince} onHoverChange={setHoveredProvince} />
                {byGender.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.muted }}>
                      By Gender
                    </div>
                    {byGender.map((g) => {
                      const share = totalGenderCustomers > 0 ? (g.customers / totalGenderCustomers) * 100 : 0;
                      return (
                        <div key={g.gender}>
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="font-semibold" style={{ color: hrh.ink }}>
                              {g.gender}
                            </span>
                            <span className="font-semibold" style={{ color: hrh.ink }}>
                              {formatNum(g.customers)}
                            </span>
                          </div>
                          <div className="text-[10.5px]" style={{ color: hrh.muted }}>
                            {formatPct(share)} · {formatPeso(g.gmv)}
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] mt-1.5" style={{ color: hrh.muted }}>
                            Top 3 Products
                          </div>
                          {(g.preferredProducts?.length ? g.preferredProducts : [{ name: "—" }]).map((p, i) => (
                            <div key={p.name + i} className="text-[11px] truncate" style={{ color: hrh.ink2 }} title={p.name || undefined}>
                              {i + 1}. {p.name || "—"}
                            </div>
                          ))}
                          <div className="text-[10.5px] truncate mt-1" style={{ color: hrh.muted }}>
                            {g.preferredCategories?.[0]?.name || "—"} › {g.preferredSubcategories?.[0]?.name || "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                    <div className="text-[11.5px] flex items-center justify-between" style={{ color: hrh.muted }}>
                      <span>No Address Provided</span>
                      <span className="font-semibold" style={{ color: hrh.ink }}>
                        {formatNum(data.noAddressCustomers)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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

          <Panel
            title="Top Customers"
            subtitle="Ranked by GMV for the selected period · Customer Type/Lifetime Orders/First Purchase/Last Buy are lifetime at HRH Online (any of its 3 channels); Orders/Units/GMV/AOV are this period only"
          >
            <DataTable columns={TOP_CUSTOMER_COLUMNS} rows={data.topCustomers} paginate pageSize={10} />
          </Panel>
        </>
      )}
    </div>
  );
}
