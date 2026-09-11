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
  { key: "aging", label: "Age (days)" },
  { key: "status", label: "Status" },
];

// Real ClickHouse-backed Product & Merchandising — see
// api/_hrh-merchandising.js (dispatched from api/hrh-sales-analytics.js via
// ?report=merchandising) for the queries. A live inventory/posting
// snapshot, not a sales-over-time report, so it deliberately does NOT take
// the dashboard's Date Range/Channel filter (xv3.mart_level_of_inventory
// has no transaction date or sales-channel dimension) — always "as of
// right now" for HRH Online.
export default function ProductMerchandising() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hrh-sales-analytics?report=merchandising`, { signal });
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
  const unpostedBacklogAging = data?.unpostedBacklogAging || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Product &amp; Merchandising
      </div>

      {loading && !data && <LoadingState label="Loading Product & Merchandising…" />}
      {error && <ErrorState label={`Couldn't load Product & Merchandising: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.snapshotNote}
          </div>

          <KpiRow>
            <KpiCard label="Barcoded Items" value={formatNum(data.kpis.barcodedItems.value)} />
            <KpiCard label="Posted Items" value={formatNum(data.kpis.postedItems.value)} />
            <KpiCard label="Posting Rate" value={formatPct(data.kpis.postingRate.value)} />
            <KpiCard label="Unposted Backlog" value={formatNum(data.kpis.unpostedBacklog.value)} />
            <KpiCard label="Avg Days in Backlog" value={`${data.kpis.avgBacklogDays.value.toFixed(0)} days`} sub="unposted items only" />
          </KpiRow>

          <Panel title="Publishing Funnel" className="mb-4">
            <FunnelList stages={publishingFunnel} />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Posting Performance by Category">
              <BarComparisonChart data={postingPerformanceByCategory} series={[{ key: "posted", name: "Posted Items" }]} valueFormatter={formatNum} />
            </Panel>
            <Panel title="Unposted Backlog Aging" subtitle={data.meta?.avgBacklogDaysNote}>
              <BarComparisonChart data={unpostedBacklogAging} series={[{ key: "value", name: "Items", color: "#d99a3d" }]} valueFormatter={formatNum} />
            </Panel>
          </div>

          <Panel title="Product Performance" subtitle="Highest stock value first">
            <DataTable columns={PRODUCT_COLUMNS} rows={data.productTable} paginate pageSize={10} />
          </Panel>
        </>
      )}
    </div>
  );
}
