import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

function buildWaterfallData(rows) {
  let running = 0;
  return rows.map((r) => {
    if (r.type === "total") {
      running = r.value;
      return { ...r, base: 0, display: r.value };
    }
    if (r.type === "deduction") {
      running += r.value;
      return { ...r, base: running, display: Math.abs(r.value) };
    }
    return { ...r, base: 0, display: r.value };
  });
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="floating px-3.5 py-2.5 text-[13px]">
      <div className="text-ink font-medium mb-0.5">{d.stage}</div>
      <div className="tabular text-series1">
        {d.type === "deduction" ? "− " : ""}
        {formatPeso(Math.abs(d.value))}
      </div>
    </div>
  );
}

export default function MoneyFlowWaterfall({ data: moneyFlow, rangeLabel = "Today" }) {
  const palette = usePalette();
  const data = buildWaterfallData(moneyFlow);
  const colorFor = (type) =>
    type === "total" ? palette.series1 : type === "result" ? palette.good : palette.divNeg;

  return (
    <Card title={`Money Flow · ${rangeLabel}`} subtitle="Bid amount → deductions → vendor payable">
      <div className="h-[280px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 24, right: 8, left: -8, bottom: 4 }}>
            <XAxis
              dataKey="stage"
              tick={{ fill: palette.muted, fontSize: 12 }}
              axisLine={{ stroke: palette.gridline }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(127,127,127,0.06)" }} />
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="display" stackId="wf" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={colorFor(d.type)} />
              ))}
              <LabelList
                dataKey="display"
                position="top"
                formatter={(v) => formatPeso(v)}
                style={{ fill: palette.textSecondary, fontSize: 12 }}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
