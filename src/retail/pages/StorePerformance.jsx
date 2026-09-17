import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { BarComparisonChart, RateTrendComboChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { retail } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";
import { ALL_STORES_OPTION } from "../stores";

const TREND_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const STORE_DETAIL_COLUMNS = [
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

// Real ClickHouse-backed Store Performance — see
// api/_retail-store-performance.js (dispatched via ?report=storePerformance).
// Attainment by Store and Foot Traffic/Conversion by Store always compare
// ALL branches regardless of the page's Store filter (this page's whole
// purpose is cross-store comparison) — the Store Detail table and Sales vs
// Target trend below DO respect the filter, for a per-store drill-down.
export default function StorePerformance({ filters }) {
  const { store, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (st, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ store: st, ...p, report: "storePerformance" });
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
    load(store, params, controller.signal);
    return () => controller.abort();
  }, [store, params, ready, load]);

  const attainmentBars = (data?.attainmentByStore || []).map((r) => ({ label: r.store, value: r.attainmentPct }));
  const trafficBars = (data?.trafficConversionByStore || []).map((r) => ({ label: r.store, value: r.footTraffic }));
  const salesVsTargetPerf = bucketRows(data?.salesVsTarget, trendBucket, ["gmv", "target"]).map((r) => ({
    ...r,
    attainmentRate: r.target ? (r.gmv / r.target) * 100 : 0,
  }));
  const periodLabel = data?.meta?.current ? effectivePeriodLabel(data.meta.current) : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Store Performance
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Target attainment, foot traffic, and conversion rate across branches
          </p>
        </div>
        {data?.meta?.current && (
          <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
            {periodLabel}
          </span>
        )}
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Store Performance…" />}
      {error && <ErrorState label={`Couldn't load Store Performance: ${error}`} />}

      {data && !error && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Target Attainment by Store" subtitle="All 11 branches, current period — independent of the Store filter above">
              <BarComparisonChart
                data={attainmentBars}
                xKey="label"
                series={[{ key: "value", name: "Attainment", color: retail.accent }]}
                valueFormatter={(v) => formatPct(v)}
                horizontal
              />
            </Panel>
            <Panel title="Foot Traffic by Store" subtitle="9 core walk-in branches only — independent of the Store filter above">
              <BarComparisonChart
                data={trafficBars}
                xKey="label"
                series={[{ key: "value", name: "Foot Traffic", color: retail.blue }]}
                valueFormatter={formatNum}
                horizontal
              />
            </Panel>
          </div>

          <Panel
            title="Sales vs Target"
            subtitle={store === ALL_STORES_OPTION ? `All stores, ${periodLabel}` : `${store}, ${periodLabel}`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} options={TREND_OPTIONS} />}
            className="mb-4"
          >
            <RateTrendComboChart
              data={salesVsTargetPerf}
              bars={[
                { key: "gmv", name: "Sales", color: retail.blue },
                { key: "target", name: "Target", color: retail.muted },
              ]}
              rateKey="attainmentRate"
              rateName="Attainment Rate"
            />
          </Panel>

          <Panel title="Store Detail" subtitle={store === ALL_STORES_OPTION ? "All 11 branches" : store} className="mb-4">
            <DataTable columns={STORE_DETAIL_COLUMNS} rows={data.storeDetail} paginate pageSize={11} emptyLabel="No sales in this period." />
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
