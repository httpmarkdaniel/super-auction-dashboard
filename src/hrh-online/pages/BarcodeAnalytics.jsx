import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import FunnelList from "../components/FunnelList";
import TrendBucketPills from "../components/TrendBucketPills";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";
import { bucketRows } from "../trendBucket";

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
  const [trendBucket, setTrendBucket] = useState("day");

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
  const dailyBarcodingVolume = bucketRows(data?.dailyBarcodingVolume, trendBucket, ["barcoded", "posted"]);

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
            <KpiCard label="Items Barcoded Today" value={formatNum(data.kpis.barcodedToday.value)} sub="HRH Online" />
          </KpiRow>

          <Panel title="Publishing Funnel" className="mb-4">
            <FunnelList stages={publishingFunnel} />
          </Panel>

          <Panel
            title="Daily Barcoding & Posting Volume"
            subtitle="Trailing 180 days, HRH Online — Posted is the posted-as-of-now subset of each day's barcoded items"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <BarComparisonChart
              data={dailyBarcodingVolume}
              series={[
                { key: "barcoded", name: "Items Barcoded", color: hrh.series[0] },
                { key: "posted", name: "Items Posted", color: hrh.series[1] },
              ]}
              xKey="dateLabel"
              valueFormatter={formatNum}
            />
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
