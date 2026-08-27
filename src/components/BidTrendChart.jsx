import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso, formatCompactPeso } from "../utils/format";

function formatDayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// Y-POSITION-ONLY transform — never touches the real bid_amount used by the
// tooltip, totals, or any calculation. A large settlement day (e.g. ₱1.8M)
// would otherwise flatten every smaller day against zero on a linear axis;
// log1p compresses the visual distance between big and small values while
// keeping every value's relative ORDER intact, and log1p(0) = 0 so a
// genuine zero day still sits exactly at the baseline (no fake positive
// floor, unlike a plain log scale which can't represent zero at all).
function toDisplayY(value) {
  return Math.log1p(Math.max(0, value));
}
function fromDisplayY(value) {
  return Math.expm1(Math.max(0, value));
}

// Round a raw peso value to a "nice" 1/2/5 x 10^n figure for tick labels —
// same convention chart libraries use for linear axes, applied here to the
// INVERSE-transformed tick positions so the labels stay human-readable
// pesos even though they're evenly spaced in log1p space, not peso space.
function niceRound(value) {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return niceNormalized * magnitude;
}

// Evenly-spaced steps in TRANSFORMED (log1p) space, each inverse-transformed
// and rounded to a nice peso figure — gives ticks like ₱0 / ₱10K / ₱50K /
// ₱250K / ₱1M / ₱2M that visually correspond to equal vertical spacing.
function computeDisplayTicks(maxRawValue, targetCount = 5) {
  if (maxRawValue <= 0) return [0];
  const maxDisplay = toDisplayY(maxRawValue);
  const raw = new Set([0]);
  for (let i = 1; i <= targetCount; i++) {
    const nice = niceRound(fromDisplayY((maxDisplay / targetCount) * i));
    if (nice > 0) raw.add(nice);
  }
  return [...raw].sort((a, b) => a - b);
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
  // every single point, but every point stays hoverable and every day is
  // still plotted (the date filter controls the RANGE, chart width only
  // controls LABEL density — see api/overview.js's zero-fill comment for
  // why the underlying daily grain never changes with range length).
  // Recharts' numeric `interval` skips that many ticks between renders
  // (0 = every tick), so these targets are picked to land near the
  // day-count bands below, then minTickGap does final collision cleanup.
  const days = data.length;
  const tickInterval =
    days <= 7 ? 0 : // label every day
    days <= 31 ? 3 : // ~every 4 days
    days <= 90 ? 6 : // ~weekly
    days <= 180 ? 13 : // ~every 2 weeks
    29; // sparse, ~month boundaries

  const maxBidAmount = data.reduce((max, d) => Math.max(max, d.bid_amount || 0), 0);
  const displayTicks = computeDisplayTicks(maxBidAmount).map(toDisplayY);
  const displayDomainMax = maxBidAmount > 0 ? toDisplayY(maxBidAmount) * 1.08 : 1;

  const subtitle = (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span>Daily settled (Paid & Released) hammer value</span>
      <span className="relative inline-flex items-center group/tip">
        <span className="text-[12px] font-semibold text-muted border border-gridline rounded px-1.5 py-0.5 cursor-default">
          Adjusted scale
        </span>
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full mt-1.5 w-64 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        >
          <div className="methodology px-3 py-2 text-[13px] leading-snug shadow-lg text-left">
            Vertical spacing is adjusted to make smaller daily movements visible. Hover a point for its exact value.
          </div>
        </div>
      </span>
    </span>
  );

  return (
    <Card title={`Bid Trend · ${rangeLabel}`} subtitle={subtitle} action={action}>
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
                type="category"
                padding={{ left: 0, right: 0 }}
                tickFormatter={formatDayLabel}
                interval={tickInterval}
                tick={{ fill: palette.muted, fontSize: 11 }}
                axisLine={{ stroke: palette.gridline }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                type="number"
                domain={[0, displayDomainMax]}
                ticks={displayTicks}
                // Ticks are positioned in transformed (log1p) space for
                // even visual spacing, but every label is inverse-
                // transformed back to a real peso figure — the Y-axis
                // never shows a raw log value, only pesos.
                tickFormatter={(v) => formatCompactPeso(fromDisplayY(v))}
                tick={{ fill: palette.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                allowDataOverflow={false}
              />
              <Tooltip content={<DailyTooltip />} cursor={{ stroke: palette.series1, strokeWidth: 1, strokeDasharray: "4 4" }} />
              <Area
                type="linear"
                // Y-POSITION ONLY — Recharts' Tooltip `payload` always
                // carries the full original row regardless of how this
                // value is computed, so DailyTooltip above keeps reading
                // the real d.bid_amount untouched. See toDisplayY comment.
                dataKey={(d) => toDisplayY(d.bid_amount)}
                stroke={palette.series1}
                strokeWidth={2}
                fill="url(#bidTrendFill)"
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
