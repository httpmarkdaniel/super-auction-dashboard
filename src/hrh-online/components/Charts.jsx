import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
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
        <Bar yAxisId="orders" dataKey="orders" name="Orders" fill={hrh.series[1]} radius={[2, 2, 0, 0]} maxBarSize={24} />
        <Line yAxisId="gmv" type="monotone" dataKey="gmv" name="GMV" stroke={hrh.accent} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
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

// Channel/category comparison bars. series: [{ key, name, color? }]
export function BarComparisonChart({ data, series, xKey = "label", height = 260, valueFormatter = formatCompactPeso }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={hrh.border} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={{ stroke: hrh.border }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: hrh.ink2 }} axisLine={false} tickLine={false} tickFormatter={valueFormatter} width={64} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || hrh.series[i % hrh.series.length]} radius={[2, 2, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
