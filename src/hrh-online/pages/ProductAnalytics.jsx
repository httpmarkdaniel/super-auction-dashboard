import { useEffect, useMemo, useState, useCallback } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SeverityBadge from "../components/SeverityBadge";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";

const BUCKET_GRANULARITY_OPTIONS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const TREND_GLYPH = { up: "▲", down: "▼", flat: "▬" };
const TREND_COLOR = { up: hrh.good, down: hrh.bad, flat: hrh.muted };
// Color alone (a red/green arrow) isn't accessible or self-explanatory on
// its own — spell the trend out too.
const TREND_LABEL = { up: "Increasing", down: "Declining", flat: "Steady" };
// OUT OF STOCK is the "explained, nothing to do" case (green). The two HAS
// STOCK variants both need a human to look at it (sold out despite stock
// on hand) — "warning" (orange), not "good". UNKNOWN STOCK means the
// inventory match itself is missing — flagged as "critical" so a data gap
// never quietly reads as resolved.
const STATUS_SEVERITY = {
  "OUT OF STOCK": "good",
  "HAS STOCK": "warning",
  "HAS STOCK / NOT POSTED": "warning",
  "UNKNOWN STOCK": "critical",
};

function changeCell(pct) {
  if (pct === null || pct === undefined) return "—";
  const color = pct > 0 ? hrh.good : pct < 0 ? hrh.bad : hrh.muted;
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "▬";
  return (
    <span className="font-semibold" style={{ color }}>
      {arrow} {formatPct(Math.abs(pct))}
    </span>
  );
}

function trendCell(trend) {
  return (
    <span className="font-semibold whitespace-nowrap" style={{ color: TREND_COLOR[trend] || hrh.muted }}>
      {TREND_GLYPH[trend] || "—"} {TREND_LABEL[trend] || "—"}
    </span>
  );
}

// All 4 buckets shown as their own column (not just a prior/current pair),
// each header naming its actual date range — e.g. "Wk1 (Aug 14–20)" — so
// the qualifying window is visible right in the table, not just the
// subtitle. `periodBuckets` (data.meta.periodBuckets) has the same
// {wk1,wk2,wk3,wk4} shape regardless of week/month granularity.
function repeatSellerColumns(granularity, periodBuckets) {
  const prefix = granularity === "month" ? "Mo" : "Wk";
  const bucketColumns = ["wk1", "wk2", "wk3", "wk4"].map((key, i) => ({
    key: `${key}Sales`,
    label: periodBuckets?.[key] ? `${prefix}${i + 1} (${formatCompactRange(periodBuckets[key])})` : `${prefix}${i + 1}`,
    render: (r) => formatPeso(r[`${key}Sales`]),
  }));
  return [
    { key: "sku", label: "SKU" },
    { key: "product", label: "Product", maxWidth: 130 },
    ...bucketColumns,
    { key: "units", label: "Units", render: (r) => formatNum(r.units) },
    { key: "trend", label: "Trend", render: (r) => trendCell(r.trend) },
    { key: "currentStockQty", label: "Current Stock", render: (r) => (r.currentStockQty === null ? "—" : formatNum(r.currentStockQty)) },
    { key: "currentStockValue", label: "Stock Value (SRP)", render: (r) => (r.currentStockValue === null ? "—" : formatPeso(r.currentStockValue)) },
  ];
}

const TOP_PRODUCT_COLUMNS = [
  { key: "sku", label: "SKU" },
  { key: "product", label: "Product", maxWidth: 130 },
  { key: "currentGmv", label: "Current GMV", render: (r) => formatPeso(r.currentGmv) },
  { key: "currentUnits", label: "Current Units", render: (r) => formatNum(r.currentUnits) },
  { key: "previousGmv", label: "Previous GMV", render: (r) => formatPeso(r.previousGmv) },
  { key: "previousUnits", label: "Previous Units", render: (r) => formatNum(r.previousUnits) },
  { key: "gmvChangePct", label: "Change / Note", render: (r) => changeCell(r.gmvChangePct) },
  { key: "currentStockQty", label: "Current Stock", render: (r) => (r.currentStockQty === null ? "—" : formatNum(r.currentStockQty)) },
  { key: "currentStockValue", label: "Stock Value (SRP)", render: (r) => (r.currentStockValue === null ? "—" : formatPeso(r.currentStockValue)) },
];

const DROPPED_PRODUCT_COLUMNS = [
  { key: "sku", label: "SKU" },
  { key: "product", label: "Product", maxWidth: 130 },
  { key: "previousGmv", label: "Previous-Period Sales", render: (r) => formatPeso(r.previousGmv) },
  { key: "previousUnits", label: "Previous-Period Units", render: (r) => formatNum(r.previousUnits) },
  { key: "currentStockQty", label: "Current Stock", render: (r) => (r.currentStockQty === null ? "—" : formatNum(r.currentStockQty)) },
  { key: "currentStockValue", label: "Stock Value (SRP)", render: (r) => (r.currentStockValue === null ? "—" : formatPeso(r.currentStockValue)) },
  { key: "status", label: "Status", render: (r) => <SeverityBadge severity={STATUS_SEVERITY[r.status] || "critical"} text={r.status} /> },
];

