import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import BiddingPaceHourlyTooltip from "./primitives/BiddingPaceHourlyTooltip";

// Display-only: "7AM" -> "7 AM". The underlying hour label (from
// src/utils/hourlyBidderDetail.js's shared HOUR_LABELS) is left as-is so
// this still keys correctly into hourlyDetail — only the rendered text
// gets the space, never the data itself.
function spaceHour(label) {
  return typeof label === "string" ? label.replace(/(AM|PM)$/, " $1") : label;
}

function makeCustomTooltip(hourlyDetail) {
  return function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return <BiddingPaceHourlyTooltip label={spaceHour(label)} detail={hourlyDetail?.[label]} />;
  };
}

// Bidding Pace's own stock-market-style hourly chart — same visual
// language as BidTrendChart (continuous line, subtle area fill, hover
// crosshair, emphasized active point, minimal grid), but the plotted
// series is DISTINCT AUCTION EVENTS per hour, not peso Bid Amount (see
// api/bidding-pace.js's auction_count query comment) — Bidding Pace is
// framed around auction activity, not bid value.
export default function BiddingPaceHourlyTrend({ data: hourlyTrend, rangeLabel = "Today", hourlyDetail }) {
  const palette = usePalette();
  const CustomTooltip = makeCustomTooltip(hourlyDetail);

  return (
    <Card title={`${rangeLabel} Pace · Auction Activity by Hour`} subtitle="Distinct auctions with bidding activity, per hour">
      {hourlyTrend.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-center text-muted text-[15px]">
          No bidding activity in this period.
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="paceAuctionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.series1} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={palette.series1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={palette.gridline} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="hour"
                tickFormatter={spaceHour}
                tick={{ fill: palette.muted, fontSize: 11 }}
                axisLine={{ stroke: palette.gridline }}
                tickLine={false}
                minTickGap={14}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: palette.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={([dataMin, dataMax]) => {
                  if (dataMax <= 0) return [0, 1];
                  const pad = Math.max(Math.ceil((dataMax - dataMin) * 0.15), 1);
                  return [Math.max(0, dataMin - pad), dataMax + pad];
                }}
                allowDataOverflow={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: palette.series1, strokeWidth: 1, strokeDasharray: "4 4" }} />
              <Area
                type="linear"
                dataKey="auctionCount"
                stroke={palette.series1}
                strokeWidth={2}
                fill="url(#paceAuctionFill)"
                dot={{ r: 2.5, strokeWidth: 0, fill: palette.series1 }}
                activeDot={{ r: 5.5, strokeWidth: 2, stroke: "#fff", fill: palette.series1 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
