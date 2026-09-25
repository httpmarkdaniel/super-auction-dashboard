import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { BarComparisonChart, BubbleChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

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

// Small hand-drawn stroke icons, same convention as other HRH Online pages
// (kept local rather than shared).
function Icon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const ICONS = {
  tag: (
    <Icon>
      <path d="M20.59 13.41 11 3.83a2 2 0 0 0-1.41-.58H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82Z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </Icon>
  ),
  box: (
    <Icon>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </Icon>
  ),
  percent: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  cart: (
    <Icon>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Icon>
  ),
  trend: (
    <Icon>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </Icon>
  ),
  peso: (
    <Icon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </Icon>
  ),
  alert: (
    <Icon>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  ),
};

// Single-hue sequential scale (light -> dark), same convention as Barcode
// Analytics' funnel colors — used to color bubbles/segments by band depth
// (0-10% lightest, 50%+ darkest) since there's no real margin gradient to
// color by (see api/_hrh-markdown-analytics.js's header comment on why).
function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function bandColor(i, n) {
  return lerpColor(hrh.blue, hrh.accent, n > 1 ? i / (n - 1) : 0);
}
// Diverging low(green)->mid(yellow)->high(red) heat scale for the aging x
// markdown value grid — green/low is "not much value sitting here" (fine),
// red/high is "a lot of value sitting here" (worth attention). `t` is 0-1.
function heatColor(t) {
  const stops = [
    [230, 244, 234], // low - soft green
    [250, 241, 223], // mid - soft yellow
    [250, 225, 225], // high-mid - soft red
    [235, 104, 52], // high - accent orange/red
  ];
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * localT));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function ComboTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span style={{ color: "#a3adba" }}>{p.name}:</span>
          <span className="font-semibold">{p.dataKey === "avgMarkdownPct" ? `${p.value.toFixed(1)}%` : formatPeso(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Markdown Sales (bar, peso, left axis) + Avg Markdown % (line, %, right
// axis) over the current period's days — none of Charts.jsx's existing
// combo variants fit a peso-bar + %-line shape, so this stays local to
// this page (same "self-contained per file" convention as its icons).
function MarkdownTrendChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis yAxisId="peso" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={formatCompactPeso} width={60} />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tick={{ fontSize: 11, fill: hrh.ink2 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${Math.round(v)}%`}
          width={44}
        />
        <Tooltip content={<ComboTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="peso" dataKey="markdownSales" name="Markdown Sales" fill={hrh.series[0]} radius={[2, 2, 0, 0]} maxBarSize={28} />
        <Line yAxisId="pct" type="monotone" dataKey="avgMarkdownPct" name="Avg Markdown %" stroke={hrh.accent} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Sales + Discount Value (bars, peso, left axis) + Avg Markdown % (line, %,
// right axis) per band — replaces the reference mockup's "Revenue vs
// Profit Contribution" (Profit isn't computable, see the backend's header
// comment); Discount Value (real) takes Profit's place.
function SalesVsDiscountChart({ data, height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey="band" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis yAxisId="peso" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={formatCompactPeso} width={60} />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tick={{ fontSize: 11, fill: hrh.ink2 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${Math.round(v)}%`}
          width={44}
        />
        <Tooltip content={<ComboTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="peso" dataKey="sales" name="Sales" fill={hrh.series[0]} radius={[2, 2, 0, 0]} maxBarSize={26} />
        <Bar yAxisId="peso" dataKey="discountValue" name="Discount Value" fill={hrh.accent} radius={[2, 2, 0, 0]} maxBarSize={26} />
        <Line yAxisId="pct" type="monotone" dataKey="avgMarkdownPct" name="Avg Markdown %" stroke={hrh.blue} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function InsightCard({ children }) {
  return (
    <div className="rounded-md p-3.5 h-full flex flex-col justify-center" style={{ background: hrh.accentSoft, border: `1px solid ${hrh.border}` }}>
      <div className="text-[12px] leading-snug" style={{ color: hrh.accentText }}>
        {children}
      </div>
    </div>
  );
}

const BAND_METRIC_OPTIONS = [
  { key: "sales", label: "Sales" },
  { key: "units", label: "Units" },
  { key: "sellThroughRate", label: "Sell-Through" },
  { key: "discountValue", label: "Discount Value" },
];

const CATEGORY_COLUMNS = [
  { key: "rank", label: "#", width: 34 },
  { key: "category", label: "Category", maxWidth: 160 },
  { key: "sales", label: "Markdown Sales", render: (r) => formatPeso(r.sales) },
  { key: "units", label: "Units Sold", render: (r) => formatNum(r.units) },
  { key: "avgMarkdownPct", label: "Avg Markdown %", render: (r) => formatPct(r.avgMarkdownPct) },
  {
    key: "sellThroughRate",
    label: "Sell-Through",
    render: (r) => (
      <span className="inline-block px-2 py-0.5 rounded text-[11.5px] font-semibold" style={{ background: heatColor(r.sellThroughRate / 100) }}>
        {formatPct(r.sellThroughRate)}
      </span>
    ),
  },
  { key: "discountValue", label: "Discount Value", render: (r) => formatPeso(r.discountValue) },
  { key: "inventoryValue", label: "Inventory Value", render: (r) => formatPeso(r.inventoryValue) },
];

const ACTION_COLORS = {
  Review: { bg: "#faeaea", text: hrh.bad },
  Monitor: { bg: "#faf1df", text: "#b07514" },
  Effective: { bg: "#e6f4ea", text: hrh.good },
};
function ActionPill({ action }) {
  const c = ACTION_COLORS[action] || ACTION_COLORS.Monitor;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: c.bg, color: c.text }}>
      {action}
    </span>
  );
}
const OPPORTUNITY_COLUMNS = [
  { key: "product", label: "Product", maxWidth: 220 },
  { key: "ageDays", label: "Age (days)", render: (r) => formatNum(r.ageDays) },
  { key: "stock", label: "Stock", render: (r) => formatNum(r.stock) },
  { key: "currentPrice", label: "Current Price", render: (r) => formatPeso(r.currentPrice) },
  { key: "markdownPct", label: "Markdown %", render: (r) => formatPct(r.markdownPct) },
  { key: "sellThroughRate", label: "Sell-Through", render: (r) => formatPct(r.sellThroughRate) },
  { key: "inventoryValue", label: "Inv. Value", render: (r) => formatPeso(r.inventoryValue) },
  { key: "action", label: "Action", render: (r) => <ActionPill action={r.action} /> },
];

// Aging x Markdown value heatmap — plain HTML table, cells colored by
// value share of the grid's own max (heatColor), same "own bespoke
// component per page" convention as the trend/combo charts above (no
// existing shared heatmap component in this codebase).
function AgingMarkdownHeatmap({ heatmap }) {
  const maxValue = Math.max(1, ...heatmap.grid.flat());
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr>
            <th className="text-left px-2 py-1.5 text-[10.5px] uppercase tracking-[0.04em] font-semibold" style={{ color: hrh.ink2 }}>
              Age / Markdown
            </th>
            {heatmap.bands.map((b) => (
              <th key={b} className="text-center px-2 py-1.5 text-[10.5px] uppercase tracking-[0.04em] font-semibold whitespace-nowrap" style={{ color: hrh.ink2 }}>
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.ageBuckets.map((ab, ri) => (
            <tr key={ab} style={{ borderTop: `1px solid ${hrh.border}` }}>
              <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ color: hrh.ink }}>
                {ab}
              </td>
              {heatmap.bands.map((b, ci) => {
                const v = heatmap.grid[ri][ci];
                return (
                  <td key={b} className="px-2 py-1.5 text-center whitespace-nowrap" style={{ background: heatColor(v / maxValue), color: hrh.ink }}>
                    {v > 0 ? formatCompactPeso(v) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Rebuilt 2026-09-17 to match a full reference mockup (public/markdown.png)
// — see api/_hrh-markdown-analytics.js's header comment for what changed
// and why (real per-transaction markdown data found on mart_net_sales;
// Gross Margin % deliberately omitted as not computable — item_cost
// mirrors price, not a real acquisition cost; Discount Value used instead
// everywhere the mockup shows Margin %). Now Date Range/Channel-aware for
// every sales-side panel; Sell-Through/Inventory/heatmap/Top Opportunities
// stay a live "as of now" snapshot (no meaningful previous-period version
// of on-hand stock). Does NOT implement the mockup's extra Category/
// Subcategory/Brand/Supplier/Inventory Age/Markdown Band filter row — a
// deliberate scope decision (see meta.dataQuality), not an oversight.
export default function MarkdownAnalytics({ filters }) {
  const { dateRange, channel } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bandMetric, setBandMetric] = useState("sales");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (ch, p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ channel: ch, ...p, report: "markdownAnalytics" });
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

  const bandBubbles = useMemo(() => {
    if (!data) return [];
    return data.bandPerformance
      .filter((b) => b.sales > 0)
      .map((b) => ({
        x: Math.round(b.avgMarkdownPct * 10) / 10,
        y: Math.round(b.sellThroughRate * 10) / 10,
        z: Math.max(1, b.sales),
        label: b.band,
        color: bandColor(b.bandIndex, data.bandPerformance.length),
        sizeLabel: "Sales",
      }));
  }, [data]);

  const categoryBubbles = useMemo(() => {
    if (!data) return [];
    return data.categoryPerformance.map((c, i) => ({
      x: Math.round(c.avgMarkdownPct * 10) / 10,
      y: Math.round(c.sellThroughRate * 10) / 10,
      z: Math.max(1, c.sales),
      label: c.category,
      color: hrh.series[i % hrh.series.length],
      sizeLabel: "Sales",
    }));
  }, [data]);

  const rankedCategoryPerformance = useMemo(
    () => (data ? data.categoryPerformance.map((c, i) => ({ ...c, rank: i + 1 })) : []),
    [data]
  );

  const inventoryByAgeSeries = useMemo(
    () => (data ? data.heatmap.bands.map((b, i) => ({ key: b, name: b, color: bandColor(i, data.heatmap.bands.length) })) : []),
    [data]
  );

  const insight = useMemo(() => {
    if (!data) return null;
    const { regular, markdown } = data.priceComparison;
    const sellThroughDiff = markdown.sellThroughRate - regular.sellThroughRate;
    return `Markdown items ${sellThroughDiff >= 0 ? "have a" : "have a lower"} ${Math.abs(sellThroughDiff).toFixed(1)}pp ${sellThroughDiff >= 0 ? "higher" : ""} sell-through rate than regular-priced items (${formatPct(markdown.sellThroughRate)} vs ${formatPct(regular.sellThroughRate)}), and gave up ${formatPeso(markdown.discountValue)} in discount value this period to make ${formatPct(markdown.shareOfTotal)} of total sales.`;
  }, [data]);

  return (
    <div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Markdown Analytics…" />}
      {error && <ErrorState label={`Couldn't load Markdown Analytics: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.methodologyNote}
          </div>

          <KpiRow>
            <KpiCard
              label="Markdown Sales"
              icon={ICONS.tag}
              value={formatPeso(data.kpis.markdownSales.value)}
              delta={data.kpis.markdownSales.delta}
            />
            <KpiCard
              label="Markdown Units Sold"
              icon={ICONS.box}
              value={formatNum(data.kpis.markdownUnits.value)}
              delta={data.kpis.markdownUnits.delta}
            />
            <KpiCard
              label="Avg Markdown %"
              icon={ICONS.percent}
              value={formatPct(data.kpis.avgMarkdownPct.value)}
              delta={data.kpis.avgMarkdownPct.delta}
            />
            <KpiCard
              label="Markdown GMV %"
              icon={ICONS.percent}
              value={formatPct(data.kpis.markdownGmvPct.value)}
              delta={data.kpis.markdownGmvPct.delta}
              sub="share of total sales"
            />
            <KpiCard
              label="Sell-Through Rate"
              icon={ICONS.cart}
              value={formatPct(data.kpis.sellThroughRate.value)}
              sub="live snapshot"
            />
            <KpiCard
              label="Discount Value"
              icon={ICONS.peso}
              value={formatPeso(data.kpis.discountValue.value)}
              delta={data.kpis.discountValue.delta}
              sub="₱ given up via markdowns"
            />
            <KpiCard
              label="Inventory Value at Risk"
              icon={ICONS.alert}
              value={formatPeso(data.kpis.inventoryValueAtRisk.value)}
              sub="marked down, aged 61+ days"
            />
          </KpiRow>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Markdown Sales & Discount Depth Trend" subtitle="How markdown sales and discount depth changed over the selected period">
              <MarkdownTrendChart data={data.trend} />
            </Panel>

            <Panel title="Markdown vs Regular Price Performance" subtitle="Comparison of key metrics between regular and markdown items">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-stretch">
                <DataTable
                  columns={[
                    { key: "metric", label: "" },
                    { key: "regular", label: "Regular Price" },
                    { key: "markdown", label: "Markdown" },
                  ]}
                  rows={[
                    { metric: "Sales", regular: formatPeso(data.priceComparison.regular.sales), markdown: formatPeso(data.priceComparison.markdown.sales) },
                    { metric: "Units Sold", regular: formatNum(data.priceComparison.regular.units), markdown: formatNum(data.priceComparison.markdown.units) },
                    {
                      metric: "Avg Selling Price",
                      regular: formatPeso(data.priceComparison.regular.avgSellingPrice),
                      markdown: formatPeso(data.priceComparison.markdown.avgSellingPrice),
                    },
                    {
                      metric: "Discount Value",
                      regular: formatPeso(data.priceComparison.regular.discountValue),
                      markdown: formatPeso(data.priceComparison.markdown.discountValue),
                    },
                    {
                      metric: "Sell-Through Rate",
                      regular: formatPct(data.priceComparison.regular.sellThroughRate),
                      markdown: formatPct(data.priceComparison.markdown.sellThroughRate),
                    },
                    {
                      metric: "% of Total Sales",
                      regular: formatPct(data.priceComparison.regular.shareOfTotal),
                      markdown: formatPct(data.priceComparison.markdown.shareOfTotal),
                    },
                  ]}
                  emptyLabel="No sales in this period."
                />
                <div className="w-full md:w-[200px]">
                  <InsightCard>{insight}</InsightCard>
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel
              title="Sales by Markdown Band"
              subtitle="Sales performance per discount depth range"
              action={<TrendBucketPills value={bandMetric} onChange={setBandMetric} options={BAND_METRIC_OPTIONS} />}
            >
              <BarComparisonChart
                data={data.bandPerformance}
                xKey="band"
                series={[{ key: bandMetric, name: BAND_METRIC_OPTIONS.find((o) => o.key === bandMetric)?.label || bandMetric, color: hrh.accent }]}
                valueFormatter={bandMetric === "sellThroughRate" ? formatPct : formatCompactPeso}
                horizontal
              />
            </Panel>

            <Panel title="Markdown Efficiency" subtitle="Which discount depths drive the best sell-through? (bubble size = sales)">
              <BubbleChart data={bandBubbles} xLabel="Avg Markdown %" yLabel="Sell-Through Rate" xValueFormatter={(v) => `${v}%`} yValueFormatter={(v) => `${v}%`} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Inventory Aging x Markdown Heatmap" subtitle="Marked-down inventory value by age and discount depth (₱)">
              <AgingMarkdownHeatmap heatmap={data.heatmap} />
            </Panel>

            <Panel title="Inventory Value by Age" subtitle="Breakdown of marked-down inventory value by age bucket">
              <BarComparisonChart data={data.inventoryValueByAge} xKey="ageBucket" series={inventoryByAgeSeries} valueFormatter={formatCompactPeso} horizontal stacked />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Category Markdown Effectiveness" subtitle="Category performance by discount depth and sell-through (bubble size = sales)">
              <BubbleChart data={categoryBubbles} xLabel="Avg Markdown %" yLabel="Sell-Through Rate" xValueFormatter={(v) => `${v}%`} yValueFormatter={(v) => `${v}%`} />
            </Panel>

            <Panel title="Category Performance" subtitle="Top 12 categories by markdown sales this period">
              <DataTable columns={CATEGORY_COLUMNS} rows={rankedCategoryPerformance} paginate pageSize={10} emptyLabel="No markdown sales this period." />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Sales vs Discount Given (by Band)" subtitle="How much revenue vs. how much was discounted away, per band">
              <SalesVsDiscountChart data={data.bandPerformance} />
            </Panel>

            <Panel title="Top Markdown Opportunities" subtitle="High inventory value, low sell-through items">
              <DataTable columns={OPPORTUNITY_COLUMNS} rows={data.topOpportunities} paginate pageSize={10} emptyLabel="No marked-down items with stock on hand right now." />
            </Panel>
          </div>

          {data.meta?.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[11px]" style={{ color: hrh.ink2 }}>
                {data.meta.dataQuality.map((note, i) => (
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
