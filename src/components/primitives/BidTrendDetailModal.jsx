import Modal from "./Modal";
import { computeBucketFinancials, formatTooltipLabel } from "../../utils/bidTrendBucket";
import { formatPeso, formatCompactPeso } from "../../utils/format";

// Deeper click-through detail behind one Bid Trend bucket (day/week/month —
// PART REORG task). Everything here comes from already-loaded data: the
// bucket's own bid_trend row (bid_amount/auctions_concluded/lots_sold/
// participating/winning, already correctly deduplicated server-side — see
// api/overview.js's BID TREND query) plus the same client-side
// computeBucketFinancials() the hover tooltip uses for Buyer's
// Premium/Service Fee/Auction Events by Branch. No category breakdown:
// auctionSummary is per-AUCTION grain and an auction can span multiple
// categories, so there is no cheap per-bucket category split available the
// way branch is (branch is 1:1 with an auction) — a genuine, documented
// limitation, not an oversight.
//
// "Previous Comparable Period" here means the PRECEDING bucket in this
// same already-loaded series (yesterday for a daily bucket, last month for
// a monthly one) — a different, bucket-grain comparison from the
// dashboard's own overall WTD/MTD/YTD/Custom period comparison shown
// elsewhere, chosen specifically because it requires no new request.
export default function BidTrendDetailModal({ bucket, onClose, bucketLabel, data, auctionSummary, rangeLabel }) {
  if (!bucket) return null;

  const index = data.findIndex((d) => d.bucket === bucket.bucket);
  const previous = index > 0 ? data[index - 1] : null;
  const pctChange =
    previous && previous.bid_amount > 0 ? ((bucket.bid_amount - previous.bid_amount) / previous.bid_amount) * 100 : null;

  const financials = computeBucketFinancials(auctionSummary, bucket.bucket, bucketLabel);
  const p = bucket.participating;
  const w = bucket.winning;

  return (
    <Modal
      open={Boolean(bucket)}
      onClose={onClose}
      title={formatTooltipLabel(bucket.bucket, bucketLabel)}
      subtitle={`${rangeLabel} · Bid Trend detail`}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5 pb-4 border-b border-gridline">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Total Bid Amount</div>
          <div className="font-display text-[24px] leading-none text-series1">{formatPeso(bucket.bid_amount)}</div>
          {pctChange != null ? (
            <div className={`text-[12.5px] font-medium mt-1 ${pctChange >= 0 ? "text-toneGreenText" : "text-toneRedText"}`}>
              {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% vs previous {bucketLabel}
            </div>
          ) : (
            <div className="text-[12.5px] text-muted mt-1">No previous {bucketLabel} to compare</div>
          )}
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Auction Events</div>
          <div className="font-display text-[24px] leading-none text-ink">{bucket.auctions_concluded}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Lots Sold</div>
          <div className="font-display text-[24px] leading-none text-ink">{bucket.lots_sold}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Participating / Winning</div>
          <div className="font-display text-[24px] leading-none text-ink">
            {p.new + p.returning} <span className="text-[15px] text-muted">/ {w.new + w.returning}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5 pb-4 border-b border-gridline">
        <div>
          <div className="text-[12.5px] uppercase tracking-wide text-muted font-semibold mb-2">Service Income</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted text-[12px]">Buyer's Premium</div>
              <div className="tabular font-medium text-[15px]">{formatCompactPeso(financials.buyersPremium)}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Service Fee</div>
              <div className="tabular font-medium text-[15px]">{formatCompactPeso(financials.commission)}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Total</div>
              <div className="tabular font-medium text-[15px] text-series1">{formatCompactPeso(financials.serviceIncome)}</div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[12.5px] uppercase tracking-wide text-muted font-semibold mb-2">Bidders</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted text-[12px]">Participating</div>
              <div className="tabular font-medium text-[15px]">{p.new + p.returning} <span className="text-muted font-normal text-[13px]">({p.new} New · {p.returning} Returning)</span></div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Winning</div>
              <div className="tabular font-medium text-[15px]">{w.new + w.returning} <span className="text-muted font-normal text-[13px]">({w.new} New · {w.returning} Returning)</span></div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[12.5px] uppercase tracking-wide text-muted font-semibold mb-2">Auction Events by Branch</div>
        {financials.branches.length === 0 ? (
          <div className="text-[14px] text-muted py-2">No settled auction activity in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-ink text-[12.5px] uppercase tracking-wide">
                  <th className="text-left font-medium pb-2 pr-4">Branch</th>
                  <th className="text-right font-medium pb-2 pr-4">Auction Events</th>
                  <th className="text-right font-medium pb-2">Bid Amount</th>
                </tr>
              </thead>
              <tbody>
                {financials.branches.map((b) => (
                  <tr key={b.branch} className="border-t border-gridline">
                    <td className="py-2 pr-4 text-ink">{b.branch}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{b.auctionEvents}</td>
                    <td className="py-2 text-right tabular text-series1 font-semibold">{formatPeso(b.bidAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11.5px] text-muted mt-2">
          No category breakdown here — an auction can span multiple categories, so there is no cheap per-bucket category split at this grain.
        </div>
      </div>
    </Modal>
  );
}
