import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
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

// MoM needs both months' actual peso figures shown, not just the prior
// one beside a %  — a bare "+12.3% (₱41,700)" doesn't say what THIS
// month's own number is, which was the source of the confusion. Shows
// "prev → current" then the % change, e.g. "₱41,700 → ₱46,800  +12.3%".
function MomCell({ previous, current, pct }) {
  if (pct === null || pct === undefined) return "—";
  return (
    <span className="whitespace-nowrap">
      <span style={{ color: hrh.muted }}>
        {formatPeso(previous)} → {formatPeso(current)}
      </span>{" "}
      {formatPct(pct)}
    </span>
  );
}

// One insights entry per report period. Keyed on the period's START (plus
// the preset), so a week-to-date or month-to-date period keeps the same
// insights all week/month as its end date moves forward each day.
function insightsKey(dateRange, current) {
  const preset = dateRange && typeof dateRange === "object" ? dateRange.key : dateRange;
  const tail = preset === "custom" ? `${current.from}_${current.to}` : current.from;
  return `wbr-${preset}-${tail}`.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function formatDateLabel(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const SKU_DETAIL_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 380 },
  { key: "sku", label: "SKU", render: (r) => r.sku || "—", width: 100 },
  { key: "detail", label: "Total Sales / Units / Stock" },
  { key: "lastSoldDate", label: "Last Date Sold", render: (r) => formatDateLabel(r.lastSoldDate) },
];

// Click-to-open FULL modal for the SKU Movement table's "SKUs" count — the
// count alone doesn't say WHICH SKUs. Shows every SKU in the category (not
// just a top-N — see topSkusFor in api/_hrh-weekly-business-review.js,
// which no longer truncates), paginated. Each row's detail is the TOTAL
// GMV that SKU generated (current period for Grew/Dipped/Emerging, prior
// period for Disappeared — the period with real sales) plus units sold and
// current stock, e.g. "₱321 (5 units) · 12 unit(s) still in stock" — a
// signed +/- delta was tried first and dropped as confusing, per explicit
// request.
function SkuCountWithModal({ count, topSkus, category }) {
  const [open, setOpen] = useState(false);
  if (!topSkus || topSkus.length === 0) return formatNum(count);
  return (
    <>
      <span className="cursor-pointer border-b border-dotted" style={{ borderColor: hrh.muted }} onClick={() => setOpen(true)}>
        {formatNum(count)}
      </span>
      <Modal open={open} onClose={() => setOpen(false)} title={`${category} — All SKUs`} subtitle={`${topSkus.length} SKU(s) this period`} wide>
        <DataTable columns={SKU_DETAIL_COLUMNS} rows={topSkus} paginate pageSize={15} emptyLabel="No SKUs in this category." />
      </Modal>
    </>
  );
}

// A table figure with its change vs the Date Range filter's previous
// comparable period right beneath it, e.g. "₱46,800" over "▲ 12.3% vs ₱41,700".
function DeltaValue({ value, previous, format }) {
  const pct = previous ? ((value - previous) / Math.abs(previous)) * 100 : null;
  const color = pct === null ? hrh.muted : pct > 0 ? hrh.good : pct < 0 ? hrh.bad : hrh.muted;
  const arrow = pct === null ? "" : pct > 0 ? "▲ " : pct < 0 ? "▼ " : "▬ ";
  return (
    <div className="whitespace-nowrap leading-tight">
      <div>{format(value)}</div>
      <div className="text-[11px] mt-0.5" style={{ color }}>
        {pct === null ? (value ? "New (none before)" : "—") : `${arrow}${formatPct(Math.abs(pct))}`}
        {pct !== null && <span style={{ color: hrh.muted }}> vs {format(previous)}</span>}
      </div>
    </div>
  );
}

