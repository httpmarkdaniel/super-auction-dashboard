import { formatPeso, formatCompactPeso } from "../utils/format";

// Compact New/Returning breakdown for ONE bidder population (Participating
// or Winning) — reused for both inside the Bid Trend section. Bid Share is
// AMOUNT share (New/Returning contribution to this population's total
// amount), never a bidder-COUNT share — see the task's explicit "Bid Share,
// not Rate" requirement.
//
// `engagement` (PART 14/15): when passed, replaces the peso Bid Activity
// block entirely with a count/engagement-based one (Total Bids + Avg Bids /
// Unique Bidder) — Participating is an ENGAGEMENT population, not a
// financial one; only Winning (an outcome) keeps a peso figure here. When
// omitted, renders the original peso amountLabel/newAmount/returningAmount
// block unchanged, so Winning Bidders' own card is untouched.
export default function BidderPopulationCard({ title, total, newCount, returningCount, amountLabel, newAmount, returningAmount, engagement, onClick }) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3 pb-3.5 w-full text-left ${
        onClick ? "cursor-pointer hover:border-navy/40 transition-colors" : ""
      }`}
    >
      <div className="kpi-label mb-1">{title}</div>
      <div className="font-display text-[28px] leading-none text-ink mb-1">{total}</div>
      <div className="text-[13.5px] text-ink mb-3">
        {newCount} New · {returningCount} Returning
      </div>

      {engagement ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">Total Bids</div>
            <div className="text-[20px] tabular text-ink font-semibold">{engagement.totalBids.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">Avg Bid Actions / Lot / Bidder</div>
            <div className="text-[20px] tabular text-series1 font-semibold">
              {engagement.avgBidsPerUniqueBidder != null ? engagement.avgBidsPerUniqueBidder.toFixed(2) : "—"}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">{amountLabel}</div>
          <div className="text-[20px] tabular text-series1 font-semibold mb-2">{formatCompactPeso(newAmount + returningAmount)}</div>

          <div className="h-1.5 rounded-full overflow-hidden bg-gridline mb-1.5">
            <div className="bg-series1 h-full" style={{ width: `${newAmount + returningAmount > 0 ? (newAmount / (newAmount + returningAmount)) * 100 : 0}%` }} />
          </div>
          <div className="flex justify-between gap-3 text-[13px] text-ink">
            <span>New · {formatPeso(newAmount)} · {(newAmount + returningAmount > 0 ? (newAmount / (newAmount + returningAmount)) * 100 : 0).toFixed(1)}% share</span>
            <span className="text-right">Returning · {formatPeso(returningAmount)} · {(newAmount + returningAmount > 0 ? (returningAmount / (newAmount + returningAmount)) * 100 : 0).toFixed(1)}% share</span>
          </div>
        </>
      )}
    </Wrapper>
  );
}
