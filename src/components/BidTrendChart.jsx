import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso, formatCompactPeso } from "../utils/format";

function parseBucketDate(bucket) {
  return new Date(`${bucket}T00:00:00`);
}

function bucketYear(bucket) {
  return String(bucket).slice(0, 4);
}

// Concise X-axis tick label — day: "Sep 1"; week: week-start "Aug 3";
// month: bare "Jan" unless the selected range crosses a year boundary (a
// Custom range spanning Dec-Jan), in which case "Jan 2026" to stay
// unambiguous — same cross-year rule as PeriodStackedBar's monthly labels.
function formatAxisLabel(bucket, bucketLabel, monthCrossesYears) {
  const d = parseBucketDate(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  if (bucketLabel === "month") {
    return monthCrossesYears
      ? d.toLocaleDateString("en-PH", { month: "short", year: "numeric" })
      : d.toLocaleDateString("en-PH", { month: "short" });
  }
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// Full bucket date/range for the tooltip header — day: "Sep 1, 2026";
// week: the full 7-day span "Aug 3 – Aug 9, 2026"; month: full month name
// "September 2026". Always unambiguous regardless of the axis tick's more
// compact form.
function formatTooltipLabel(bucket, bucketLabel) {
  const d = parseBucketDate(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  if (bucketLabel === "month") {
    return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  }
  if (bucketLabel === "week") {
    const end = new Date(d.getTime() + 6 * 86400000);
    const startLabel = d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
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

// Business-readable "nice" step set, two tiers per decade (1/1.5/2/2.5/3/
// 5/7.5/10 × 10^n) — closely matches the preferred BI levels (₱100K/₱200K/
// ₱300K/₱500K/₱750K/₱1M/₱1.5M/₱2M/₱2.5M/₱3M/₱5M) without hardcoding a
// fixed tick list for every dataset.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 5, 7.5, 10];

// Rounds a raw peso value to the nearest NICE_STEPS figure — used both for
// the single "top" tick near the data max and, below, to build the full
// tick lattice.
function niceRound(value) {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  for (let i = 0; i < NICE_STEPS.length; i++) {
    const step = NICE_STEPS[i];
    const nextMidpoint = i < NICE_STEPS.length - 1 ? (step + NICE_STEPS[i + 1]) / 2 : Infinity;
    if (normalized <= nextMidpoint) return step * magnitude;
  }
  return NICE_STEPS[NICE_STEPS.length - 1] * magnitude;
}

// Every NICE_STEPS × 10^n candidate across the top two magnitude decades
// at/below topTick — e.g. for a ~₱2M top tick this covers ₱100K..₱2M,
// exactly the range where readability matters; values far below that
// (₱1K, ₱10K …) would just clutter a chart whose real range starts
// around ₱100K. topTick itself is always included, even if it rounds up
// to the next magnitude (e.g. 10 × 10^n = 1 × 10^(n+1)).
function niceTickCandidates(topTick) {
  const topMagnitude = 10 ** Math.floor(Math.log10(topTick));
  const candidates = new Set([topTick]);
  for (const magnitude of [topMagnitude / 10, topMagnitude]) {
    for (const step of NICE_STEPS) {
      const value = step * magnitude;
      if (value <= topTick * 1.0001) candidates.add(value);
    }
  }
  return [...candidates].sort((a, b) => a - b);
}

// Picks up to `targetCount` nice values evenly spaced ACROSS THE NICE-
// NUMBER LATTICE below a top tick rounded to the actual data max (always
// keeping that top tick, so the axis never stops meaningfully short of —
// or floats far above — the real peak) — this is what fixes the
// ₱100K-straight-to-₱2M jump. The old version sampled evenly-spaced
// points in log1p space and rounded each independently to a coarse 1/2/5
// step, which for a ~₱2M max happened to round its two highest sample
// points to exactly ₱100K and ₱2M with nothing landing in between.
// Sampling from the lattice instead guarantees intermediate nice values
// (₱200K/₱300K/₱500K/₱1M/etc.) always appear when the range spans them.
function computeDisplayTicks(maxRawValue, targetCount = 6) {
  if (maxRawValue <= 0) return [0];
  const topTick = niceRound(maxRawValue);
  const candidates = niceTickCandidates(topTick);
  const lastIdx = candidates.length - 1;
  const picked = new Set([topTick]);
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.round((i / Math.max(targetCount - 1, 1)) * lastIdx);
    picked.add(candidates[idx]);
  }
  return [0, ...[...picked].sort((a, b) => a - b)];
}

// Full single-day snapshot — ONLY this day's numbers, never a cumulative/
// period total (see api/overview.js's BID TREND query comments: each row
// is genuinely that one calendar day, distinct bidder counts within it).
function DailyTooltip({ active, payload, bucketLabel }) {
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
      <div className="font-semibold text-[14px] mb-2 uppercase tracking-wide">{formatTooltipLabel(d.bucket, bucketLabel)}</div>

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
export default function BidTrendChart({ data, bucketLabel = "day", rangeLabel, action }) {
  const palette = usePalette();

  // Bucket grain (day/week/month) follows the selected dashboard date
  // preset — see api/overview.js's BID TREND comment and
  // api/_bucketing.js's pickBucketGrain. Every bucket in range is a real
  // row (zero-filled server-side), so the X-axis always shows EVERY
  // day/week/month — no tick-skipping — matching the requirement that a
  // Month to Date view never gets thinned down to weekly-looking ticks.
  const monthCrossesYears = bucketLabel === "month" && new Set(data.map((d) => bucketYear(d.bucket))).size > 1;

  // Once a daily-grain range gets visually dense (Custom ranges up to 31
  // days, or a near-end-of-month MTD), shrink the tick font and rotate
  // labels rather than hiding any date — every bucket must stay labeled.
  const isDenseDaily = bucketLabel === "day" && data.length > 20;
  const xAxisFontSize = isDenseDaily ? 9.5 : 11;
  const xAxisAngle = isDenseDaily ? -40 : 0;
  const xAxisTextAnchor = isDenseDaily ? "end" : "middle";
  const xAxisHeight = isDenseDaily ? 40 : 24;

  const maxBidAmount = data.reduce((max, d) => Math.max(max, d.bid_amount || 0), 0);
  const displayTicks = computeDisplayTicks(maxBidAmount).map(toDisplayY);
  const displayDomainMax = maxBidAmount > 0 ? toDisplayY(maxBidAmount) * 1.08 : 1;

  const grainWord = bucketLabel === "month" ? "Monthly" : bucketLabel === "week" ? "Weekly" : "Daily";
  const subtitle = (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span>{grainWord} settled (Paid & Released) hammer value</span>
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
                tickFormatter={(bucket) => formatAxisLabel(bucket, bucketLabel, monthCrossesYears)}
                interval={0}
                angle={xAxisAngle}
                textAnchor={xAxisTextAnchor}
                height={xAxisHeight}
                tick={{ fill: palette.muted, fontSize: xAxisFontSize }}
                axisLine={{ stroke: palette.gridline }}
                tickLine={false}
                minTickGap={0}
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
              <Tooltip content={<DailyTooltip bucketLabel={bucketLabel} />} cursor={{ stroke: palette.series1, strokeWidth: 1, strokeDasharray: "4 4" }} />
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
