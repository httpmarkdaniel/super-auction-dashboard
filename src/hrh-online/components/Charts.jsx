import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { hrh } from "../theme";
import { formatCompactPeso } from "../format";

// Plain-DOM axis titles, laid out entirely outside the chart's SVG — avoids
// recharts' in-SVG axis `label` prop, which shares drawing space with tick
// text/bars and overlaps them no matter how margins/offsets are tuned.
// yAxisLabel gets its own fixed-width column to the chart's left; xAxisLabel
// gets its own row below it. Neither can ever collide with chart content
// since they're separate boxes in normal document flow.
function ChartWithAxisTitles({ xAxisLabel, yAxisLabel, children }) {
  if (!xAxisLabel && !yAxisLabel) return children;
  return (
    <div className="flex items-stretch">
      {yAxisLabel && (
        <div className="shrink-0 flex items-center justify-center overflow-visible" style={{ width: 18 }}>
          <span className="whitespace-nowrap text-[11px]" style={{ color: hrh.ink2, transform: "rotate(-90deg)" }}>
            {yAxisLabel}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        {children}
        {xAxisLabel && (
          <div className="text-center text-[11px] mt-1" style={{ color: hrh.ink2 }}>
            {xAxisLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span style={{ color: "#a3adba" }}>{p.name}:</span>
          <span className="font-semibold">{valueFormatter ? valueFormatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// GMV/NMV-style multi-series time trend. series: [{ key, name, color? }]
export function TrendChart({ data, series, xKey = "label", height = 260, valueFormatter = formatCompactPeso }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={valueFormatter} width={64} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || hrh.series[i % hrh.series.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
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
          <span className="font-semibold">{p.dataKey === "gmv" ? formatCompactPeso(p.value) : p.value.toLocaleString("en-PH")}</span>
        </div>
      ))}
    </div>
  );
}

// GMV (line, left axis, pesos) + Orders (bars, right axis, whole-number
// count) on one combined time-series chart — two genuinely different units,
// so two independent y-axes rather than forcing one scale or normalizing to
// percentages. `data`: [{ dateLabel, gmv, orders }].
export function SalesTrendComboChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis yAxisId="gmv" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={formatCompactPeso} width={60} />
        <YAxis
          yAxisId="orders"
          orientation="right"
          tick={{ fontSize: 11, fill: hrh.ink2 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={36}
        />
        <Tooltip content={<ComboTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* hrh.series[1] is the same orange as hrh.accent — using it here
            made the Orders bars visually indistinguishable from the GMV
            line. Blue bars / orange line instead, clearly distinct. */}
        <Bar yAxisId="orders" dataKey="orders" name="Orders" fill={hrh.blue} radius={[2, 2, 0, 0]} maxBarSize={24} />
        <Line yAxisId="gmv" type="monotone" dataKey="gmv" name="GMV" stroke={hrh.accent} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Bar + line on one shared axis for two same-unit series (e.g. New vs
// Returning customer counts) — unlike SalesTrendComboChart's GMV/Orders
// pair, these don't need separate y-axes since they're already the same
// unit (a plain count).
export function ComboBarLineChart({ data, xKey, barKey, barName, barColor, lineKey, lineName, lineColor, height = 260, valueFormatter = formatCompactPeso }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={valueFormatter} width={48} allowDecimals={false} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey={barKey} name={barName} fill={barColor} radius={[2, 2, 0, 0]} maxBarSize={28} />
        <Line type="monotone" dataKey={lineKey} name={lineName} stroke={lineColor} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Area trend for same-unit series on one shared axis (e.g. Order Value vs.
// Discount Value). `stacked` (default false) draws each area independently,
// overlapping with partial opacity so both are readable at once — turn it
// on only when the series are meant to be read as parts of one whole (e.g.
// "Order Value + Discount Value = original list price"), since a stack
// makes each individual series' own shape harder to read.
// `categories`: [{ key, name, color }]. `tooltipContent` lets a caller
// override the default per-series ChartTooltip (e.g. SalesAnalytics.jsx's
// VoucherTrendTooltip, which derives AOV from the underlying data row
// instead of showing raw series values). `xAxisLabel`/`yAxisLabel` add a
// titled axis (extra margin is added automatically so the title has room).
export function StackedAreaChart({
  data,
  categories,
  xKey = "label",
  height = 260,
  valueFormatter = formatCompactPeso,
  tooltipContent,
  stacked = false,
  xAxisLabel,
  yAxisLabel,
}) {
  const TooltipContent = tooltipContent || ChartTooltip;
  return (
    <ChartWithAxisTitles xAxisLabel={xAxisLabel} yAxisLabel={yAxisLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={hrh.border} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={valueFormatter} width={64} />
          <Tooltip content={<TooltipContent valueFormatter={valueFormatter} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map((c, i) => (
            <Area
              key={c.key}
              type="monotone"
              dataKey={c.key}
              name={c.name}
              stackId={stacked ? "1" : undefined}
              stroke={c.color || hrh.series[i % hrh.series.length]}
              fill={c.color || hrh.series[i % hrh.series.length]}
              fillOpacity={0.3}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartWithAxisTitles>
  );
}

// Donut share breakdown with a centered total and a metric-list legend —
// same `segments` shape ShareBar already uses ([{ label, value, color }]),
// just a ring instead of a strip for panels that want the more prominent
// "total in the middle" treatment (Sales by Channel, Order Status).
export function DonutChart({ segments, centerValue, centerLabel, size = 132 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="grid gap-4 items-center" style={{ gridTemplateColumns: `${size}px 1fr` }}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie data={segments} dataKey="value" nameKey="label" innerRadius={size * 0.33} outerRadius={size * 0.5} startAngle={90} endAngle={-270} stroke="none">
            {segments.map((s) => (
              <Cell key={s.label} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip valueFormatter={(v) => `${((v / total) * 100).toFixed(1)}%`} />} />
        </PieChart>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
            {centerValue && (
              <div className="text-[14px] font-bold leading-tight" style={{ color: hrh.ink }}>
                {centerValue}
              </div>
            )}
            {centerLabel && (
              <div className="text-[10px] leading-tight" style={{ color: hrh.muted }}>
                {centerLabel}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: hrh.ink2 }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-semibold shrink-0" style={{ color: hrh.ink }}>
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Channel/category comparison bars. series: [{ key, name, color? }].
// `tooltipContent` lets a caller override the default ChartTooltip (e.g.
// SalesAnalytics.jsx's OtherBreakdownTooltip, which names the real
// categories/subcategories hidden behind an "Other" bar).
export function BarComparisonChart({
  data,
  series,
  xKey = "label",
  height = 260,
  valueFormatter = formatCompactPeso,
  tooltipContent,
  xAxisLabel,
  yAxisLabel,
}) {
  const TooltipContent = tooltipContent || ChartTooltip;
  return (
    <ChartWithAxisTitles xAxisLabel={xAxisLabel} yAxisLabel={yAxisLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={hrh.border} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={valueFormatter} width={64} />
          <Tooltip content={<TooltipContent valueFormatter={valueFormatter} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || hrh.series[i % hrh.series.length]} radius={[2, 2, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartWithAxisTitles>
  );
}
