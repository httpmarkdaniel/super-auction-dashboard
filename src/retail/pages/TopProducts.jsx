import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SubTabNav from "../components/SubTabNav";
import { LoadingState, ErrorState } from "../components/States";
import { retail } from "../theme";
import { formatPeso, formatNum } from "../format";

const SORT_TABS = [
  { key: "gmv", label: "By Sales Value" },
  { key: "units", label: "By Units Sold" },
];

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 340 },
  { key: "department", label: "Department" },
  { key: "category", label: "Category" },
  { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
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

// Real ClickHouse-backed Top Products — see api/_retail-top-products.js
// (dispatched via ?report=topProducts). Top 50 only, by gross sales value
// and by units sold separately (not a full distinct-product list — there
// are typically 10,000+ distinct products in even a 2-week/11-store
// window).
export default function TopProducts({ filters }) {
  const { store, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("gmv");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (st, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ store: st, ...p, report: "topProducts" });
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

  const periodLabel = data?.meta?.current ? effectivePeriodLabel(data.meta.current) : "";
  const rows = sortBy === "units" ? data?.topByUnits : data?.topByGmv;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Top Products
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Best-selling products by value and by volume
          </p>
        </div>
        {data?.meta?.current && (
          <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
            {periodLabel}
          </span>
        )}
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Top Products…" />}
      {error && <ErrorState label={`Couldn't load Top Products: ${error}`} />}

      {data && !error && (
        <>
          <KpiRow>
            <KpiCard label="Distinct Products Sold" value={formatNum(data.kpis.distinctProducts.value)} />
            {data.kpis.topProduct && <KpiCard label="Top Product (by Sales)" value={data.kpis.topProduct.product} sub={formatPeso(data.kpis.topProduct.gmv)} />}
          </KpiRow>

          <Panel title="Top 50 Products" className="mb-4">
            <SubTabNav tabs={SORT_TABS} value={sortBy} onChange={setSortBy} />
            <div className="mt-3">
              <DataTable columns={PRODUCT_COLUMNS} rows={rows} paginate pageSize={15} emptyLabel="No sales in this period." />
            </div>
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