// Team-written insights for the selected period, shared by everyone (saved
// through /api/hrh-sales-analytics?report=insights — see
// api/_hrh-insights.js). Replaces the old auto-generated Data Quality Notes.
function InsightsPanel({ storageKey, periodLabel }) {
  const [saved, setSaved] = useState({ text: "", updatedAt: null });
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("loading"); // loading | ready | saving | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    fetch(`/api/hrh-sales-analytics?report=insights&key=${encodeURIComponent(storageKey)}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || json.error || `Request failed (${res.status})`);
        setSaved(json);
        setDraft(json.text);
        setStatus("ready");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setStatus("error");
      });
    return () => controller.abort();
  }, [storageKey]);

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/hrh-sales-analytics?report=insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: storageKey, text: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `Request failed (${res.status})`);
      setSaved(json);
      setDraft(json.text);
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("ready");
    }
  }

  const dirty = draft !== saved.text;
  const savedAt = saved.updatedAt
    ? new Date(saved.updatedAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <Panel title="Insights" subtitle={`Team notes for ${periodLabel} — saved for everyone viewing this period`}>
      {status === "loading" ? (
        <LoadingState label="Loading insights…" />
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            maxLength={20000}
            placeholder="Write this period's insights — what drove the numbers, what to act on, what to watch next…"
            className="w-full rounded-md border px-3 py-2.5 text-[13px] leading-relaxed outline-none"
            style={{ borderColor: hrh.border, color: hrh.ink, background: "#fff" }}
          />
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || status === "saving"}
              className="text-[12.5px] font-semibold px-4 py-1.5 rounded-md text-white disabled:opacity-40"
              style={{ background: hrh.navy }}
            >
              {status === "saving" ? "Saving…" : "Save Insights"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(saved.text)}
                className="text-[12.5px] font-semibold px-3 py-1.5 rounded-md"
                style={{ border: `1px solid ${hrh.border}`, color: hrh.ink2, background: "#fff" }}
              >
                Discard changes
              </button>
            )}
            <span className="text-[11.5px]" style={{ color: error ? hrh.bad : hrh.muted }}>
              {error
                ? `Couldn't ${status === "error" ? "load" : "save"}: ${error}`
                : dirty
                  ? "Unsaved changes"
                  : savedAt
                    ? `Last saved ${savedAt}`
                    : "No insights saved for this period yet."}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

// Sales/Orders/AOV each show their change vs the Date Range filter's
// previous comparable period; WoW/MoM compare the same selected dates one
// week / one month earlier (headers carry the actual comparison dates).
const platformTableColumns = (meta) => [
  { key: "platform", label: "Platform", render: (r) => <span className={r.platform === "Total" ? "font-semibold" : ""}>{r.platform}</span> },
  { key: "sales", label: "Sales", render: (r) => <DeltaValue value={r.sales} previous={r.prevSales} format={formatPeso} /> },
  { key: "wowPct", label: meta.wowPreviousLabel ? `WoW % (vs ${meta.wowPreviousLabel})` : "WoW %", render: (r) => <PctWithAmount pct={r.wowPct} previous={r.wowPrevious} /> },
  { key: "momPct", label: `MoM % (vs ${meta.momPreviousLabel})`, render: (r) => <MomCell previous={r.momPrevious} current={r.momCurrent} pct={r.momPct} /> },
  { key: "orders", label: "Orders", render: (r) => <DeltaValue value={r.orders} previous={r.prevOrders} format={formatNum} /> },
  { key: "aov", label: "AOV", render: (r) => <DeltaValue value={r.aov} previous={r.prevAov} format={formatPeso} /> },
  { key: "conversionRate", label: "Conversion Rate", render: (r) => (r.conversionRate === null || r.conversionRate === undefined ? "—" : formatPct(r.conversionRate)) },
];

// Plain increase/decrease % per platform vs. the comparison period (same
// current/previous the bar chart plots) — replaces an earlier "share of
// total" table, removed per explicit request.
const PLATFORM_CHANGE_COLUMNS = [
  { key: "platform", label: "Platform" },
  { key: "pctChange", label: "% Change", render: (r) => (r.pctChange === null || r.pctChange === undefined ? "New" : formatPct(r.pctChange)) },
];

