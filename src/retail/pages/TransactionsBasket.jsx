import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { TrendChart, BarComparisonChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { retail } from "../theme";
import { formatPeso, formatNum } from "../format";

const KPI_CARDS = [
  { key: "transactions", label: "Transactions", formatter: formatNum },
  { key: "avgItemsPerBasket", label: "Avg Items / Basket", formatter: (v) => v.toFixed(1) },
  { key: "avgBasketValue", label: "Avg Basket Value", formatter: formatPeso },
  { key: "invoiceCount", label: "Invoices (Basket Source)", formatter: formatNum },
];

const TREND_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const STORE_COLUMNS = [
  { key: "store", label: "Store" },
  { key: "transactions", label: "Transactions", render: (r) => formatNum(r.transactions) },
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

// Real ClickHouse-backed Transactions & Basket — see
// api/_retail-transactions-basket.js (dispatched via
// ?report=transactionsBasket). Basket size (items/invoice, avg basket
// value) comes from xv3.mart_invoice_items, a different population than
// the Transactions KPI (xv3.mart_net_sales) — see that file's own comment;
// the two invoice counts can differ slightly. Transactions by Store always
// shows all 11 branches regardless of the Store filter.
export default function TransactionsBasket({ filters }) {
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
      const qs = new URLSearchParams({ store: st, ...p, compareTo: cmp, report: "transactionsBasket" });
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

  const transactionsTrend = bucketRows(data?.transactionsTrend, trendBucket, ["transactions"]);
  const distributionBars = (data?.basketDistribution || []).map((r) => ({ label: r.label, value: r.count }));
  const periodLabel = data?.meta?.current ? effectivePeriodLabel(data.meta.current) : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Transactions &amp; Basket
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Transaction volume and basket size across branches
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: retail.muted }}>
              Compare to
            </span>
            <TrendBucketPills value={compareTo} onChange={setCompareTo} options={TREND_OPTIONS} />
          </div>
          {data?.meta?.current && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
              {periodLabel}
            </span>
          )}
        </div>
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Transactions & Basket…" />}
      {error && <ErrorState label={`Couldn't load Transactions & Basket: ${error}`} />}

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
            title="Transactions Trend"
            subtitle={`${periodLabel} — by ${trendBucket}`}
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} options={TREND_OPTIONS} />}
            className="mb-4"
          >
            <TrendChart data={transactionsTrend} xKey="dateLabel" series={[{ key: "transactions", name: "Transactions", color: retail.blue }]} valueFormatter={formatNum} />
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Basket Size Distribution" subtitle="Transactions grouped by item count, current period">
              <BarComparisonChart data={distributionBars} xKey="label" series={[{ key: "value", name: "Transactions", color: retail.accent }]} valueFormatter={formatNum} />
            </Panel>
            <Panel title="Transactions by Store" subtitle="All 11 branches, current period — independent of the Store filter above">
              <DataTable columns={STORE_COLUMNS} rows={data.transactionsByStore} paginate pageSize={11} emptyLabel="No transactions in this period." />
            </Panel>
          </div>

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
