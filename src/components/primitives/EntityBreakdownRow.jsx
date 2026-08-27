import { formatPeso } from "../../utils/format";

// Shared hoverable/clickable row for CategoryStrip/BranchStrip — bar +
// share (unchanged visual language from RankedBar), plus a hover panel
// telling the complete financial story for THIS entity only (never the
// overall Overview totals), and a click-through into Full Auction Detail
// pre-filtered to this entity.
export default function EntityBreakdownRow({ label, bidAmount, share, max, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/tip relative flex items-center gap-3 w-full text-left hover:bg-plane rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
    >
      <div className="w-[150px] shrink-0 min-w-0">
        <div className="text-[15.5px] text-ink truncate">{label}</div>
        <div className="text-[13.5px] text-muted">{share}% share</div>
      </div>
      <div className="flex-1 h-2 rounded-full bg-gridline overflow-hidden">
        <div className="h-full rounded-full bg-series1" style={{ width: `${(bidAmount / max) * 100}%` }} />
      </div>
      <div className="w-[96px] text-right shrink-0">
        <div className="text-[15.5px] tabular text-series1">{formatPeso(bidAmount)}</div>
      </div>

      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 right-0 top-full mt-1.5 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
      >
        <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg text-left">
          <div className="font-semibold text-[14px] mb-2 uppercase tracking-wide">{label}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div>
              <div className="text-muted text-[12px]">Total Bid Amount</div>
              <div className="tabular font-medium">{formatPeso(bidAmount)}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Auctions Concluded</div>
              <div className="tabular font-medium">{detail.auctionCount}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Lots Sold</div>
              <div className="tabular font-medium">{detail.lotsSold}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Avg Bid / Auction</div>
              <div className="tabular font-medium">{detail.avgBidPerAuction != null ? formatPeso(detail.avgBidPerAuction) : "—"}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Avg Bid / Sold Lot</div>
              <div className="tabular font-medium">{detail.avgBidPerSoldLot != null ? formatPeso(detail.avgBidPerSoldLot) : "—"}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Buyer's Premium</div>
              <div className="tabular font-medium">{formatPeso(detail.buyersPremiumIncome)}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Commission</div>
              <div className="tabular font-medium">{formatPeso(detail.commissionIncome)}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Service Income</div>
              <div className="tabular font-medium text-series1">{formatPeso(detail.serviceIncome)}</div>
            </div>
          </div>
          <div className="text-[11.5px] text-muted mt-2 pt-2 border-t border-gridline">Click to view in Full Auction Detail</div>
        </div>
      </div>
    </button>
  );
}
