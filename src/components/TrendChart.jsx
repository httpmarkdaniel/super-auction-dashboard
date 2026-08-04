import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Card from "./primitives/Card";
import TrendBadge from "./primitives/TrendBadge";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

function formatValue(v, unit) {
  if (unit === "pct") return `${v}%`;
  if (unit === "currency") return formatPeso(v);
  if (unit === "ratio") return v.toFixed(2);
  return v.toLocaleString("en-PH");
}

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="floating px-3 py-2 text-[12.5px]">
      <div className="text-ink mb-0.5">{label}</div>
      <div className="tabular text-series1">{formatValue(payload[0].value, unit)}</div>
    </div>
  );
}

export default function TrendChart({ years, values, label, unit, trend }) {
  const palette = usePalette();
  const data = years.map((y, i) => ({ year: y, value: values[i] }));
  const latest = values[values.length - 1];

  return (
    <Card
      title={label}
      action={<TrendBadge trend={trend} />}
    >
      <div className="font-bold text-[24px] leading-none text-ink mb-2">{formatValue(latest, unit)}</div>
      <div className="h-[90px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="year"
              tick={{ fill: palette.muted, fontSize: 10.5 }}
              axisLine={{ stroke: palette.gridline }}
              tickLine={false}
            />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: palette.gridline }} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={palette.series1}
              strokeWidth={2}
              dot={{ r: 2.5, fill: palette.series1, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
