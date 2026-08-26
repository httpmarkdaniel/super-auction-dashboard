import { formatCompactPeso } from "../../utils/format";

// The ONE hourly hover tooltip shared by Overview and Bidding Pace's
// "Bidding Activity by Hour" charts — same data shape (src/utils/
// hourlyBidderDetail.js), same layout, so the two pages can never show
// different information for the same hour. Falls back to a plain
// single-line Bid Amount tooltip (`detail` absent) for any other consumer
// of HourlyTrend (CategoryView) that doesn't have per-hour bidder detail.
function PopulationBlock({ label, stats }) {
  const { total, new: newCount, returning, newAmount, returningAmount, unresolvedAmount = 0 } = stats;

  if (total === 0 && unresolvedAmount === 0) {
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
      <div className="text-[13.5px] text-ink">
        {total} {total === 1 ? "bidder" : "bidders"}
      </div>
      <div className="text-[12px] text-muted">
        {newCount} New · {returning} Returning
      </div>
      <div className="text-[12.5px] tabular text-series1">
        {formatCompactPeso(newAmount)} New · {formatCompactPeso(returningAmount)} Returning
      </div>
      {unresolvedAmount > 0 && (
        <div className="text-[11px] text-muted mt-0.5">+ {formatCompactPeso(unresolvedAmount)} unresolved</div>
      )}
    </div>
  );
}

export default function HourlyBidderTooltip({ label, bidAmount, detail }) {
  if (!detail) {
    return (
      <div className="floating px-3.5 py-2.5 text-[15.5px]">
        <div className="text-ink mb-0.5">{label}</div>
        <div className="tabular text-series1">{formatCompactPeso(bidAmount)}</div>
      </div>
    );
  }

  return (
    <div className="floating px-3.5 py-3 text-[13.5px] min-w-[200px]">
      <div className="text-ink font-medium mb-1.5">{label}</div>

      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold">Bid Activity</div>
      <div className="text-[15px] tabular text-series1">{formatCompactPeso(bidAmount)}</div>

      <PopulationBlock label="Participating" stats={detail.participating} />
      <PopulationBlock label="Winning" stats={detail.winning} />
    </div>
  );
}
