import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { TrendChart, BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatNum, formatPct, formatPeso, formatCompactPeso } from "../format";

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

// Percentage + the prior period's own peso amount together (e.g. "+12.3%
// (₱41,700)") — a bare % doesn't say what the actual prior-period figure
// was. This is the previous period's raw GMV, not a delta, so no +/- sign
// belongs on it (per explicit request).
function PctWithAmount({ pct, previous }) {
  if (pct === null || pct === undefined) return "—";
  return (
    <span className="whitespace-nowrap">
      {formatPct(pct)} <span style={{ color: hrh.muted }}>({formatPeso(previous)})</span>
    </span>
  );
}

// Click-to-open breakdown for the SKU Movement table's "SKUs" count — the
// count alone doesn't say WHICH SKUs, so clicking it lists the top movers
// behind that number (ranked by revenue impact, computed server-side).
// Each row shows "<product> <+/-₱delta> (<+/-% change>)" for Grew/Dipped —
// the ₱ figure is how much that SKU's own GMV moved between the two
// periods (e.g. "+₱107 (+50.0%)" = that SKU went up ₱107, a 50% increase
// on its own prior-period total) — for Emerging it's the new GMV itself,
// for Disappeared the GMV that dropped to zero (see topSkusFor in
// api/_hrh-weekly-business-review.js for the exact per-category wording).
//
// Rendered through a portal with `position: fixed` (coordinates computed
// from the anchor's own bounding rect when clicked), NOT a plain
// absolutely-positioned child — DataTable wraps every table in an
// `overflow-x-auto` div for horizontal scrolling, which also clips
// vertical overflow (per the CSS spec, a non-"visible" overflow-x forces
// overflow-y to compute as "auto" too), so a dropdown positioned relative
// to its scrollable ancestor would get cut off instead of floating above
// the page. Closes on an outside click (not on mouse-leave — this is
// click-to-open, not hover).
function SkuCountWithHover({ count, topSkus }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (anchorRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (!topSkus || topSkus.length === 0) return formatNum(count);

  function toggle() {
    if (!open) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((o) => !o);
  }

  return (
    <span
      ref={anchorRef}
      className="cursor-pointer border-b border-dotted"
      style={{ borderColor: hrh.muted }}
      onClick={toggle}
    >
      {formatNum(count)}
      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            className="fixed z-50 w-72 rounded-md p-2.5 shadow-lg"
            style={{ top: pos.top, left: pos.left, background: hrh.surface, border: `1px solid ${hrh.border}` }}
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] mb-1.5" style={{ color: hrh.ink2 }}>
              Top {topSkus.length} SKUs
            </div>
            <ul className="space-y-1">
              {topSkus.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[11.5px]" style={{ color: hrh.ink }}>
                  <span className="truncate">{s.product}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: hrh.muted }}>
                    {s.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </span>
  );
}

function InsightCard({ title, body }) {
  return (
    <div className="rounded-md p-3.5" style={{ background: hrh.bg, border: `1px solid ${hrh.border}` }}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] mb-1.5" style={{ color: hrh.ink }}>
        {title}
      </div>
      <div className="text-[12px] leading-snug" style={{ color: hrh.ink2 }}>
        {body}
      </div>
    </div>
  );
}

const PLATFORM_TABLE_COLUMNS = [
  { key: "platform", label: "Platform", render: (r) => <span className={r.platform === "Total" ? "font-semibold" : ""}>{r.platform}</span> },
  { key: "sales", label: "Sales", render: (r) => formatPeso(r.sales) },
  { key: "wowPct", label: "WoW %", render: (r) => <PctWithAmount pct={r.wowPct} previous={r.wowPrevious} /> },
  { key: "momPct", label: "MoM % (Month to Date)", render: (r) => <PctWithAmount pct={r.momPct} previous={r.momPrevious} /> },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "aov", label: "AOV", render: (r) => formatPeso(r.aov) },
  { key: "conversionRate", label: "Conversion Rate", render: (r) => (r.conversionRate === null || r.conversionRate === undefined ? "—" : formatPct(r.conversionRate)) },
];

// Each platform's share of the whole (current period, and separately the
// previous period) — the bar chart above only shows absolute GMV per
// platform, not how the mix between platforms shifted.
const PLATFORM_SHARE_COLUMNS = [
  { key: "platform", label: "Platform" },
  { key: "current", label: "Current", render: (r) => formatPeso(r.current) },
  { key: "currentSharePct", label: "Current Share", render: (r) => formatPct(r.currentSharePct) },
  { key: "previous", label: "Previous", render: (r) => formatPeso(r.previous) },
  { key: "previousSharePct", label: "Previous Share", render: (r) => formatPct(r.previousSharePct) },
];

const SKU_MOVEMENT_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "skus", label: "SKUs", render: (r) => <SkuCountWithHover count={r.skus} topSkus={r.topSkus} /> },
  { key: "movement", label: "Movement" },
  { key: "notes", label: "Notes / Why", maxWidth: 480 },
];

