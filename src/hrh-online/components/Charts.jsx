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
import { formatCompactPeso, formatNum } from "../format";

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
// `xAxisAngle`/`xAxisInterval` are opt-in (undefined by default, matching
// every existing caller's behavior exactly) — for a panel with few, longer
// tick labels that would otherwise overlap or get silently skipped by
// Recharts' auto-thinning, pass e.g. xAxisAngle={-30} xAxisInterval={0} to
// force every label to render, angled so it doesn't collide with its
// neighbors. `xAxisHeight` grows the axis band to fit the angled text.
export function TrendChart({
  data,
  series,
  xKey = "label",
  height = 260,
  valueFormatter = formatCompactPeso,
  xAxisAngle,
  xAxisInterval,
  xAxisHeight,
}) {
  const angled = typeof xAxisAngle === "number" && xAxisAngle !== 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: angled ? 12 : 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: hrh.ink2 }}
          axisLine={{ stroke: hrh.border }}
          tickLine={false}
          angle={xAxisAngle}
          textAnchor={angled ? "end" : "middle"}
          interval={xAxisInterval}
          height={xAxisHeight}
        />
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

// GMV (line, left axis, pesos) + Orders/Units (stacked bars, right axis,
// whole-number counts) on one combined time-series chart — GMV is a
// genuinely different unit (pesos) from the other two, so it keeps its own
// left axis rather than forcing one scale; Orders and Units are both
// "count" so they share the right axis and stack into one bar per bucket.
// `data`: [{ dateLabel, gmv, orders, units }]. `tooltipContent` lets a
// caller override the default ComboTooltip (e.g. ExecutiveOverview.jsx's
// SalesTrendChannelTooltip, which adds a per-channel GMV breakdown) —
// every other existing caller is unaffected by the default.
export function SalesTrendComboChart({ data, height = 260, tooltipContent }) {
  const TooltipContent = tooltipContent || ComboTooltip;
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
        <Tooltip content={<TooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* Grouped (not stacked) bars — Orders and Units Sold are each their
            own whole count, not parts of one total, so stacking them would
            misrepresent the combined bar height as a meaningful sum. */}
        <Bar yAxisId="orders" dataKey="orders" name="Orders" fill={hrh.series[0]} radius={[2, 2, 0, 0]} maxBarSize={20} />
        <Bar yAxisId="orders" dataKey="units" name="Units Sold" fill={hrh.accent} radius={[2, 2, 0, 0]} maxBarSize={20} />
        <Line yAxisId="gmv" type="monotone" dataKey="gmv" name="GMV" stroke={hrh.good} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function FulfillmentTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span style={{ color: "#a3adba" }}>{p.name}:</span>
          <span className="font-semibold">{p.dataKey === "completionRate" ? `${p.value.toFixed(1)}%` : p.value.toLocaleString("en-PH")}</span>
        </div>
      ))}
    </div>
  );
}

// Fulfilled/Cancelled/Awaiting (stacked bars, left axis, whole-number
// counts) + Completion Rate (line, right axis, %) — same "GMV + Orders"
// combo pattern as SalesTrendComboChart, applied to Orders & Fulfillment's
// own metrics instead. `data`: [{ dateLabel, fulfilled, cancelled,
// awaiting, completionRate }].
export function FulfillmentTrendComboChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis yAxisId="count" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
        <YAxis
          yAxisId="rate"
          orientation="right"
          tick={{ fontSize: 11, fill: hrh.ink2 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
          width={44}
        />
        <Tooltip content={<FulfillmentTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="count" dataKey="fulfilled" name="Fulfilled" stackId="orders" fill={hrh.good} radius={[0, 0, 0, 0]} maxBarSize={24} />
        <Bar yAxisId="count" dataKey="cancelled" name="Cancelled" stackId="orders" fill={hrh.bad} radius={[0, 0, 0, 0]} maxBarSize={24} />
        <Bar yAxisId="count" dataKey="awaiting" name="Awaiting" stackId="orders" fill={hrh.muted} radius={[2, 2, 0, 0]} maxBarSize={24} />
        <Line yAxisId="rate" type="monotone" dataKey="completionRate" name="Completion Rate" stroke={hrh.accent} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function RateTrendTooltip({ active, payload, label, barKeys }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span style={{ color: "#a3adba" }}>{p.name}:</span>
          <span className="font-semibold">{barKeys.includes(p.dataKey) ? p.value.toLocaleString("en-PH") : `${p.value.toFixed(1)}%`}</span>
        </div>
      ))}
    </div>
  );
}

