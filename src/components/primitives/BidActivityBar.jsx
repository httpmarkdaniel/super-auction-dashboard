import { useState } from "react";
import { formatPeso } from "../../utils/format";
import { formatManila, manilaToEpochMs } from "../../utils/manilaTime";

// Plots each real bid event (cms.mart_cms_bid_history_report) along a
// timeline. The timeline's left edge is `timelineStart`, NOT the auction's
// official `officialStartTime` — real data confirms online bidding can
// begin before an auction's official starting_time (see
// api/live-auction-detail.js's timeline_start comment), so anchoring the
// bar to the official start alone would clamp genuine early bids to the
// 0% edge. `officialStartTime` is still shown as a marker on the bar
// whenever pre-bidding actually occurred (timelineStart < officialStartTime).
// A larger dot marks a point that was the standing/highest bid AT THAT
// MOMENT — recomputed as a running-max walk over the ordered events, not
// assumed from the final state. Same-timestamp ties (confirmed real on
// active auctions — the warehouse has no sub-second precision or sequence
// column to break them) render at the same position with no claimed
// sub-second order between them.
export default function BidActivityBar({ timelineStart, officialStartTime, endingTime, events }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const startMs = manilaToEpochMs(timelineStart);
  const endMs = manilaToEpochMs(endingTime);
  const officialStartMs = manilaToEpochMs(officialStartTime);
  const span = startMs != null && endMs != null && endMs > startMs ? endMs - startMs : null;

  if (!events || events.length === 0) {
    return <div className="text-[13px] text-muted">No bidding activity yet.</div>;
  }

  if (!span) {
    return <div className="text-[13px] text-muted">Timeline unavailable.</div>;
  }

  // Defensive clamp only — with a correct timelineStart, real events
  // should already fall within [0, 100].
  const pctOf = (ms) => (ms == null ? 0 : Math.min(100, Math.max(0, ((ms - startMs) / span) * 100)));

  const points = events.map((e, i) => {
    const t = manilaToEpochMs(e.timestamp);
    const preBidding = t != null && officialStartMs != null && t < officialStartMs;
    return { ...e, pct: pctOf(t), preBidding, i };
  });

  const hadPreBidding = officialStartMs != null && startMs < officialStartMs;
  const officialStartPct = hadPreBidding ? pctOf(officialStartMs) : null;

  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div className="relative pb-1">
      <div className="relative h-2 rounded-full bg-gridline">
        {officialStartPct != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-navy/50"
            style={{ left: `${officialStartPct}%` }}
            title={`Official auction start · ${formatManila(officialStartTime)}`}
          />
        )}
        {points.map((p) => (
          <button
            key={p.i}
            type="button"
            onMouseEnter={() => setHoverIdx(p.i)}
            onFocus={() => setHoverIdx(p.i)}
            onMouseLeave={() => setHoverIdx((v) => (v === p.i ? null : v))}
            onBlur={() => setHoverIdx((v) => (v === p.i ? null : v))}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-plane transition-transform hover:scale-125 ${
              p.was_winning ? "w-3 h-3 bg-series1" : "w-2 h-2 bg-muted"
            }`}
            style={{ left: `${p.pct}%` }}
            aria-label={`${formatPeso(p.bid_amount)} at ${formatManila(p.timestamp)}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[12px] text-muted mt-1">
        <span>{formatManila(timelineStart)}</span>
        {hadPreBidding && (
          <span className="text-navy/70">↑ Auction Start {formatManila(officialStartTime, { withDate: false })}</span>
        )}
        <span>{formatManila(endingTime)}</span>
      </div>
      {hovered && (
        <div className="mt-2 inline-block card px-3 py-2 text-[13.5px] leading-tight">
          <div className="text-ink font-semibold">{formatPeso(hovered.bid_amount)}</div>
          <div className="text-muted">{formatManila(hovered.timestamp)}</div>
          <div className="text-ink">{hovered.bidder ?? "Unknown bidder"}</div>
          <div className="text-muted capitalize">
            {hovered.new_or_returning}
            {hovered.was_winning ? " · standing bid at that point" : ""}
            {hovered.preBidding ? " · Pre-bidding" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
