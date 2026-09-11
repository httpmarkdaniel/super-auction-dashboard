import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPeso, formatNum } from "../format";

const OLDEST_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 200 },
  { key: "category", label: "Category" },
  { key: "ageDays", label: "Age (days)", render: (r) => (r.ageDays === null ? "—" : formatNum(r.ageDays)) },
  { key: "units", label: "Current Stock", render: (r) => formatNum(r.units) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
  { key: "status", label: "Status" },
];

const TOP_ITEM_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 200, width: 200 },
  { key: "category", label: "Category", width: 130 },
  { key: "units", label: "Current Stock", render: (r) => formatNum(r.units) },
  { key: "value", label: "Value", render: (r) => formatPeso(r.value) },
];

const SORT_BY_OPTIONS = [
  { key: "value", label: "Value" },
  { key: "qty", label: "Qty" },
];

// Real ClickHouse-backed Inventory Aging — see api/_hrh-inventory-aging.js
// (dispatched from api/hrh-sales-analytics.js via ?report=inventoryAging)
// for the queries and the Slow-Moving/Non-Moving threshold definition. A
// live inventory snapshot, not a sales-over-time report, so it deliberately
// does NOT take the dashboard's Date Range/Channel filter (same locked
// contract as Barcode Analytics) — always "as of right now" for HRH Online.
export default function InventoryAging() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topItemsSortBy, setTopItemsSortBy] = useState("value");

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hrh-sales-analytics?report=inventoryAging`, { signal });
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

  const topSlowMovingItems = (topItemsSortBy === "qty" ? data?.topSlowMovingItemsByQty : data?.topSlowMovingItemsByValue) || [];
  const topNonMovingItems = (topItemsSortBy === "qty" ? data?.topNonMovingItemsByQty : data?.topNonMovingItemsByValue) || [];
  const agedByCategory = data?.agedByCategory || [];
  const agedBySupplier = data?.agedBySupplier || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Inventory Aging
      </div>

      {loading && !data && <LoadingState label="Loading Inventory Aging…" />}
      {error && <ErrorState label={`Couldn't load Inventory Aging: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.snapshotNote}
          </div>

          <KpiRow>
            <KpiCard label="Slow-Moving SKUs" value={formatNum(data.kpis.slowMovingSkus.value)} sub="61+ days, sold before, not in last 30 days" />
            <KpiCard label="Slow-Moving Value" value={formatPeso(data.kpis.slowMovingValue.value)} />
            <KpiCard label="Non-Moving SKUs" value={formatNum(data.kpis.nonMovingSkus.value)} sub="61+ days, never sold" />
            <KpiCard label="Non-Moving Value" value={formatPeso(data.kpis.nonMovingValue.value)} />
          </KpiRow>

          <div className="flex justify-end mb-2">
            <TrendBucketPills value={topItemsSortBy} onChange={setTopItemsSortBy} options={SORT_BY_OPTIONS} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title={`Top 10 Slow-Moving Items by ${topItemsSortBy === "qty" ? "Qty" : "Value"}`} subtitle="61+ days, sold before, not in last 30 days">
              <DataTable columns={TOP_ITEM_COLUMNS} rows={topSlowMovingItems} stickyColumns={2} emptyLabel="No slow-moving items right now." />
            </Panel>
            <Panel title={`Top 10 Non-Moving Items by ${topItemsSortBy === "qty" ? "Qty" : "Value"}`} subtitle="61+ days, never sold">
              <DataTable columns={TOP_ITEM_COLUMNS} rows={topNonMovingItems} stickyColumns={2} emptyLabel="No non-moving items right now." />
            </Panel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Aged Inventory Value by Category" subtitle="61+ days, real stock on hand">
              <BarComparisonChart data={agedByCategory} series={[{ key: "value", name: "Aged Value" }]} valueFormatter={formatPeso} horizontal />
            </Panel>
            <Panel title="Aged Inventory Value by Supplier" subtitle="61+ days, real stock on hand">
              <BarComparisonChart data={agedBySupplier} series={[{ key: "value", name: "Aged Value", color: hrh.accent }]} valueFormatter={formatPeso} horizontal />
            </Panel>
          </div>

          <Panel title="Oldest Inventory" subtitle="Real stock on hand, oldest first">
            <DataTable columns={OLDEST_COLUMNS} rows={data.oldestInventoryTable} paginate pageSize={10} emptyLabel="No aged inventory with stock on hand right now." />
          </Panel>
        </>
      )}
    </div>
  );
}
