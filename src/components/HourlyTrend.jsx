import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import HourlyBidderTooltip from "./primitives/HourlyBidderTooltip";

// hourlyDetail is optional: a lookup (src/utils/hourlyBidderDetail.js) of
// per-hour Participating/Winning bidder breakdown, keyed by the same hour
// label used on the x-axis. When absent, the tooltip falls back to a plain
// Bid Amount line — CategoryView's usage is unaffected by this file's
// richer Overview/Bidding Pace tooltip.
function makeCustomTooltip(hourlyDetail) {
  return function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <HourlyBidderTooltip
        label={label}
        bidAmount={payload[0].value}
        detail={hourlyDetail?.[label]}
      />
    );
  };
}

export default function HourlyTrend({ data: hourlyTrend, rangeLabel = "Today", hourlyDetail }) {
  const palette = usePalette();
  const CustomTooltip = makeCustomTooltip(hourlyDetail);
  return (
    <Card title={`${rangeLabel} Pace · Bid Amount by Hour`} subtitle="All bid events · regardless of status">
      {hourlyTrend.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-center text-muted text-[15px]">
          No bidding activity in this period.
        </div>
      ) : (
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hourlyTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.series1} stopOpacity={0.25} />
                <stop offset="100%" stopColor={palette.series1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
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
              fill="url(#paceFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </Card>
  );
}
