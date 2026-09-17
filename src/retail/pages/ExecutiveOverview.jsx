import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { TrendChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";
import { ALL_STORES_OPTION } from "../stores";

function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
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
  basket: (
    <Icon>
      <path d="M5 10h14l-1.5 9.5a2 2 0 0 1-2 1.5H8.5a2 2 0 0 1-2-1.5Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </Icon>
  ),
  users: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  target: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  ),
};

const KPI_CARDS = [
  { key: "nmv", label: "Sales", formatter: formatPeso, icon: ICONS.peso },
  { key: "transactions", label: "Transactions", formatter: formatNum, icon: ICONS.cart },
  { key: "avgBasket", label: "Avg Basket Value", formatter: formatPeso, icon: ICONS.basket },
  { key: "footTraffic", label: "Foot Traffic", formatter: formatNum, icon: ICONS.users, sub: "9 core walk-in branches only" },
  { key: "conversionRate", label: "Conversion Rate", formatter: formatPct, icon: ICONS.percent, sub: "Transactions ÷ Foot Traffic" },
  { key: "targetAttainment", label: "Target Attainment", formatter: formatPct, icon: ICONS.target },
];

const COMPARE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// Sales Trend is a fixed trailing window (6 months back from today),
// independent of the page's Date Range filter — same pattern as
// src/hrh-online/pages/ExecutiveOverview.jsx's own Sales Trend. Day = last
// 30 days, Week = last 4 weeks, Month = last 6 months.
const TRAILING_BUCKET_COUNT = { day: 30, week: 4, month: 6 };

const LEADERBOARD_COLUMNS = [
  { key: "store", label: "Store" },
  { key: "gmv", label: "Sales (Gross)", render: (r) => formatPeso(r.gmv) },
  { key: "transactions", label: "Transactions", render: (r) => formatNum(r.transactions) },
  { key: "avgBasket", label: "Avg Basket", render: (r) => formatPeso(r.avgBasket) },
  { key: "target", label: "Target", render: (r) => (r.target > 0 ? formatPeso(r.target) : "—") },
  { key: "attainmentPct", label: "Attainment", render: (r) => (r.attainmentPct === null ? "—" : formatPct(r.attainmentPct)) },
  { key: "footTraffic", label: "Foot Traffic", render: (r) => (r.footTraffic === null ? "—" : formatNum(r.footTraffic)) },
  { key: "conversionRatePct", label: "Conversion Rate", render: (r) => (r.conversionRatePct === null ? "—" : formatPct(r.conversionRatePct)) },
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

// Real ClickHouse-backed Retail Executive Overview — see
// api/_retail-executive-overview.js (dispatched from api/retail-analytics.js
// via ?report=executiveOverview) for the query/reconciliation. 11 real
// branches (see src/retail/stores.js); Foot Traffic/Conversion Rate cover
// the 9 core walk-in branches only — see that file's own comment.
export default function ExecutiveOverview({ filters }) {
  const { store, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");
  const [compareTo, setCompareTo] = useState("week");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (st, p, cmp, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ store: st, ...p, compareTo: cmp, report: "executiveOverview" });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
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
    load(store, params, compareTo, controller.signal);
    return () => controller.abort();
  }, [store, params, compareTo, ready, load]);

  const salesTrendBuckets = bucketRows(data?.salesTrendTrailing, trendBucket, ["nmv", "transactions"]);
  const salesTrend = salesTrendBuckets.slice(-TRAILING_BUCKET_COUNT[trendBucket]);
  const periodLabel = data?.meta?.current ? effectivePeriodLabel(data.meta.current) : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Executive Overview
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Key performance metrics and trends across HMR's retail branches
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: retail.muted }}>
              Compare to
            </span>
            <TrendBucketPills value={compareTo} onChange={setCompareTo} options={COMPARE_OPTIONS} />
          </div>
          {data?.meta?.current && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
              {periodLabel}
              <span className="font-normal" style={{ color: retail.muted }}>
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
                  value={k.value === null || k.value === undefined ? "—" : c.formatter(k.value)}
                  delta={k.delta}
                  previousLabel={k.previous === null || k.previous === undefined ? undefined : c.formatter(k.previous)}
                  sub={c.key === "targetAttainment" && k.target > 0 ? `vs ${formatCompactPeso(k.target)} target` : c.sub}
                />
              );
            })}
          </KpiRow>

          <Panel
            title="Sales Trend"
            subtitle={`Last ${TRAILING_BUCKET_COUNT[trendBucket]} ${trendBucket === "day" ? "days" : trendBucket + "s"}, ending today — independent of the Date Range filter above.`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <TrendChart data={salesTrend} xKey="dateLabel" series={[{ key: "nmv", name: "Sales", color: retail.good }]} valueFormatter={formatCompactPeso} />
          </Panel>

          <Panel
            title="Store Leaderboard"
            subtitle={store === ALL_STORES_OPTION ? "All 11 branches, ranked by gross sales" : `${store} only`}
            className="mb-4"
          >
            <DataTable columns={LEADERBOARD_COLUMNS} rows={data.leaderboard} paginate pageSize={11} emptyLabel="No sales in this period." />
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: retail.ink2 }}>
                {data.dataQuality.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
