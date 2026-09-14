import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatNum, formatPct } from "../format";
import { bucketRows } from "../trendBucket";

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const mins = seconds / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

function formatDays(days) {
  if (days === null || days === undefined) return "—";
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)}d`;
}

const PICKER_COLUMNS = [
  { key: "picker", label: "Picker" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "items", label: "Items Picked", render: (r) => formatNum(r.items) },
  { key: "avgPickSeconds", label: "Avg Pick Time", render: (r) => formatDuration(r.avgPickSeconds) },
];

const QC_COLUMNS = [
  { key: "station", label: "QC Station" },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "avgQcSeconds", label: "Avg QC Time", render: (r) => formatDuration(r.avgQcSeconds) },
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

// Simple horizontal progressive-bar funnel — no new chart dependency, just
// width-proportional bars + conversion-from-previous-stage labels. Same
// component as Orders & Fulfillment's Warehouse Operations tab (kept as a
// local duplicate here, matching this file's existing duplication of
// PICKER_COLUMNS/QC_COLUMNS/formatDuration rather than a new shared module).
function LifecycleFunnelBars({ stages }) {
  const maxQty = Math.max(1, ...stages.map((s) => s.qty));
  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => (
        <div key={s.key}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-medium" style={{ color: hrh.ink }}>
              {s.label}
            </span>
            <span className="text-[12px]" style={{ color: hrh.ink2 }}>
              {formatNum(s.qty)}
              {i > 0 && s.conversionFromPrev !== null && s.conversionFromPrev !== undefined && (
                <span className="ml-2" style={{ color: hrh.muted }}>
                  ({formatPct(s.conversionFromPrev)} of {stages[i - 1].label})
                </span>
              )}
            </span>
          </div>
          <div className="h-6 rounded" style={{ background: hrh.bg }}>
            <div
              className="h-6 rounded flex items-center"
              style={{
                width: `${Math.max(2, (s.qty / maxQty) * 100)}%`,
                background: hrh.series[i % hrh.series.length],
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Real ClickHouse-backed Barcode Analytics — rebuilt on
// xv3.mart_order_fulfilment_journey (real warehouse-ops timestamps:
// picker, QC station, pick/pack/dispatch durations), replacing the old
// xv3.mart_level_of_inventory-based barcoded/posted/sold funnel. See
// api/_hrh-barcode-analytics.js for the full methodology note. Respects
// the page's Date Range filter (order_placed_at); the Channel filter is
// hidden — this table has no channel dimension at all.
//
// Restored as its own sidebar page (it briefly lived only inside Orders &
// Fulfillment's "Warehouse Operations" sub-tab) — kept alongside that tab
// intentionally rather than removing it, per explicit instruction, so the
// same data/report (?report=barcodeAnalytics) is now reachable from both
// places.
//
// Also renders the ASN -> Barcoded -> Posted -> Sold inventory lifecycle
// funnel (api/_hrh-barcode-analytics.js's computeLifecycleFunnel) — see
// that function's own comment for the validation this was built on
// (Put-away omitted as unreliable; "Posted" uses
// cms.mart_cms_posted_inventory_report, not cms_hmrph_posting_quantity).
export default function BarcodeAnalytics({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...p, report: "barcodeAnalytics" });
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
    load(params, controller.signal);
    return () => controller.abort();
  }, [params, ready, load]);

  const dailyVolume = bucketRows(data?.dailyVolume, trendBucket, ["orders", "picked", "packed", "shipped"]);

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Barcode Analytics
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Barcode Analytics…" />}
      {error && <ErrorState label={`Couldn't load Barcode Analytics: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <KpiRow>
            <KpiCard label="Orders Processed" value={formatNum(data.kpis.ordersProcessed.value)} />
            <KpiCard label="Avg Pick Time" value={formatDuration(data.kpis.avgPickTime.value)} sub="pick → QC" />
            <KpiCard label="Avg QC Time" value={formatDuration(data.kpis.avgQcTime.value)} sub="QC → waybill" />
            <KpiCard label="Avg Pick-to-Dispatch" value={formatDuration(data.kpis.avgPickToDispatch.value)} sub="picking start → dispatch" />
          </KpiRow>

          <Panel
            title="Daily Fulfillment Volume"
            subtitle="Orders placed / picked / packed / shipped, by order date"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <BarComparisonChart
              data={dailyVolume}
              xKey="dateLabel"
              valueFormatter={formatNum}
              series={[
                { key: "orders", name: "Orders Placed", color: hrh.series[0] },
                { key: "picked", name: "Picked", color: hrh.blue },
                { key: "packed", name: "Packed", color: hrh.series[2] },
                { key: "shipped", name: "Shipped", color: hrh.accent },
              ]}
            />
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Picker Performance" subtitle="Ranked by orders picked">
              <DataTable columns={PICKER_COLUMNS} rows={data.pickerPerformance} paginate pageSize={10} emptyLabel="No picking activity in this period." />
            </Panel>
            <Panel title="QC Station Throughput" subtitle="Ranked by orders processed">
              <DataTable columns={QC_COLUMNS} rows={data.qcThroughput} emptyLabel="No QC activity in this period." />
            </Panel>
          </div>

          <Panel title="Pick-to-Dispatch Time Distribution" subtitle="Picking start to dispatch finalized" className="mb-4">
            <BarComparisonChart
              data={data.pickToDispatchDistribution}
              xKey="label"
              valueFormatter={formatNum}
              series={[{ key: "value", name: "Orders", color: hrh.accent }]}
            />
          </Panel>

          {data.lifecycleFunnel && (
            <Panel
              title="Inventory Lifecycle Funnel"
              subtitle={`ASN → Barcoded → Posted → Sold — cohort received in this period, tracked to date (${data.lifecycleFunnel.cohort?.from} to ${data.lifecycleFunnel.cohort?.to})`}
              className="mb-4"
            >
              <LifecycleFunnelBars stages={data.lifecycleFunnel.stages} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: `1px solid ${hrh.border}` }}>
                <div>
                  <div className="text-[11px]" style={{ color: hrh.muted }}>
                    Received → Barcoded
                  </div>
                  <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                    {(() => {
                      const hrs = data.lifecycleFunnel.cycleTimeDays?.receivedToBarcodedHours;
                      return hrs === null || hrs === undefined ? "—" : formatDays(hrs / 24);
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: hrh.muted }}>
                    Barcoded → Posted
                  </div>
                  <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                    {formatDays(data.lifecycleFunnel.cycleTimeDays?.barcodedToPostedDays ?? null)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: hrh.muted }}>
                    Posted → First Sale
                  </div>
                  <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                    {formatDays(data.lifecycleFunnel.cycleTimeDays?.postedToFirstSaleDays ?? null)}
                  </div>
                </div>
              </div>

              {data.lifecycleFunnel.unmatched?.soldButNeverPosted > 0 && (
                <div className="text-[11px] mt-3" style={{ color: hrh.muted }}>
                  {formatNum(data.lifecycleFunnel.unmatched.soldButNeverPosted)} unit(s) in this cohort sold with no matching "Published" record — a real but unexplained gap between the sales data and the CMS listing data, not folded into the Posted count above.
                </div>
              )}

              {data.lifecycleFunnel.dataQuality?.length > 0 && (
                <ul className="list-disc pl-5 space-y-1.5 text-[11px] mt-3" style={{ color: hrh.ink2 }}>
                  {data.lifecycleFunnel.dataQuality.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

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
