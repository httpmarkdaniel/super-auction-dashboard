// Bidding Pace's OWN hourly hover tooltip — deliberately separate from the
// shared HourlyBidderTooltip (still used by CategoryView/HeroKPIs' plain
// Bid Amount hourly chart, untouched by this file). Bidding Pace is framed
// around AUCTION ACTIVITY, not peso Bid Amount, so this tooltip never shows
// a ₱ figure — only the hour's distinct auction count plus the same
// Participating/Winning bidder breakdown (src/utils/hourlyBidderDetail.js),
// still real and still never invented per-hour.
function PopulationBlock({ label, stats }) {
  const { total, new: newCount, returning } = stats;

  if (total === 0) {
    return (
      <div className="mt-2 first:mt-0">
        <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold">{label}</div>
        <div className="text-[12px] text-muted">No {label.toLowerCase()} bidders this hour.</div>
      </div>
    );
  }

  return (
    <div className="mt-2 first:mt-0">
      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold">{label}</div>
      <div className="text-[15px] tabular text-ink font-medium">{total}</div>
      <div className="text-[12px] text-muted">
        {newCount} New · {returning} Returning
      </div>
    </div>
  );
}

export default function BiddingPaceHourlyTooltip({ label, detail }) {
  if (!detail) return null;

  return (
    <div className="floating px-3.5 py-3 text-[13.5px] min-w-[200px]">
      <div className="text-ink font-medium mb-1.5">{label}</div>

      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold">Auction Events</div>
      <div className="text-[18px] tabular text-series1 font-semibold">{detail.auctionCount}</div>

      <PopulationBlock label="Participating Bidders" stats={detail.participating} />
      <PopulationBlock label="Winning Bidders" stats={detail.winning} />
    </div>
  );
}