// Generic "count bars + rate line" combo — one or two count series on the
// left axis (grouped, not stacked, when there are two — e.g. Received vs
// Cancelled aren't parts of one whole the way Fulfilled/Cancelled/Awaiting
// are) plus a single rate line (%) on the right axis. Used by Orders &
// Fulfillment's Cancellation and Returns tabs so each gets the same
// trend-chart treatment as Fulfillment Performance without duplicating
// that chart's stacked-parts semantics, which don't apply here. `bars`:
// [{ key, name, color }] (1-2 entries). `rateKey`/`rateName`: the line.
export function RateTrendComboChart({ data, bars, rateKey, rateName, height = 260 }) {
  const barKeys = bars.map((b) => b.key);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis yAxisId="count" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
        <YAxis
          yAxisId="rate"
          orientation="right"
          tick={{ fontSize: 11, fill: hrh.ink2 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
          width={44}
        />
        <Tooltip content={<RateTrendTooltip barKeys={barKeys} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b) => (
          <Bar key={b.key} yAxisId="count" dataKey={b.key} name={b.name} fill={b.color} radius={[2, 2, 0, 0]} maxBarSize={24} />
        ))}
        <Line yAxisId="rate" type="monotone" dataKey={rateKey} name={rateName} stroke={hrh.accent} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Groups the bar's own value with its paired `${key}__line` value (read
// straight off the full data row via `p.payload`, not off a rendered Line
// series — this works whether or not a Line is actually plotted, so the
// secondary metric can live in the tooltip only, per explicit request,
// without an extra visual layer on the chart itself).
function PairedComboTooltip({ active, payload, label, barValueFormatter, lineValueFormatter, lineLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md px-3 py-2 text-[12px] max-w-[300px]" style={{ background: hrh.navy, border: `1px solid ${hrh.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => {
        const key = p.dataKey.replace(/__bar$/, "");
        const lineValue = p.payload?.[`${key}__line`];
        return (
          <div key={p.dataKey} className="mb-1 last:mb-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="truncate font-semibold">{p.name}</span>
            </div>
            <div className="ml-3.5 flex items-center justify-between gap-4" style={{ color: "#a3adba" }}>
              <span>Discount Value:</span>
              <span className="font-semibold" style={{ color: "#fff" }}>
                {barValueFormatter(p.value)}
              </span>
            </div>
            {lineValue !== undefined && (
              <div className="ml-3.5 flex items-center justify-between gap-4" style={{ color: "#a3adba" }}>
                <span>{lineLabel}:</span>
                <span className="font-semibold" style={{ color: "#fff" }}>
                  {lineValueFormatter(lineValue)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Every series is a grouped bar (left-axis metric); a second, different-
// unit metric per series (e.g. a count alongside a peso value) rides
// along in `${key}__line` and shows up grouped under its bar in the
// tooltip (see PairedComboTooltip) WITHOUT its own plotted line — set
// `showLines` to actually draw those as lines on a second right-hand axis
// instead (same color as their bar) when both metrics should be visible
// on the chart itself, not just on hover. Deliberately dense (used with up
// to ~7 series, per explicit request). `series`: [{key, name, color}] —
// `data` rows must carry `${key}__bar` and `${key}__line` fields (see
// SalesAnalytics.jsx's per-voucher merge).
export function PairedBarLineChart({
  data,
  series,
  xKey = "label",
  height = 280,
  barValueFormatter = formatCompactPeso,
  lineValueFormatter = formatNum,
  lineLabel = "Orders",
  lineName = (name) => `${name} (${lineLabel})`,
  showLines = false,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis yAxisId="bar" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={barValueFormatter} width={60} />
        {showLines && (
          <YAxis
            yAxisId="line"
            orientation="right"
            tick={{ fontSize: 11, fill: hrh.ink2 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={lineValueFormatter}
            allowDecimals={false}
            width={44}
          />
        )}
        <Tooltip content={<PairedComboTooltip barValueFormatter={barValueFormatter} lineValueFormatter={lineValueFormatter} lineLabel={lineLabel} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar key={`${s.key}__bar`} yAxisId="bar" dataKey={`${s.key}__bar`} name={s.name} fill={s.color} radius={[2, 2, 0, 0]} maxBarSize={18} />
        ))}
        {showLines &&
          series.map((s) => (
            <Line
              key={`${s.key}__line`}
              yAxisId="line"
              dataKey={`${s.key}__line`}
              name={lineName(s.name)}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              legendType="none"
            />
          ))}
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
// `tooltipContent` lets a caller override the default ChartTooltip.
// `horizontal` (default false) lays the bars on their side — category
// names run down the Y axis (self-explanatory as tick labels, so no
// separate axis title needed there) and the value axis moves to the
// bottom. In that mode `xAxisLabel` describes the bottom (value) axis,
// since ChartWithAxisTitles is purely positional (bottom/left), not aware
// of which axis holds which meaning. `stacked` (default false, vertical
// mode only) stacks every series into one bar per bucket instead of
// grouping them side by side — for series that are genuinely parts of one
// whole (e.g. per-channel GMV summing to total GMV), same "stacked" concept
// StackedAreaChart already offers for areas. Only the topmost series in
// the stack gets rounded top corners; the rest stay square so they read
// as one continuous bar, not separate rounded blocks.
export function BarComparisonChart({
  data,
  series,
  xKey = "label",
  height = 260,
  valueFormatter = formatCompactPeso,
  tooltipContent,
  xAxisLabel,
  yAxisLabel,
  horizontal = false,
  stacked = false,
}) {
  const TooltipContent = tooltipContent || ChartTooltip;
  if (horizontal) {
    const categoryWidth = Math.max(72, ...data.map((d) => String(d[xKey] ?? "").length * 6 + 16));
    return (
      <ChartWithAxisTitles xAxisLabel={xAxisLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={hrh.border} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={valueFormatter} />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 11, fill: hrh.ink2 }}
              axisLine={{ stroke: hrh.border }}
              tickLine={false}
              width={categoryWidth}
            />
            <Tooltip content={<TooltipContent valueFormatter={valueFormatter} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || hrh.series[i % hrh.series.length]} radius={[0, 2, 2, 0]} maxBarSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWithAxisTitles>
    );
  }
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
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId={stacked ? "1" : undefined}
              fill={s.color || hrh.series[i % hrh.series.length]}
              radius={stacked && i < series.length - 1 ? [0, 0, 0, 0] : [2, 2, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartWithAxisTitles>
  );
}
