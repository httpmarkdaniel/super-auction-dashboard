import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="floating px-3 py-2 text-[14px] leading-snug text-ink shadow-lg">
      <div className="text-muted text-[12.5px] mb-0.5">{label}</div>
      <div className="tabular font-semibold">{formatPeso(payload[0].value)}</div>
    </div>
  );
}

// Adaptive-grain settled Bid Amount trend — grain (daily/monthly) is
// decided server-side from the selected range's day-span (see
// api/overview.js's BID TREND query comment), never fixed to a rolling
// window on the frontend.
export default function BidTrendChart({ data, grain, rangeLabel, action }) {
  const palette = usePalette();
  const chartData = data.map((d) => ({
    label:
      grain === "month"
        ? new Date(`${d.bucket}T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "2-digit" })
        : new Date(`${d.bucket}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    bidAmount: d.bid_amount,
  }));

  return (
    <Card title={`Bid Trend · ${rangeLabel}`} subtitle="Settled (Paid & Released) hammer value" action={action}>
      {chartData.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-center text-muted text-[15px]">
          No settled activity in this period.
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="bidTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.series1} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={palette.series1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fill: palette.muted, fontSize: 11.5 }}
                axisLine={{ stroke: palette.gridline }}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: palette.gridline }} />
              <Area
                type="monotone"
                dataKey="bidAmount"
                stroke={palette.series1}
                strokeWidth={2}
                fill="url(#bidTrendFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
