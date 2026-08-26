import { formatManila, manilaToEpochMs, timeRemainingLabel } from "../../utils/manilaTime";

// The auction-LEVEL progress/timeline — where "now" sits between this
// auction's timeline start and its official end. Distinct from
// BidActivityBar (unchanged, still used inside each individual lot for its
// own bid-event-by-bid-event history): this bar plots exactly one thing,
// the current moment, not individual bids.
//
// timelineStart reuses the EXACT SAME LEAST(official starting_time,
// earliest real bid event) semantics already validated for the per-lot
// timeline (see api/live-auction-detail.js's timeline_start comment,
// api/live-auctions.js's own copy of that formula) — never redefined here.
// officialStartTime is still shown as its own marker whenever real
// pre-bidding pushed timelineStart earlier than the official start.
export default function AuctionProgressBar({ timelineStart, officialStartTime, endingTime }) {
  const startMs = manilaToEpochMs(timelineStart);
  const endMs = manilaToEpochMs(endingTime);
  const officialStartMs = manilaToEpochMs(officialStartTime);
  const span = startMs != null && endMs != null && endMs > startMs ? endMs - startMs : null;

  if (!span) {
    return <div className="text-[13px] text-muted">Timeline unavailable.</div>;
  }

  const nowMs = Date.now();
  const nowPct = Math.min(100, Math.max(0, ((nowMs - startMs) / span) * 100));
  const hadPreBidding = officialStartMs != null && startMs < officialStartMs;
  const officialStartPct = hadPreBidding ? Math.min(100, Math.max(0, ((officialStartMs - startMs) / span) * 100)) : null;
  const ended = nowMs >= endMs;

  return (
    <div className="pb-1">
      <div className="relative h-2 rounded-full bg-gridline">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-series1/30"
          style={{ width: `${nowPct}%` }}
        />
        {officialStartPct != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-navy/50"
            style={{ left: `${officialStartPct}%` }}
            title={`Official auction start · ${formatManila(officialStartTime)}`}
          />
        )}
        {!ended && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-series1 border-2 border-plane"
            style={{ left: `${nowPct}%` }}
            title={`Current position · ${timeRemainingLabel(endingTime)}`}
          />
        )}
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
