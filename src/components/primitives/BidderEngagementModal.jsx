import { useMemo, useState } from "react";
import Modal from "./Modal";

const PAGE_SIZE = 10;

// Bidder-first drilldown for the Avg Bids / Unique Bidder scorecard — ONE
// row per canonical Participating bidder identity (see api/overview.js's
// AVG BIDS / UNIQUE BIDDER query comment), already fetched as part of the
// same Overview summary response. Pagination here is client-side over that
// already-in-memory array (already sorted by Bid Events descending by the
// API) — never a fetch per page, never a query per bidder.
//
// This is a bidding-frequency/intensity view, not a peso one — no Bid
// Activity Amount column here (see the scorecard's own Business/Bidder
// Efficiency card and Bidder Composition for money figures). The overall
// KPI context (Total Bid Events / Unique Participating Bidders / Avg Bids
// per Unique Bidder) lives once at the top, since at one-bidder-row grain
// "Avg Bids / Unique Bidder" as a column would trivially just equal that
// bidder's own Bid Events.
export default function BidderEngagementModal({
  open,
  onClose,
  rows,
  rangeLabel,
  totalBidEvents,
  uniqueParticipatingBidders,
  avgBidsPerUniqueBidder,
}) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => rows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE),
    [rows, clampedPage],
  );

  function changePage(next) {
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Avg Bids / Unique Bidder"
      subtitle={`${rangeLabel} · ${rows.length} participating bidder${rows.length === 1 ? "" : "s"}`}
    >
      <div className="grid grid-cols-3 gap-4 mb-5 pb-4 border-b border-gridline">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Total Bids</div>
          <div className="font-display text-[26px] leading-none text-ink">{totalBidEvents.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Unique Bidders</div>
          <div className="font-display text-[26px] leading-none text-ink">{uniqueParticipatingBidders.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Avg Bids / Unique Bidder</div>
          <div className="font-display text-[26px] leading-none text-series1">
            {avgBidsPerUniqueBidder != null ? avgBidsPerUniqueBidder.toFixed(1) : "—"}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead>
            <tr className="text-ink text-[13px] uppercase tracking-wide">
              <th className="text-left font-medium pb-2 pr-4">Bidder Name</th>
              <th className="text-left font-medium pb-2 pr-4">Status</th>
              <th className="text-right font-medium pb-2 pr-4">Bid Events</th>
              <th className="text-right font-medium pb-2 pr-4">Auctions Participated</th>
              <th className="text-right font-medium pb-2">Bids / Auction Participated</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={`${r.bidder}-${i}`} className="border-t border-gridline align-top">
                <td className="py-2 pr-4 text-ink">{r.bidder}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`text-[12px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                      r.is_new ? "bg-toneGreenBg text-toneGreenText" : "bg-plane text-muted"
                    }`}
                  >
                    {r.is_new ? "New" : "Returning"}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular text-ink font-semibold">{r.bid_events}</td>
                <td className="py-2 pr-4 text-right tabular text-ink">{r.auctions_participated}</td>
                <td className="py-2 text-right tabular text-ink">
                  {r.avg_bids_per_auction_participated != null ? r.avg_bids_per_auction_participated.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted text-[14.5px]">
                  No bidder activity in the selected scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gridline text-[14px]">
          <button
            type="button"
            onClick={() => changePage(clampedPage - 1)}
            disabled={clampedPage === 0}
            className="font-semibold text-series1 hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-muted">Page {clampedPage + 1} of {pageCount}</span>
          <button
            type="button"
            onClick={() => changePage(clampedPage + 1)}
            disabled={clampedPage >= pageCount - 1}
            className="font-semibold text-series1 hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </Modal>
  );
}
