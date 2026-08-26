import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import HourlyTrend from "./HourlyTrend";
import { formatCompactPeso } from "../utils/format";
import { useBiddingPace } from "../useBiddingPace";

// One bidder population (Participating or Winning) — everything visible
// at once, no click needed, matching Full Auction Detail's Lot Detail
// bidder cards. Participating vs Winning use deliberately different
// amount labels ("activity" vs "winning value") so the two are never
// implied to be the same measure.
function BidderStatCard({ title, amountLabel, stats }) {
  if (!stats) {
    return (
      <div className="border border-gridline rounded-lg p-4 bg-plane">
        <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
        <div className="text-[14px] text-muted">No bidding-event data for this population.</div>
      </div>
    );
  }

  const { total, new: newCount, returning: returningCount, totalAmount, newAmount, returningAmount, unresolvedAmount } = stats;

  return (
    <div className="border border-gridline rounded-lg p-4 bg-plane">
      <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
      <div className="font-display text-[26px] leading-none text-ink mb-1">{total}</div>
      <div className="text-[13.5px] text-ink mb-2">
        {newCount} New · {returningCount} Returning
      </div>
      <div className="text-[14px] tabular text-series1">{formatCompactPeso(totalAmount)} {amountLabel}</div>
      <div className="text-[12.5px] tabular text-muted mt-0.5">
        {formatCompactPeso(newAmount)} New · {formatCompactPeso(returningAmount)} Returning
      </div>
      {unresolvedAmount > 0 && (
        <div className="text-[12px] text-muted mt-1">
          + {formatCompactPeso(unresolvedAmount)} unresolved identity (not counted above)
        </div>
      )}
    </div>
  );
}

export default function BiddingPaceView({ store, dateRange, rangeLabel, refreshNonce }) {
  const { data, loading, error, unsupported } = useBiddingPace(store, dateRange, refreshNonce);

  if (unsupported) {
    return (
      <div className="px-4 py-6 rounded-lg border border-gridline bg-plane text-center text-ink text-[15.5px]">
        <div className="font-medium mb-1">All Time is not currently available for Bidding Pace.</div>
        <div className="text-muted text-[14px]">Select a specific date range to load bidding activity and bidder details.</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load bidding pace: {error}
      </div>
    );
  }
  if (loading || !data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading bidding pace…</div>;
  }

  const { hourlyTrend, participating, winning } = data;

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-critical/10 text-toneRedText text-[13.5px]">
          Couldn't refresh bidding pace: {error} — showing last loaded data.
        </div>
      )}

      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel} · Live`}
          headline="How bidding activity is spread across the hours of the day — and who's placing those bids."
        />
      </div>

      <StorySection
        title="Bidding Activity by Hour"
        insight="How bidding activity is spread across the hours of the day."
      >
        <HourlyTrend data={hourlyTrend} rangeLabel={rangeLabel} />
      </StorySection>

      <StorySection
        title="Bidder Breakdown"
        insight="Participating Bidders is bid activity (every real bid event, win or lose). Winning Bidders is settled value (Paid/Released lots only). These are two different, non-reconciling populations — a bidder who bid and lost still counts fully in Participating. New/Returning is relative to the start of the selected date range, the same rule used everywhere else in this app."
        last
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BidderStatCard title="Participating Bidders" amountLabel="activity" stats={participating} />
          <BidderStatCard title="Winning Bidders" amountLabel="winning value" stats={winning} />
        </div>
        <div className="text-[13px] text-muted mt-4">
          No conversion rate (Winning ÷ Participating) is shown — it isn't reliably valid across every scope. Negotiated
          auctions can have real Winning Bidders with zero Participating data (they never post through the online
          bidding system), which would silently inflate a global conversion percentage.
        </div>
      </StorySection>
    </div>
  );
}
