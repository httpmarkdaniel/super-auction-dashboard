import { useState } from "react";
import { formatManila, formatManilaFromEpochMs, manilaToEpochMs, timeRemainingLabel } from "../../utils/manilaTime";

function clampPct(v) {
  return Math.min(100, Math.max(0, v));
}

// Floating hover card for one milestone/track summary — same `.floating`
// hover-card language used everywhere else in the dashboard (EntityBreakdownRow,
// BidTrendChart), anchored at a clamped horizontal position so it never
// overflows the card on either edge regardless of which milestone (0%-100%)
// triggered it.
function TimelineTip({ anchorPct, eyebrow, lines }) {
  const left = Math.min(88, Math.max(12, anchorPct));
  return (
    <div
      className="absolute bottom-full mb-2 -translate-x-1/2 z-30 pointer-events-none"
      style={{ left: `${left}%` }}
    >
      <div className="floating px-3 py-2 text-[12.5px] leading-tight whitespace-nowrap shadow-lg">
        <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">{eyebrow}</div>
        {lines.map((line, i) => (
          <div key={i} className={i === 0 ? "text-ink font-medium tabular" : "text-muted tabular"}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

// Auction-LEVEL timeline — a horizontal track spanning this auction's
// timeline start to its ending time, with milestone dots placed at their
// REAL proportional positions (never evenly spaced): Timeline Start →
// Official Auction Start (only when real pre-bidding pushed the timeline
// earlier) → Current → Ending Time. Plots exactly one thing, elapsed TIME —
// distinct from BidActivityBar (unchanged, still used inside each
// individual lot for its own bid-event-by-bid-event history) and from Bid
// Events/Avg Bids/Unique Bidder, which stay separate metrics entirely.
//
// timelineStart reuses the EXACT SAME LEAST(official starting_time,
// earliest real bid event) semantics already validated for the per-lot
// timeline (see api/live-auction-detail.js's timeline_start comment,
// api/live-auctions.js's own copy of that formula) — never redefined here.
//
// Every value shown (including the track-wide hover summary) comes from
// props already loaded with this auction's payload — no API call on hover.
export default function AuctionProgressBar({ auctionNumber, auctionName, timelineStart, officialStartTime, endingTime }) {
  const [hoverKey, setHoverKey] = useState(null); // 'start' | 'official' | 'now' | 'end' | 'track' | null

  const startMs = manilaToEpochMs(timelineStart);
  const endMs = manilaToEpochMs(endingTime);
  const officialStartMs = manilaToEpochMs(officialStartTime);
  const span = startMs != null && endMs != null && endMs > startMs ? endMs - startMs : null;

  if (!span) {
    return <div className="text-[13px] text-muted">Timeline unavailable.</div>;
  }

  const nowMs = Date.now();
  const nowPct = clampPct(((nowMs - startMs) / span) * 100);
  const hadPreBidding = officialStartMs != null && startMs < officialStartMs;
  const officialStartPct = hadPreBidding ? clampPct(((officialStartMs - startMs) / span) * 100) : null;
  const ended = nowMs >= endMs;
  const remainingText = ended ? "Ended" : timeRemainingLabel(endingTime).replace(/ left$/, " remaining");

  const tips = {
    start: { eyebrow: "TIMELINE START", lines: [formatManila(timelineStart, { withYear: true })] },
    official: { eyebrow: "OFFICIAL AUCTION START", lines: [formatManila(officialStartTime, { withYear: true })] },
    now: {
      eyebrow: "CURRENT",
      lines: [formatManilaFromEpochMs(nowMs, { withYear: true }), `${nowPct.toFixed(0)}% elapsed`],
    },
    end: { eyebrow: "ENDING TIME", lines: [formatManila(endingTime, { withYear: true }), remainingText] },
    track: {
      eyebrow: auctionName ? `${auctionNumber} · ${auctionName}` : auctionNumber || "AUCTION TIMELINE",
      lines: [
        `Timeline Start ${formatManila(timelineStart)}`,
        ...(hadPreBidding ? [`Official Start ${formatManila(officialStartTime)}`] : []),
        `Current ${formatManilaFromEpochMs(nowMs)}`,
        `Ending Time ${formatManila(endingTime)}`,
        `${nowPct.toFixed(0)}% elapsed · ${remainingText}`,
      ],
    },
  };

  const active = hoverKey ? tips[hoverKey] : null;
  const activeAnchor =
    hoverKey === "start" ? 0 : hoverKey === "official" ? officialStartPct : hoverKey === "now" ? nowPct : hoverKey === "end" ? 100 : 50;

  return (
    <div className="relative pb-1">
      <div
        className="relative h-3 rounded-full bg-plane border border-gridline overflow-visible cursor-default"
        onMouseEnter={() => setHoverKey("track")}
        onMouseLeave={() => setHoverKey(null)}
      >
        {/* Elapsed section — filled but deliberately subtle; the Current dot
            below, not this fill, is the most visually prominent element. */}
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-series1/60 transition-[width]"
          style={{ width: `${nowPct}%` }}
        />

        {/* Timeline Start (0%) */}
        <button
          type="button"
          onMouseEnter={() => setHoverKey("start")}
          onMouseLeave={() => setHoverKey("track")}
          onFocus={() => setHoverKey("start")}
          onBlur={() => setHoverKey(null)}
          className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-navy/50 bg-plane z-10"
          aria-label={`Timeline start · ${formatManila(timelineStart, { withYear: true })}`}
        />

        {/* Official Auction Start — only rendered when real pre-bidding
            actually pushed the timeline earlier than the official start. */}
        {officialStartPct != null && (
          <button
            type="button"
            onMouseEnter={() => setHoverKey("official")}
            onMouseLeave={() => setHoverKey("track")}
            onFocus={() => setHoverKey("official")}
            onBlur={() => setHoverKey(null)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-navy bg-plane z-10"
            style={{ left: `${officialStartPct}%` }}
            aria-label={`Official auction start · ${formatManila(officialStartTime, { withYear: true })}`}
          />
        )}

        {/* Current — the most visually apparent marker on the track */}
        {!ended && (
          <button
            type="button"
            onMouseEnter={() => setHoverKey("now")}
            onMouseLeave={() => setHoverKey("track")}
            onFocus={() => setHoverKey("now")}
            onBlur={() => setHoverKey(null)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-series1 border-2 border-plane shadow z-20 pulse-dot"
            style={{ left: `${nowPct}%` }}
            aria-label={`Current · ${nowPct.toFixed(0)}% elapsed · ${remainingText}`}
          />
        )}

        {/* Ending Time (100%) */}
        <button
          type="button"
          onMouseEnter={() => setHoverKey("end")}
          onMouseLeave={() => setHoverKey("track")}
          onFocus={() => setHoverKey("end")}
          onBlur={() => setHoverKey(null)}
          className="absolute top-1/2 left-full -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-navy/50 bg-plane z-10"
          aria-label={`Ending time · ${formatManila(endingTime, { withYear: true })}`}
        />

        {active && <TimelineTip anchorPct={activeAnchor} eyebrow={active.eyebrow} lines={active.lines} />}
      </div>

      <div className="flex justify-between text-[12px] text-muted mt-1">
        <div>
          <div className="text-ink">Start</div>
          <div className="tabular">{formatManila(timelineStart)}</div>
        </div>
        {hadPreBidding && (
          <div className="text-navy/70 text-center">
            ↑ Auction Start {formatManila(officialStartTime, { withDate: false })}
          </div>
        )}
        <div className="text-right">
          <div className="text-ink">Current position</div>
          <div className="tabular">{ended ? "Ended" : timeRemainingLabel(endingTime)}</div>
        </div>
        <div className="text-right">
          <div className="text-ink">End</div>
          <div className="tabular">{formatManila(endingTime)}</div>
        </div>
      </div>
    </div>
  );
}
