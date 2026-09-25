import { useEffect, useState } from "react";
import Panel from "../../retail/components/Panel";
import DataTable from "../../retail/components/DataTable";
import DateRangePicker from "../../retail/components/DateRangePicker";
import { KpiCard, KpiRow } from "../../retail/components/Kpi";
import { LoadingState, ErrorState } from "../../retail/components/States";
import { DonutChart, BarComparisonChart } from "../../retail/components/Charts";
import { resolveDateRange, resolveComparisonRange, comparisonLabel } from "../../retail/dateRange";
import { retail } from "../../retail/theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../../retail/format";
import { fetchCa, pctChange, formatDate, formatMonth } from "../api";
import { SEGMENTS } from "../segments";

const STORE_COLUMNS = [
  { key: "store", label: "Store" },
  { key: "activeCustomers", label: "Active Customers", render: (r) => formatNum(r.activeCustomers) },
  { key: "newToStore", label: "New to Store", render: (r) => formatNum(r.newToStore) },
  { key: "sales", label: "Registered Sales", render: (r) => formatPeso(r.sales) },
  { key: "avgSpend", label: "Avg Spend / Customer", render: (r) => formatPeso(r.avgSpend) },
  { key: "visitsPerCustomer", label: "Visits / Customer", render: (r) => r.visitsPerCustomer.toFixed(2) },
];

const TOP_COLUMNS = [
  { key: "customerName", label: "Customer" },
  { key: "sales", label: "Sales", render: (r) => formatPeso(r.sales) },
  { key: "invoices", label: "Visits", render: (r) => formatNum(r.invoices) },
  { key: "topStore", label: "Main Store" },
  { key: "lastVisit", label: "Last Visit", render: (r) => formatDate(r.lastVisit) },
];

const selectStyle = { background: retail.bg, color: retail.ink2, border: `1px solid ${retail.border}` };

