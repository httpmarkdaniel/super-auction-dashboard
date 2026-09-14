import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ShareBar from "../components/ShareBar";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, BarComparisonChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum, formatPeso, formatCompactPeso } from "../format";

const METHOD_COLOR = { Pickup: hrh.blue, Delivery: hrh.series[2], Unknown: hrh.muted };

const METHOD_TABLE_COLUMNS = [
  { key: "method", label: "Method" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "sharePct", label: "Share", render: (r) => formatPct(r.sharePct) },
];

const CATEGORY_COLUMNS = [
  { key: "label", label: "Category" },
  { key: "value", label: "GMV", render: (r) => formatPeso(r.value) },
];

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

// Real ClickHouse-backed Pickup and Delivery — see
// api/_hrh-pickup-delivery.js (dispatched from api/hrh-sales-analytics.js
// via ?report=pickupDelivery) for the queries. Pickup vs Delivery is
// checkout_method on xv3.mart_xv3_order_report, joined to sales in
// xv3.mart_net_sales by order_no (direct match only) — orders that don't
// match (mostly TikTok/Shopee, which never populate that table) show as
// Unknown rather than a guess. xv3.mart_order_fulfilment_journey was
// investigated as an alternative source and rejected — its
// courier_service field is an imperfect proxy and only ~55% of its rows
// even link back to a real order.
export default function PickupAndDelivery({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, report: "pickupDelivery" });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
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
    load(channel, params, controller.signal);
    return () => controller.abort();
  }, [channel, params, ready, load]);

  const methodSegments = data?.methodSummary?.map((m) => ({ label: m.method, value: m.gmv, color: METHOD_COLOR[m.method] || hrh.muted })) || [];
  const trendRows = bucketRows(data?.trend, trendBucket, ["pickupGmv", "deliveryGmv", "pickupOrders", "deliveryOrders"]);

  const pickupPaymentSegments =
    data?.paymentTypeByMethod?.Pickup?.map((p, i) => ({ label: p.label, value: p.value, color: hrh.series[i % hrh.series.length] })) || [];
  const deliveryPaymentSegments =
    data?.paymentTypeByMethod?.Delivery?.map((p, i) => ({ label: p.label, value: p.value, color: hrh.series[i % hrh.series.length] })) || [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Pickup and Delivery
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Pickup and Delivery…" />}
      {error && <ErrorState label={`Couldn't load Pickup and Delivery: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <KpiRow>
            <KpiCard label="Pickup Orders" value={formatNum(data.kpis.pickupOrders.value)} />
            <KpiCard label="Delivery Orders" value={formatNum(data.kpis.deliveryOrders.value)} />
            <KpiCard label="Pickup GMV" value={formatPeso(data.kpis.pickupGmv.value)} />
            <KpiCard label="Delivery GMV" value={formatPeso(data.kpis.deliveryGmv.value)} />
            <KpiCard label="Pickup AOV" value={formatPeso(data.kpis.pickupAov.value)} />
            <KpiCard label="Delivery AOV" value={formatPeso(data.kpis.deliveryAov.value)} />
          </KpiRow>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Fulfillment Method Split" subtitle="GMV share — Pickup vs Delivery vs Unknown">
              <DonutChart segments={methodSegments} centerValue={formatCompactPeso(data.kpis.pickupGmv.value + data.kpis.deliveryGmv.value)} centerLabel="Pickup + Delivery GMV" />
              <div className="mt-3">
                <DataTable columns={METHOD_TABLE_COLUMNS} rows={data.methodSummary} emptyLabel="No sales in this period." />
              </div>
            </Panel>
            <Panel
              title="Pickup vs Delivery Trend"
              subtitle="GMV by transaction date"
              action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            >
              <BarComparisonChart
                data={trendRows}
                xKey="dateLabel"
                valueFormatter={formatCompactPeso}
                series={[
                  { key: "pickupGmv", name: "Pickup", color: METHOD_COLOR.Pickup },
                  { key: "deliveryGmv", name: "Delivery", color: METHOD_COLOR.Delivery },
                ]}
              />
            </Panel>
          </div>

          <Panel title="Payment Type by Fulfillment Method" subtitle="Share of GMV within each method" className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                  Within Pickup
                </div>
                <ShareBar segments={pickupPaymentSegments} />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                  Within Delivery
                </div>
                <ShareBar segments={deliveryPaymentSegments} />
              </div>
            </div>
          </Panel>

          <Panel title="Category Mix by Fulfillment Method" subtitle="Top categories by GMV within each method" className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                  Within Pickup
                </div>
                <DataTable columns={CATEGORY_COLUMNS} rows={data.categoryByMethod?.Pickup || []} emptyLabel="No pickup sales in this period." />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: hrh.ink2 }}>
                  Within Delivery
                </div>
                <DataTable columns={CATEGORY_COLUMNS} rows={data.categoryByMethod?.Delivery || []} emptyLabel="No delivery sales in this period." />
              </div>
            </div>
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
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