// lastPeriodSales/lastPeriodUnits/stock added 2026-09-18 per explicit
// request — each category's aggregate "Total Sales / Units / Stock",
// mirroring the same figures already shown per-SKU in the modal, so the
// scale behind a category is visible without opening it. Stock shows a
// "+N unknown" caveat when some of the category's SKUs had no inventory
// match (see api/_hrh-weekly-business-review.js's own comment) — those
// SKUs contribute 0 to the sum, never a guess.
const SKU_MOVEMENT_COLUMNS = [
  { key: "category", label: "Category" },
  { key: "skus", label: "SKUs", render: (r) => <SkuCountWithModal count={r.skus} topSkus={r.topSkus} category={r.category} /> },
  { key: "movement", label: "Movement" },
  { key: "lastPeriodSales", label: "Last Period Sales", render: (r) => formatPeso(r.lastPeriodSales) },
  { key: "lastPeriodUnits", label: "Last Period Units", render: (r) => formatNum(r.lastPeriodUnits) },
  {
    key: "stock",
    label: "Stock",
    render: (r) => (
      <span className="whitespace-nowrap">
        {formatNum(r.stock)}
        {r.stockUnknownCount > 0 && <span style={{ color: hrh.muted }}> (+{r.stockUnknownCount} unknown)</span>}
      </span>
    ),
  },
  { key: "notes", label: "Notes / Why", maxWidth: 420 },
];

const TOP10_TABLE_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 260 },
  { key: "currentUnits", label: "Current Units", render: (r) => formatNum(r.currentUnits) },
  { key: "previousUnits", label: "Previous Units", render: (r) => formatNum(r.previousUnits) },
  { key: "unitChange", label: "Unit Change", render: (r) => `${r.unitChange >= 0 ? "+" : ""}${formatNum(r.unitChange)}` },
  { key: "currentGmv", label: "Current Sales", render: (r) => formatPeso(r.currentGmv) },
  { key: "previousGmv", label: "Previous Sales", render: (r) => formatPeso(r.previousGmv) },
  { key: "gmvChange", label: "Sales Change", render: (r) => `${r.gmvChange >= 0 ? "+" : ""}${formatPeso(r.gmvChange)}` },
  { key: "pctChange", label: "% Change", render: (r) => (r.pctChange === null || r.pctChange === undefined ? "New" : formatPct(r.pctChange)) },
];

const MOVERS_SORT_OPTIONS = [
  { key: "units", label: "Units" },
  { key: "value", label: "Value" },
];

// Channel toggle for Top 10 SKU Movers — keys match the API's
// skuMoversByChannel keys; "all" uses the combined skuMovers list.
const MOVERS_CHANNEL_OPTIONS = [
  { key: "all", label: "All" },
  { key: "HMRPH Online", label: "HMR Online" },
  { key: "TikTok", label: "TikTok" },
  { key: "Shopee", label: "Shopee" },
];

