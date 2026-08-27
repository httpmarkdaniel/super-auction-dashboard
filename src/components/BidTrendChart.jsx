import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso, formatCompactPeso } from "../utils/format";

function formatDayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// Full single-day snapshot — ONLY this day's numbers, never a cumulative/
// period total (see api/overview.js's BID TREND query comments: each row
// is genuinely that one calendar day, distinct bidder counts within it).
function DailyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const p = d.participating;
  const w = d.winning;
  const pTotalAmount = p.new_amount + p.returning_amount;
  const wTotalAmount = w.new_amount + w.returning_amount;
  const pNewShare = pTotalAmount > 0 ? (p.new_amount / pTotalAmount) * 100 : 0;
  const pReturningShare = pTotalAmount > 0 ? (p.returning_amount / pTotalAmount) * 100 : 0;
  const wNewShare = wTotalAmount > 0 ? (w.new_amount / wTotalAmount) * 100 : 0;
  const wReturningShare = wTotalAmount > 0 ? (w.returning_amount / wTotalAmount) * 100 : 0;

  return (
    <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg min-w-[260px]">
      <div className="font-semibold text-[14px] mb-2 uppercase tracking-wide">{formatDayLabel(d.bucket)}</div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2.5 pb-2.5 border-b border-gridline">
        <div>
          <div className="text-muted text-[11.5px]">Total Bid Amount</div>
          <div className="tabular font-semibold text-series1">{formatPeso(d.bid_amount)}</div>
        </div>
        <div>
          <div className="text-muted text-[11.5px]">Auctions Concluded</div>
          <div className="tabular font-medium">{d.auctions_concluded}</div>
        </div>
        <div>
          <div className="text-muted text-[11.5px]">Lots Sold</div>
          <div className="tabular font-medium">{d.lots_sold}</div>
        </div>
      </div>

      <div className="mb-2">
        <div className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-0.5">
          Participating Bidders — {p.new + p.returning}
        </div>
        <div className="text-[12px] text-muted mb-0.5">{p.new} New · {p.returning} Returning</div>
        <div className="tabular text-[12.5px]">
          {formatCompactPeso(pTotalAmount)} activity — New {pNewShare.toFixed(1)}% · Returning {pReturningShare.toFixed(1)}%
        </div>
      </div>

      <div>
        <div className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-0.5">
          Winning Bidders — {w.new + w.returning}
        </div>
        <div className="text-[12px] text-muted mb-0.5">{w.new} New · {w.returning} Returning</div>
        <div className="tabular text-[12.5px]">
          {formatCompactPeso(wTotalAmount)} value — New {wNewShare.toFixed(1)}% · Returning {wReturningShare.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

// Daily settled Bid Amount trend, stock-chart styled — continuous line
// with a subtle area fill, no candlesticks. Each point is a single
// calendar day's SETTLED value (never cumulative), so real day-to-day
// fluctuation is visible. Hovering shows that day's complete snapshot —
// see DailyTooltip above.
export default function BidTrendChart({ data, rangeLabel, action }) {
  const palette = usePalette();

  // Thin out rendered X-axis TICKS only (not the underlying hoverable
  // data) once a range gets visually dense — e.g. a Year to Date range
  // with ~250+ trading-style days shouldn't print an unreadable label for
  // every single point, but every point stays hoverable.
  const tickInterval = data.length > 60 ? Math.ceil(data.length / 30) : data.length > 20 ? 2 : 0;

  return (
    <Card title={`Bid Trend · ${rangeLabel}`} subtitle="Daily settled (Paid & Released) hammer value" action={action}>
      {data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-center text-muted text-[15px]">
          No settled activity in this period.
        </div>
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="bidTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.series1} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={palette.series1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={palette.gridline} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={formatDayLabel}
                interval={tickInterval}
                tick={{ fill: palette.muted, fontSize: 11 }}
                axisLine={{ stroke: palette.gridline }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tickFormatter={(v) => formatCompactPeso(v)}
                tick={{ fill: palette.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<DailyTooltip />} cursor={{ stroke: palette.series1, strokeWidth: 1, strokeDasharray: "3 3" }} />
              <Area
                type="monotone"
                dataKey="bid_amount"
                stroke={palette.series1}
                strokeWidth={2}
                fill="url(#bidTrendFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: palette.series1, fill: "#fff" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
