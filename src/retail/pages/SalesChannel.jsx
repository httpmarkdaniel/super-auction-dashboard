import { useCallback, useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart } from "../components/Charts";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

const CHANNEL_COLUMNS = [
  { key: "channel", label: "Channel" },
  { key: "gmv", label: "Value", render: (r) => formatPeso(r.gmv) },
  { key: "sharePct", label: "% of Total", render: (r) => formatPct(r.sharePct, 2) },
  { key: "transactions", label: "Transactions", render: (r) => formatNum(r.transactions) },
  { key: "abs", label: "ABS (Avg Basket Size)", render: (r) => formatPeso(r.abs) },
];

// Real ClickHouse-backed Sales Channel — see api/_retail-sales-channel.js
// (dispatched via ?report=salesChannel). Channel comes directly from
// xv3.mart_net_sales' own sales_channel field.
export default function SalesChannel({ filters }) {
  const { segment, dateRange, store } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (seg, dr, st, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, ...dateRangeParams(dr), ...(st ? { store: st } : {}), report: "salesChannel" });
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

  const segments = (data?.channels || []).map((c, i) => ({ label: c.channel, value: c.gmv, color: retail.series[i % retail.series.length] }));

  return (
    <div>

      {loading && !data && <LoadingState label="Loading Sales Channel…" />}
      {error && <ErrorState label={`Couldn't load Sales Channel: ${error}`} />}

      {data && !error && (
        <>
          <Panel className="mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <DonutChart segments={segments} centerValue={formatCompactPeso(data.totalGmv)} centerLabel="Total" size={200} />
              <DataTable columns={CHANNEL_COLUMNS} rows={data.channels} emptyLabel="No sales in this period." />
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
