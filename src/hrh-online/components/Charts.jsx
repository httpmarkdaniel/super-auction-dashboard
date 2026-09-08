import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
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
