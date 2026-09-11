import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import FunnelList from "../components/FunnelList";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPct, formatNum } from "../format";

const QUEUE_COLUMNS = [
  { key: "order", label: "Order" },
  { key: "ageHours", label: "Age (hours)", render: (r) => (r.ageHours === null ? "—" : formatNum(r.ageHours)) },
  { key: "shortage", label: "Shortage (units)", render: (r) => formatNum(r.shortage) },
  { key: "status", label: "Status" },
];

// Real ClickHouse-backed Orders & Fulfillment — see
// api/_hrh-orders-fulfillment.js (dispatched from api/hrh-sales-analytics.js
// via ?report=ordersFulfillment) for the queries. Sourced from two real
// operational tables (xv3.mart_xv3_order_pickability for pick status/stock
// shortage, xv3.mart_order_fulfilment_journey for pick->pack->ship timing),
// both live snapshots — same locked contract as Barcode Analytics/
// Inventory Aging/Markdown Analytics: ignores the Date Range/Channel filter,
// always "as of right now" for HRH Online.
export default function OrdersFulfillment() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hrh-sales-analytics?report=ordersFulfillment`, { signal });
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

  const funnel = data?.funnel || [];
  const performanceByCourier = data?.performanceByCourier || [];
  const pickDispatchTimeDistribution = data?.pickDispatchTimeDistribution || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Orders &amp; Fulfillment
      </div>

      {loading && !data && <LoadingState label="Loading Orders & Fulfillment…" />}
      {error && <ErrorState label={`Couldn't load Orders & Fulfillment: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.snapshotNote}
          </div>

          <KpiRow>
            <KpiCard label="Orders Requiring Pick" value={formatNum(data.kpis.ordersRequiringPick.value)} sub="active orders" />
            <KpiCard label="Pick Rate" value={formatPct(data.kpis.pickRate.value)} />
            <KpiCard label="Pending Picks" value={formatNum(data.kpis.pendingPicks.value)} />
            <KpiCard label="Avg Pick Time" value={`${data.kpis.avgPickTime.value} ${data.kpis.avgPickTime.sub}`} />
            <KpiCard label="Fulfillment Rate" value={formatPct(data.kpis.fulfillmentRate.value)} sub="shipped / all orders" />
          </KpiRow>

          <Panel title="Order Fulfillment Funnel" subtitle={data.meta?.pendingNote} className="mb-4">
            <FunnelList stages={funnel} />
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Pending Pick Queue" subtitle="Active orders, oldest first">
              <DataTable columns={QUEUE_COLUMNS} rows={data.pendingPickQueue} paginate pageSize={10} emptyLabel="No active orders waiting to be picked." />
            </Panel>
            <Panel title="Fulfillment Performance by Courier" subtitle="Avg total fulfillment time (hours)">
              <BarComparisonChart data={performanceByCourier} series={[{ key: "avgHours", name: "Avg Hours" }]} valueFormatter={formatNum} horizontal />
            </Panel>
          </div>

          <Panel title="Pick / Dispatch Time Distribution" subtitle="Picking start to dispatch finalized">
            <BarComparisonChart data={pickDispatchTimeDistribution} series={[{ key: "value", name: "Orders", color: hrh.accent }]} valueFormatter={formatNum} />
          </Panel>
        </>
      )}
    </div>
  );
}
