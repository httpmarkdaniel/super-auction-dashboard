import { formatCompactPeso } from "../../utils/format";
import SegmentedShareBar from "./SegmentedShareBar";

// Shared Branch/Category click-detail body (executive cleanup task) —
// replaces the removed financial summary block (Bid Amount/Buyer's
// Premium/Service Fee/Service Income) with PARTICIPATING BIDDERS and
// WINNING BIDDERS composition, both scoped to the clicked entity via
// App.jsx's withHoverDetail(). All percentage shares are of THIS entity's
// own total (Participating denominator = its own Participating total;
// Winning denominator = its own Winning total) — never the dashboard-wide
// total. No new request — every field here is already present on the
// already-loaded row.
//
// Participating Bid Amount by New/Returning/Unclassified is deliberately
// NOT shown: api/overview.js computes it (participating_new_amount/
// participating_returning_amount, a raw per-bidder SUM of their own bid-
// event amounts), but summing that across bidders would double-count the
// same lot's value once per competing bidder on it — the executive
// cleanup task explicitly rules this out. Winning Bid Amount has no such
// ambiguity (a settled lot has exactly one winner), so it's shown in full.
export default function EntityBidderBreakdown({ participating, winning, entityLabel }) {
  const pTotal = participating.total || 1;
  const wTotal = winning.total || 1;
  const pNewPct = (participating.newBidders / pTotal) * 100;
  const pReturningPct = (participating.returningBidders / pTotal) * 100;
  const pUnclassifiedPct = (participating.unclassifiedBidders / pTotal) * 100;
  const wNewPct = (winning.newBidders / wTotal) * 100;
  const wReturningPct = (winning.returningBidders / wTotal) * 100;
  const wUnclassifiedPct = (winning.unclassifiedBidders / wTotal) * 100;

  return (
    <div>
      <div className="text-[12.5px] uppercase tracking-wide text-muted font-semibold mb-2">Bidder Composition — {entityLabel}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        <div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1.5">Participating Bidders · {participating.total.toLocaleString()}</div>
          <SegmentedShareBar
            segments={[
              { pct: pNewPct, colorClass: "bg-series8" },
              { pct: pReturningPct, colorClass: "bg-navy" },
              { pct: pUnclassifiedPct, colorClass: "bg-muted" },
            ]}
          />
          <div className="flex flex-col gap-1 text-[13px] text-ink mb-2.5">
            <span>New {participating.newBidders.toLocaleString()} ({pNewPct.toFixed(1)}%)</span>
            <span>Returning {participating.returningBidders.toLocaleString()} ({pReturningPct.toFixed(1)}%)</span>
            {participating.unclassifiedBidders > 0 && (
              <span className="text-muted">Unmatched {participating.unclassifiedBidders.toLocaleString()} ({pUnclassifiedPct.toFixed(1)}%)</span>
            )}
          </div>
          <div className="text-[13px] text-ink">
            Avg Bid Actions / Lot / Bidder: <span className="tabular font-medium">{participating.avgBidsPerUniqueBidder != null ? participating.avgBidsPerUniqueBidder.toFixed(1) : "—"}</span>
          </div>
          <div className="text-[11px] text-muted mt-2">Participating Bid Amount by class isn't shown — summing a bidder's own bid-event amounts would double-count the same lot's value across competing bidders on it.</div>
        </div>
        <div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1.5">Winning Bidders · {winning.total.toLocaleString()} · {formatCompactPeso(winning.amount)}</div>
          <SegmentedShareBar
            segments={[
              { pct: wNewPct, colorClass: "bg-series8" },
              { pct: wReturningPct, colorClass: "bg-navy" },
              { pct: wUnclassifiedPct, colorClass: "bg-muted" },
            ]}
          />
          <div className="flex flex-col gap-1 text-[13px] text-ink">
            <span>New {winning.newBidders.toLocaleString()} ({wNewPct.toFixed(1)}%) · {formatCompactPeso(winning.newAmount)}</span>
            <span>Returning {winning.returningBidders.toLocaleString()} ({wReturningPct.toFixed(1)}%) · {formatCompactPeso(winning.returningAmount)}</span>
            {winning.unclassifiedBidders > 0 && (
              <span className="text-muted">Unmatched {winning.unclassifiedBidders.toLocaleString()} ({wUnclassifiedPct.toFixed(1)}%) — value included in Returning</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