const TOP10_TABLE_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 260 },
  { key: "currentUnits", label: "Current Units", render: (r) => formatNum(r.currentUnits) },
  { key: "previousUnits", label: "Previous Units", render: (r) => formatNum(r.previousUnits) },
  { key: "unitChange", label: "Unit Change", render: (r) => `${r.unitChange >= 0 ? "+" : ""}${formatNum(r.unitChange)}` },
  { key: "pctChange", label: "% Change", render: (r) => (r.pctChange === null || r.pctChange === undefined ? "New" : formatPct(r.pctChange)) },
];

// Recreates slides 2-5 of "Ecomm Weekly Business Review.pdf" as a live,
// real-data section — see api/_hrh-weekly-business-review.js's own top
// comment for what that deck actually contains (a template: every metric
// cell is "--" with "Replace with actual data" instructions) and the full
// methodology (WoW/MoM validity thresholds, +/-20% SKU movement threshold,
// reused stock-status logic, etc).
//
// Own standalone sidebar page rather than appended to an existing one —
// this report is inherently cross-channel (comparing all 3 platforms) and
// cross-page (Sales Analytics + Product Analytics' own comparison engine +
// Product Analytics' stock-status logic), so it doesn't respect the page
// Channel filter (same convention as Traffic & Conversion/Customer
// Success/Barcode Analytics — see HrhOnlineApp.jsx's hideChannelFilter).
export default function WeeklyBusinessReview({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...p, report: "weeklyBusinessReview" });
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

  const platformRows = data ? [...data.platformTable.rows, data.platformTable.total] : [];

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: hrh.ink }}>
        Weekly Business Review
      </div>
      <p className="text-[12px] mt-1 mb-4" style={{ color: hrh.muted }}>
        Platform and SKU performance summary for the selected period.
      </p>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Weekly Business Review…" />}
      {error && <ErrorState label={`Couldn't load Weekly Business Review: ${error}`} />}

      {data && !error && (
        <>
          {/* ============================== SLIDE 2 ============================== */}
          <Panel title="Sales Performance — By Platform" subtitle={`Current period: ${data.meta.currentLabel}`} className="mb-4">
            <DataTable columns={PLATFORM_TABLE_COLUMNS} rows={platformRows} emptyLabel="No platform sales in this period." />
          </Panel>

          {/* ============================== SLIDE 3 ============================== */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel
              title="Sales by Platform"
              subtitle={`${data.platformComparison.currentLabel} vs. ${data.platformComparison.previousLabel}`}
            >
              <BarComparisonChart
                data={data.platformComparison.rows}
                xKey="platform"
                horizontal
                valueFormatter={formatCompactPeso}
                series={[
                  { key: "current", name: data.platformComparison.currentLabel, color: hrh.blue },
                  { key: "previous", name: data.platformComparison.previousLabel, color: hrh.muted },
                ]}
              />
              <div className="mt-3">
                <DataTable columns={PLATFORM_SHARE_COLUMNS} rows={data.platformComparison.rows} />
              </div>
            </Panel>
            <Panel title="Weekly Sales Trend by Platform" subtitle="Last 6 ISO weeks">
              <TrendChart
                data={data.weeklyTrend}
                xKey="weekLabel"
                valueFormatter={formatCompactPeso}
                height={300}
                xAxisAngle={-30}
                xAxisInterval={0}
                xAxisHeight={54}
                series={[
                  { key: "HMRPH Online", name: "HMRPH Online", color: hrh.series[0] },
                  { key: "TikTok", name: "TikTok", color: hrh.accent },
                  { key: "Shopee", name: "Shopee", color: hrh.good },
                ]}
              />
            </Panel>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <InsightCard title="Platforms that grew" body={data.insights.grew} />
            <InsightCard title="Platforms that dipped" body={data.insights.dipped} />
            <InsightCard title="Cross-platform insights" body={data.insights.crossPlatform} />
          </div>

          {/* ============================== SLIDE 4 ============================== */}
          <Panel
            title="Sales Performance — SKU Movement"
            subtitle={`Which SKUs moved the needle in ${data.meta.currentLabel} — and why?`}
            className="mb-4"
          >
            <DataTable columns={SKU_MOVEMENT_COLUMNS} rows={data.skuMovement} emptyLabel="No SKU movement to report." />
          </Panel>

          {/* ============================== SLIDE 5 ============================== */}
          <Panel title="Top 10 SKU Movers — Units Sold" subtitle={`${data.meta.currentLabel} vs. ${data.meta.previousLabel}`} className="mb-4">
            <BarComparisonChart
              data={data.top10.map((r) => ({ ...r, label: r.product.length > 28 ? `${r.product.slice(0, 28)}…` : r.product }))}
              xKey="label"
              horizontal
              height={340}
              valueFormatter={formatNum}
              series={[
                { key: "currentUnits", name: "Current Period Units", color: hrh.blue },
                { key: "previousUnits", name: "Previous Comparable Period Units", color: hrh.muted },
              ]}
            />
            <div className="mt-4">
              <DataTable columns={TOP10_TABLE_COLUMNS} rows={data.top10} emptyLabel="No units sold in this period." />
            </div>
          </Panel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <InsightCard title="Hero SKUs" body={data.skuInsights.hero} />
            <InsightCard title="Problem SKUs" body={data.skuInsights.problem} />
            <InsightCard title="Emerging SKUs" body={data.skuInsights.emerging} />
          </div>

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