// Date-ranged customer KPIs vs the comparison period, plus the as-of-today
// lifecycle snapshot and a fixed trailing-12-month trend — see
// api/_customer-analytics.js handleCaOverview.
export default function Overview({ stores, openExplorer }) {
  const [dateRange, setDateRange] = useState("mtd");
  const [store, setStore] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const cur = resolveDateRange(dateRange);
    const cmp = resolveComparisonRange(dateRange);
    setLoading(true);
    setError(null);
    fetchCa("caOverview", { from: cur.from, to: cur.to, cfrom: cmp.from, cto: cmp.to, store }, controller.signal)
      .then(setData)
      .catch((err) => err.name !== "AbortError" && setError(err.message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [dateRange, store]);

  const cmpText = comparisonLabel(dateRange);
  const c = data?.current;
  const p = data?.previous;
  const scope = store || "any HMR store";

  const trendData = (data?.trend || []).map((m) => ({ label: formatMonth(m.month), New: m.newCustomers, Returning: m.returningCustomers }));
  const snapshotTotal = data ? SEGMENTS.reduce((s, seg) => s + data.snapshot[seg.key], 0) : 0;
  const recentStores = stores.filter((s) => s.lastSale >= `${new Date().getFullYear() - 1}-01-01`);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Overview
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <select value={store} onChange={(e) => setStore(e.target.value)} className="text-[13px] font-semibold px-3 h-10 rounded-xl outline-none" style={selectStyle}>
            <option value="">All Stores</option>
            {recentStores.map((s) => (
              <option key={s.store} value={s.store}>
                {s.store}
              </option>
            ))}
          </select>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {loading && !data && <LoadingState label="Loading Customer Analytics…" />}
      {error && <ErrorState label={`Couldn't load Customer Analytics: ${error}`} />}

      {data && !error && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <KpiRow>
            <KpiCard label="Active Customers" value={formatNum(c.activeCustomers)} delta={pctChange(c.activeCustomers, p.activeCustomers)} sub={cmpText}
              methodology={`Registered (named) customers with at least one non-voided purchase at ${scope} in the period. Walk-in / unnamed sales aren't counted.`} />
            <KpiCard label="New Customers" value={formatNum(c.newCustomers)} delta={pctChange(c.newCustomers, p.newCustomers)} sub={cmpText}
              methodology={`Active customers whose first-ever purchase at ${scope} falls inside the period.`} />
            <KpiCard label="Returning Customers" value={formatNum(c.returningCustomers)} delta={pctChange(c.returningCustomers, p.returningCustomers)} sub={cmpText}
              methodology="Active customers who had bought before the period started (Active − New)." />
            <KpiCard label="Registered Sales" value={formatCompactPeso(c.namedSales)} delta={pctChange(c.namedSales, p.namedSales)} sub={cmpText}
              methodology="Sum of invoice_item_sold_amount on non-voided lines from registered customers." />
            <KpiCard label="Registered Share" value={formatPct(c.namedSalesSharePct)} sub={p.namedSalesSharePct !== null ? `${formatPct(p.namedSalesSharePct)} previous` : cmpText}
              methodology="Registered-customer sales as a share of ALL sales (incl. walk-in / unnamed) in the same scope and period." />
            <KpiCard label="Avg Spend / Customer" value={c.avgSpendPerCustomer !== null ? formatPeso(c.avgSpendPerCustomer) : "—"} delta={pctChange(c.avgSpendPerCustomer, p.avgSpendPerCustomer)} sub={cmpText}
              methodology="Registered Sales ÷ Active Customers." />
            <KpiCard label="Visits / Customer" value={c.visitsPerCustomer !== null ? c.visitsPerCustomer.toFixed(2) : "—"} delta={pctChange(c.visitsPerCustomer, p.visitsPerCustomer)} sub={cmpText}
              methodology="Distinct invoices ÷ Active Customers." />
          </KpiRow>

          <Panel title="Active Customers — Last 12 Months" subtitle="New = first purchase that month; Returning = bought before. Fixed trailing window, not affected by the date range." className="mb-4">
            <BarComparisonChart
              data={trendData}
              xKey="label"
              series={[
                { key: "Returning", name: "Returning", color: retail.navy3 },
                { key: "New", name: "New", color: retail.good },
              ]}
              valueFormatter={(v) => formatNum(v)}
              stacked
            />
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Customer Base by Segment" subtitle={`Every registered customer who has ever bought at ${scope}, as of today`}>
              <DonutChart
                segments={SEGMENTS.map((s) => ({ label: `${s.key} · ${formatNum(data.snapshot[s.key])}`, value: data.snapshot[s.key], color: s.color }))}
                centerValue={formatNum(snapshotTotal)}
                centerLabel="customers"
                size={190}
              />
              <div className="flex flex-wrap gap-2 mt-4">
                {SEGMENTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => openExplorer({ stores: store ? [store] : [], segment: s.key })}
                    className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ background: retail.bg, color: retail.blueDark, border: `1px solid ${retail.border}` }}
                  >
                    View {s.key} ›
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Time Since Last Purchase" subtitle="Same customer base, grouped by days since their last visit — the win-back pool">
              <DataTable
                columns={[
                  { key: "band", label: "Last Purchase" },
                  { key: "customers", label: "Customers", render: (r) => formatNum(r.customers) },
                  { key: "share", label: "Share", render: (r) => formatPct(snapshotTotal ? (r.customers / snapshotTotal) * 100 : 0) },
                  { key: "sales", label: "Lifetime Sales", render: (r) => formatCompactPeso(r.sales) },
                ]}
                rows={data.bands}
              />
            </Panel>
          </div>

          <Panel title="Customers by Store" subtitle={`${resolveDateRange(dateRange).label}. New to Store = first purchase at that store falls in the period.`} className="mb-4">
            <DataTable columns={STORE_COLUMNS} rows={data.stores} paginate pageSize={15} emptyLabel="No registered-customer sales in this period." />
          </Panel>

          <Panel title="Top 10 Customers" subtitle={resolveDateRange(dateRange).label}>
            <DataTable columns={TOP_COLUMNS} rows={data.topCustomers} emptyLabel="No registered customers in this period." />
          </Panel>
        </div>
      )}
    </div>
  );
}
