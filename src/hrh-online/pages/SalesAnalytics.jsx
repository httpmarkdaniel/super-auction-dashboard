import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ShareBar from "../components/ShareBar";
import { LoadingState, ErrorState } from "../components/States";
import { formatPeso, formatPct, formatNum } from "../format";

const CHANNEL_TABLE_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "GMV", render: (r) => formatPeso(r.gmv) },
  { key: "nmv", label: "NMV", render: (r) => formatPeso(r.nmv) },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "units", label: "Units", render: (r) => formatNum(r.units) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "cancellationRate", label: "Cancellation Rate", render: (r) => formatPct(r.cancellationRate) },
  { key: "returnRate", label: "Return Rate", render: (r) => formatPct(r.returnRate) },
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

// Real ClickHouse-backed Sales Analytics — see api/hrh-sales-analytics.js
// for the queries (same locked GMV/NMV/Orders/Units/AOV contract as Product
// Analytics/Executive Overview). Channel Comparison always shows all 3
// channels (it IS the channel breakdown, so the filter would just hide
// rows); the 4 contribution/breakdown panels below it respect the page's
// Channel + Date Range filter like everywhere else on the dashboard.
export default function SalesAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ready = isDateRangeReady(dateRange);

  const load = useCallback(async (ch, params, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...params });
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
    load(channel, dateRangeParams(dateRange), controller.signal);
    return () => controller.abort();
  }, [channel, dateRange, ready, load]);

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Sales Analytics
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Sales Analytics…" />}
      {error && <ErrorState label={`Couldn't load Sales Analytics: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Channel Comparison" className="mb-4">
            <DataTable columns={CHANNEL_TABLE_COLUMNS} rows={data.channelComparison} />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Panel title="Category Contribution" subtitle="GMV share for the selected period">
              <ShareBar segments={data.categoryContribution} />
            </Panel>
            <Panel title="Department Contribution" subtitle="GMV share for the selected period">
              <ShareBar segments={data.departmentContribution} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="Payment Type" subtitle={data.meta?.checkoutCoverageNote || "Orders share by payment method"}>
              <ShareBar segments={data.paymentType} />
            </Panel>
            <Panel title="Checkout / Fulfillment Method" subtitle={data.meta?.checkoutCoverageNote || "Orders share by fulfillment method"}>
              <ShareBar segments={data.fulfillmentMethod} />
              <p className="text-[11px] mt-2.5" style={{ color: "#94a0ae" }}>
                A separate dimension from Payment Type above — Pickup is fulfillment behavior, not a payment method.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
