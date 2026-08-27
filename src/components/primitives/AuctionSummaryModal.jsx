import { useMemo, useState } from "react";
import Modal from "./Modal";
import OperationsTable from "../OperationsTable";
import { formatPeso } from "../../utils/format";

const MANILA_TZ = "Asia/Manila";
const PAGE_SIZE = 5;

function formatManila(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" });
}

// Compact per-auction Participating/Winning composition — same
// definitions as the Overview Bidder Composition section, just scoped to
// this one auction (App.jsx's auctionSummary mapping already merges these
// in from the already-fetched api/leaderboards.js per-auction data, so
// this costs zero extra requests).
function AuctionBidderComposition({ participating, winning }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
      <div className="border border-gridline rounded-md px-3 py-2.5 bg-surface1">
        <div className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1">Participating</div>
        <div className="text-[15px] text-ink font-semibold">
          {participating.total} <span className="font-normal text-[13px] text-muted">({participating.newBidders} New · {participating.returningBidders} Returning)</span>
        </div>
        <div className="text-[13px] tabular text-series1 mt-0.5">
          {formatPeso(participating.activity)} activity
        </div>
        <div className="text-[12px] tabular text-muted">
          New {formatPeso(participating.newActivity)} · Returning {formatPeso(participating.returningActivity)}
        </div>
      </div>
      <div className="border border-gridline rounded-md px-3 py-2.5 bg-surface1">
        <div className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1">Winning</div>
        <div className="text-[15px] text-ink font-semibold">
          {winning.total} <span className="font-normal text-[13px] text-muted">({winning.newBidders} New · {winning.returningBidders} Returning)</span>
        </div>
        <div className="text-[13px] tabular text-series1 mt-0.5">
          {formatPeso(winning.amount)} winning value
        </div>
        <div className="text-[12px] tabular text-muted">
          New {formatPeso(winning.newAmount)} · Returning {formatPeso(winning.returningAmount)}
        </div>
      </div>
    </div>
  );
}

// Auction-first drilldown for the Overview KPI strip (Total Bid Amount,
// Auctions Concluded, Avg Bid/Auction, Avg Bid/Sold Lot, Lots Sold/Listed)
// — ONE row per auction, aggregated in ClickHouse (see api/overview.js's
// AUCTION-LEVEL SUMMARY query), never every individual lot up front. The
// full row set was already fetched once (bounded, small) — pagination
// here is client-side over that already-in-memory array, not a fetch per
// page. A row expands to that auction's own bidder composition + lots,
// reusing already-fetched data (App.jsx's auctionSummary merge / the
// already-fetched `lots` population) — no per-auction request.
export default function AuctionSummaryModal({ open, onClose, title, subtitle, rows, highlight, lotsByAuction }) {
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.settledBidAmount - a.settledBidAmount), [rows]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  function changePage(next) {
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
    setExpanded(null);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead>
            <tr className="text-ink text-[13px] uppercase tracking-wide">
              <th className="text-left font-medium pb-2 pr-4">Auction #</th>
              <th className="text-left font-medium pb-2 pr-4">Name</th>
              <th className="text-left font-medium pb-2 pr-4">Branch</th>
              <th className="text-right font-medium pb-2 pr-4">Lots Listed</th>
              <th className="text-right font-medium pb-2 pr-4">Lots Sold</th>
              <th className="text-right font-medium pb-2 pr-4">Unsold</th>
              <th className="text-right font-medium pb-2 pr-4">Sell-Through</th>
              <th className={`text-right font-medium pb-2 pr-4 ${highlight === "amount" ? "text-navy" : ""}`}>Total Bid Amount</th>
              <th className={`text-right font-medium pb-2 ${highlight === "avg" ? "text-navy" : ""}`}>Avg Bid / Sold Lot</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const sellThrough = r.lotsListed > 0 ? ((r.lotsSold / r.lotsListed) * 100).toFixed(1) : "0.0";
              const avgPerSoldLot = r.settledLotCount > 0 ? r.settledBidAmount / r.settledLotCount : 0;
              const isOpen = expanded === r.auctionNumber;
              return (
                <>
                  <tr
                    key={r.auctionNumber}
                    className="border-t border-gridline cursor-pointer hover:bg-plane"
                    onClick={() => setExpanded(isOpen ? null : r.auctionNumber)}
                  >
                    <td className="py-2 pr-4 tabular text-series1 font-semibold">{r.auctionNumber}</td>
                    <td className="py-2 pr-4 text-ink max-w-[200px] truncate" title={r.name}>{r.name || "—"}</td>
                    <td className="py-2 pr-4 text-ink">{r.storeName || "—"}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{r.lotsListed}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{r.lotsSold}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{r.lotsUnsold}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{sellThrough}%</td>
                    <td className={`py-2 pr-4 text-right tabular ${highlight === "amount" ? "text-navy font-semibold" : "text-ink"}`}>
                      {formatPeso(r.settledBidAmount)}
                    </td>
                    <td className={`py-2 text-right tabular ${highlight === "avg" ? "text-navy font-semibold" : "text-ink"}`}>
                      {r.settledLotCount > 0 ? formatPeso(avgPerSoldLot) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.auctionNumber}-detail`} className="border-t border-gridline">
                      <td colSpan={9} className="py-3 pl-4 bg-plane">
                        <div className="text-[13px] text-muted mb-2">
                          {r.auctionNumber} · {formatManila(r.startingTime)}
                        </div>
                        {r.participating && r.winning && (
                          <AuctionBidderComposition participating={r.participating} winning={r.winning} />
                        )}
                        <div className="text-[12px] text-muted mb-1.5">Lot detail</div>
                        <OperationsTable data={lotsByAuction(r.auctionNumber)} initialTab="All" embedded />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted text-[14.5px]">
                  No auctions contributed to this KPI in the selected scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
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