function formatAsOf(meta) {
  if (!meta) return null;
  const sales = meta.salesAsOf;
  const inventory = meta.inventoryAsOf ? meta.inventoryAsOf.slice(0, 10) : null;
  if (!sales && !inventory) return null;
  if (sales === inventory || (!inventory && sales)) return `Data as of ${sales}`;
  if (!sales) return `Inventory as of ${inventory}`;
  return `Sales as of ${sales} · Inventory as of ${inventory}`;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Formats a plain YYYY-MM-DD (no time component — transaction_date is a
// ClickHouse Date, not DateTime, so there is no intraday precision to show).
function formatIsoDateLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
}

function effectivePeriodLabel(period) {
  if (!period) return null;
  const from = formatIsoDateLabel(period.from);
  const to = formatIsoDateLabel(period.to);
  if (!from || !to) return null;
  return from === to ? from : `${from} – ${to}`;
}

// Compact "Aug 10–16" / "Aug 31–Sep 6" form (no year — used for the 4-week
// Repeat Sellers buckets, matching the density of the rest of that panel).
function formatCompactRange(period) {
  if (!period) return null;
  const [, fm, fd] = period.from.split("-").map(Number);
  const [, tm, td] = period.to.split("-").map(Number);
  const fromLabel = `${SHORT_MONTHS[fm - 1]} ${fd}`;
  const toLabel = fm === tm ? `${td}` : `${SHORT_MONTHS[tm - 1]} ${td}`;
  return `${fromLabel}–${toLabel}`;
}

// Query params for the API's range contract: a preset key sends
// ?range=<key>; a custom selection sends ?range=custom&from=&to=.
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

// Real ClickHouse-backed Product Analytics — see api/hrh-product-analytics.js
// for the query/reconciliation. Date Range + Channel are now the dashboard-
// wide filter owned by HrhOnlineApp and shown in Header (`filters` prop),
// not page-local state — fetches on mount and whenever either changes; no
// polling (this is historical/analytical, not a live feed). A custom range
// is never sent to the API until both dates are picked and from <= to.
export default function ProductAnalytics({ filters }) {
  const { channel, dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bucketGranularity, setBucketGranularity] = useState("week");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, gran) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, bucketGranularity: gran });
      const res = await fetch(`/api/hrh-product-analytics?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load(channel, params, bucketGranularity);
  }, [channel, params, bucketGranularity, ready, load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Product Analytics
        </div>
        <div className="flex items-center gap-3">
          {data?.meta && (
            <span className="text-[11.5px]" style={{ color: hrh.muted }}>
              {formatAsOf(data.meta)}
            </span>
          )}
          {data?.meta?.current && (
            <span className="text-[11.5px] font-semibold text-right" style={{ color: hrh.ink2 }}>
              {effectivePeriodLabel(data.meta.current)}
              <span className="font-normal" style={{ color: hrh.muted }}>
                {" "}
                vs {effectivePeriodLabel(data.meta.previous)}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => ready && load(channel, params, bucketGranularity)}
            disabled={loading || !ready}
            className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md disabled:opacity-40"
            style={{ background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Product Analytics…" />}
      {error && <ErrorState label={`Couldn't load Product Analytics: ${error}`} />}

      {data && !error && (
        <>
          <Panel
            title="Repeat Sellers"
            subtitle={`Positive sales in 2+ of the last 4 ${bucketGranularity === "month" ? "months" : "weeks"} — independent of the Date Range filter above`}
            action={<TrendBucketPills value={bucketGranularity} onChange={setBucketGranularity} options={BUCKET_GRANULARITY_OPTIONS} />}
            className="mb-4"
          >
            <DataTable
              columns={repeatSellerColumns(bucketGranularity, data.meta?.periodBuckets)}
              rows={data.repeatSellers}
              paginate
              pageSize={10}
              emptyLabel={`No repeat-selling products found for the selected 4-${bucketGranularity === "month" ? "month" : "week"} window.`}
            />
          </Panel>

          <Panel
            title="Top Products — Current vs Previous Period"
            subtitle={`Highest current-period GMV · ${effectivePeriodLabel(data.meta.current)} vs ${effectivePeriodLabel(data.meta.previous)}`}
            className="mb-4"
          >
            <DataTable columns={TOP_PRODUCT_COLUMNS} rows={data.topProducts} paginate pageSize={10} />
          </Panel>

          <Panel
            title="Dropped Products — Stock Check"
            subtitle={`Sold ${effectivePeriodLabel(data.meta.previous)}, zero sales ${effectivePeriodLabel(data.meta.current)}`}
          >
            <DataTable columns={DROPPED_PRODUCT_COLUMNS} rows={data.droppedProducts} paginate pageSize={10} />
          </Panel>
        </>
      )}
    </div>
  );
}
