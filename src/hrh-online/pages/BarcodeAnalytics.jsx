import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import FunnelList from "../components/FunnelList";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 200 },
  { key: "category", label: "Category" },
  { key: "units", label: "Current Stock", render: (r) => formatNum(r.units) },
  { key: "stockValue", label: "Stock Value (SRP)", render: (r) => formatPeso(r.stockValue) },
  { key: "postedQty", label: "Posted Qty", render: (r) => formatNum(r.postedQty) },
  { key: "aging", label: "Age Bucket (days)" },
  { key: "status", label: "Status" },
];

const OLDEST_UNPOSTED_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 200 },
  { key: "category", label: "Category" },
  { key: "supplier", label: "Supplier", maxWidth: 160 },
  { key: "units", label: "Current Stock", render: (r) => formatNum(r.units) },
  { key: "stockValue", label: "Stock Value (SRP)", render: (r) => formatPeso(r.stockValue) },
  { key: "daysWaiting", label: "Days Waiting", render: (r) => (r.daysWaiting === null ? "—" : formatNum(r.daysWaiting)) },
];

// Real ClickHouse-backed Barcode Analytics (barcoding/posting workflow —
// formerly "Product & Merchandising") — see api/_hrh-barcode-analytics.js
// (dispatched from api/hrh-sales-analytics.js via ?report=barcodeAnalytics)
// for the queries. A live inventory/posting snapshot, not a sales-over-time
// report, so it deliberately does NOT take the dashboard's Date
// Range/Channel filter (xv3.mart_level_of_inventory has no transaction
// date or sales-channel dimension) — always "as of right now" for HRH
// Online.
export default function BarcodeAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hrh-sales-analytics?report=barcodeAnalytics`, { signal });
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
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const publishingFunnel = data?.publishingFunnel || [];
  const postingPerformanceByCategory = data?.postingPerformanceByCategory || [];
  const postingPerformanceBySupplier = data?.postingPerformanceBySupplier || [];
  const unpostedBacklogAging = data?.unpostedBacklogAging || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Barcode Analytics
      </div>

      {loading && !data && <LoadingState label="Loading Barcode Analytics…" />}
      {error && <ErrorState label={`Couldn't load Barcode Analytics: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.snapshotNote}
          </div>

          <KpiRow>
            <KpiCard label="Posting Rate" value={formatPct(data.kpis.postingRate.value)} sub="barcoded → posted" />
            <KpiCard label="Sold Rate" value={formatPct(data.kpis.soldRate.value)} sub="posted → sold" />
            <KpiCard label="Unposted Backlog" value={formatNum(data.kpis.unpostedBacklog.value)} />
            <KpiCard label="Unposted Backlog Value" value={formatPeso(data.kpis.unpostedBacklogValue.value)} sub="stocked, unposted items only" />
            <KpiCard label="Avg Days in Backlog" value={`${data.kpis.avgBacklogDays.value.toFixed(0)} days`} sub="unposted items only" />
          </KpiRow>

          <Panel title="Publishing Funnel" className="mb-4">
            <FunnelList stages={publishingFunnel} />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Posting Performance by Category">
              <BarComparisonChart data={postingPerformanceByCategory} series={[{ key: "posted", name: "Posted Items" }]} valueFormatter={formatNum} />
            </Panel>
            <Panel title="Posting Performance by Supplier">
              <BarComparisonChart data={postingPerformanceBySupplier} series={[{ key: "posted", name: "Posted Items", color: hrh.blue }]} valueFormatter={formatNum} />
            </Panel>
          </div>

          <Panel title="Unposted Backlog Aging" subtitle={data.meta?.avgBacklogDaysNote} className="mb-4">
            <BarComparisonChart data={unpostedBacklogAging} series={[{ key: "value", name: "Items", color: "#d99a3d" }]} valueFormatter={formatNum} />
          </Panel>

          <Panel title="Product Performance" subtitle="Highest stock value first" className="mb-4">
            <DataTable columns={PRODUCT_COLUMNS} rows={data.productTable} paginate pageSize={10} />
          </Panel>

          <Panel
            title="Oldest Unposted Items"
            subtitle="Unposted items with real stock on hand, oldest first — excludes zero-stock records with nothing to post"
          >
            <DataTable
              columns={OLDEST_UNPOSTED_COLUMNS}
              rows={data.oldestUnposted}
              paginate
              pageSize={10}
              emptyLabel="No unposted items with stock on hand right now."
            />
          </Panel>
        </>
      )}
    </div>
  );
}