function SegmentedToggle({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: hrh.muted }}>
        {label}
      </span>
      <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${hrh.border}` }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="text-[11.5px] font-semibold px-2.5 h-6"
            style={value === o.key ? { background: hrh.navy, color: "#fff" } : { background: "transparent", color: hrh.ink2 }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Recreates slides 2-5 of "Ecomm Weekly Business Review.pdf" as a live,
// real-data section — see api/_hrh-weekly-business-review.js's own top
// comment for what that deck actually contains (a template: every metric
// cell is "--" with "Replace with actual data" instructions) and the full
// methodology (WoW/MoM validity thresholds, no minimum %/peso threshold for
// Grew/Dipped, reused stock-status logic, etc).
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
  const [moversSort, setMoversSort] = useState("units");
  const [moversChannel, setMoversChannel] = useState("all");

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
  // "Top 10 by Units" and "Top 10 by Value" are genuinely different sets —
  // data.skuMovers is every SKU with real current-period activity, so
  // re-sorting here and taking the top 10 for whichever metric is selected
  // never misses a SKU that only ranks highly by the OTHER metric.
  const moversSource = data ? (moversChannel === "all" ? data.skuMovers : data.skuMoversByChannel?.[moversChannel] || []) : [];
  const moversChannelLabel = MOVERS_CHANNEL_OPTIONS.find((o) => o.key === moversChannel)?.label;
  const topMovers = data
    ? [...moversSource].sort((a, b) => (moversSort === "value" ? b.currentGmv - a.currentGmv : b.currentUnits - a.currentUnits)).slice(0, 10)
    : [];

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
          <Panel
            title="Sales Performance — By Platform"
            subtitle={`Current period: ${data.meta.currentLabel} · changes vs previous period ${data.meta.previousLabel}`}
            className="mb-4"
          >
            <DataTable columns={platformTableColumns(data.meta)} rows={platformRows} emptyLabel="No platform sales in this period." />
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
                <DataTable columns={PLATFORM_CHANGE_COLUMNS} rows={data.platformComparison.rows} />
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

          {/* ============================== SLIDE 4 ============================== */}
          <Panel
            title="Sales Performance — SKU Movement"
            subtitle={`Which SKUs moved the needle in ${data.meta.currentLabel} — and why?`}
            className="mb-4"
          >
            <DataTable columns={SKU_MOVEMENT_COLUMNS} rows={data.skuMovement} emptyLabel="No SKU movement to report." />
          </Panel>

          {/* ============================== SLIDE 5 ============================== */}
          <Panel
            title={`Top 10 SKU Movers — ${moversSort === "value" ? "Sales Value" : "Units Sold"}${moversChannel === "all" ? "" : ` · ${moversChannelLabel}`}`}
            subtitle={`${data.meta.currentLabel} vs. ${data.meta.previousLabel}`}
            className="mb-4"
            action={
              <div className="flex items-center gap-4 flex-wrap">
                <SegmentedToggle label="Channel" options={MOVERS_CHANNEL_OPTIONS} value={moversChannel} onChange={setMoversChannel} />
                <SegmentedToggle label="Sort by" options={MOVERS_SORT_OPTIONS} value={moversSort} onChange={setMoversSort} />
              </div>
            }
          >
            {moversSort === "value" ? (
              <BarComparisonChart
                data={topMovers.map((r) => ({ ...r, label: r.product.length > 28 ? `${r.product.slice(0, 28)}…` : r.product }))}
                xKey="label"
                horizontal
                height={340}
                valueFormatter={formatCompactPeso}
                series={[
                  { key: "currentGmv", name: "Current Period Sales", color: hrh.blue },
                  { key: "previousGmv", name: "Previous Comparable Period Sales", color: hrh.muted },
                ]}
              />
            ) : (
              <BarComparisonChart
                data={topMovers.map((r) => ({ ...r, label: r.product.length > 28 ? `${r.product.slice(0, 28)}…` : r.product }))}
                xKey="label"
                horizontal
                height={340}
                valueFormatter={formatNum}
                series={[
                  { key: "currentUnits", name: "Current Period Units", color: hrh.blue },
                  { key: "previousUnits", name: "Previous Comparable Period Units", color: hrh.muted },
                ]}
              />
            )}
            <div className="mt-4">
              <DataTable columns={TOP10_TABLE_COLUMNS} rows={topMovers} emptyLabel={moversChannel === "all" ? "No sales in this period." : `No ${moversChannelLabel} sales in this period.`} />
            </div>
          </Panel>
          <InsightsPanel storageKey={insightsKey(dateRange, data.meta.current)} periodLabel={data.meta.currentLabel} />
        </>
      )}
    </div>
  );
}
