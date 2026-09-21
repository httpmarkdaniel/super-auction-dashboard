import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, BarComparisonChart } from "../components/Charts";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum } from "../format";

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

const SEG_COLUMNS = [
  { key: "segment", label: "Segment" },
  { key: "revenue", label: "Revenue", render: (r) => `${formatPeso(r.revenue)} (${r.sharePct?.toFixed(1) ?? "—"}%)` },
  { key: "customers", label: "Customers", render: (r) => formatNum(r.customers) },
];

const STORE_SEG_COLUMNS = [
  { key: "store", label: "Store" },
  { key: "New", label: "New", render: (r) => formatNum(r.New) },
  { key: "Retained", label: "Retained", render: (r) => formatNum(r.Retained) },
  { key: "Reactivated", label: "Reactivated", render: (r) => formatNum(r.Reactivated) },
  { key: "Unregistered", label: "Unregistered/Walk-In", render: (r) => formatNum(r.Unregistered) },
];

const TOP_CUST_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "spend", label: "Spend", render: (r) => formatPeso(r.spend) },
  { key: "store", label: "Store" },
  { key: "type", label: "New/Returning" },
];

const SEG_COLOR = { New: retail.good, Retained: retail.navy, Reactivated: retail.accent };

// Real ClickHouse-backed Customer (3R) — see
// api/_retail-customer-segments.js (dispatched via
// ?report=customerSegments). New/Retained/Reactivated only covers
// invoices with a real customer name — see that file's own comment for
// why totals don't match Sales Overview's revenue total.
export default function CustomerSegments({ filters }) {
  const { segment, dateRange, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (seg, dr, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...dateRangeParams(dr), ...(st ? { store: st } : {}), report: "customerSegments" });
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
    const controller = new AbortController();
    load(segment, dateRange, store, controller.signal);
    return () => controller.abort();
  }, [segment, dateRange, store, load]);

  const donutSegments = data
    ? ["New", "Retained", "Reactivated"].map((k) => ({ label: k, value: data.segments[k].revenue, color: SEG_COLOR[k] }))
    : [];
  const tableRows = data ? ["New", "Retained", "Reactivated"].map((k) => ({ segment: k, ...data.segments[k] })) : [];
  const trendSeries = ["New", "Retained", "Reactivated"].map((k) => ({ key: k, name: k, color: SEG_COLOR[k] }));
  const trendData = (data?.weeklyTrend || []).map((w) => ({ label: `${w.weekStart.slice(5)}`, New: w.New, Retained: w.Retained, Reactivated: w.Reactivated }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Customer (3R)
        </div>
      </div>

      {loading && !data && <LoadingState label="Loading Customer Segments…" />}
      {error && <ErrorState label={`Couldn't load Customer Segments: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Customer Segments — Revenue Contribution" className="mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <DonutChart segments={donutSegments} centerValue={formatCompactPeso(data.namedTotalRevenue)} centerLabel="Named" size={200} />
              <div>
                <DataTable columns={SEG_COLUMNS} rows={tableRows} emptyLabel="No named-customer sales in this period." />
                <div className="mt-3 p-2.5 rounded-md text-[12px]" style={{ background: "#fdf6e3", color: retail.ink2 }}>
                  Unregistered / Walk-In (no name): {formatNum(data.segments.Unregistered.transactions)} transactions, {formatPeso(data.segments.Unregistered.revenue)} — not tagged New/
                  Retained/Reactivated (no name to classify), so this revenue is excluded from the donut/table above but still counted in Sales Overview's total.
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Customer Segment Revenue — Last 4 Weeks" className="mb-4">
            <BarComparisonChart data={trendData} xKey="label" series={trendSeries} valueFormatter={formatCompactPeso} stacked />
          </Panel>

          <Panel title="Customer Segments by Store — Counts" className="mb-4">
            <DataTable columns={STORE_SEG_COLUMNS} rows={data.storeSegTable} paginate pageSize={12} emptyLabel="No data for this period." />
          </Panel>

          <Panel title="Top 10 Customers">
            <DataTable columns={TOP_CUST_COLUMNS} rows={data.topCustomers} emptyLabel="No named customers in this period." />
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes" className="mt-4">
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
