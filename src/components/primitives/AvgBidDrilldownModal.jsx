import { useMemo, useState } from "react";
import Modal from "./Modal";
import OperationsTable from "../OperationsTable";
import { AuctionBidderComposition } from "./AuctionSummaryModal";
import { formatPeso } from "../../utils/format";

const MANILA_TZ = "Asia/Manila";
const PAGE_SIZE = 5;

function formatManila(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" });
}

// Dedicated drilldown for the two average-per-* KPIs — previously both
// reused AuctionSummaryModal's generic column set (which always ends in
// "Avg Bid / Sold Lot", wrong/confusing for the Avg Bid/Auction card) with
// no visible formula and no Type/Sub Type, hiding exactly the auction
// classification (e.g. a high-value Vehicle/Automotive auction) that's
// actually moving the average. `metric` controls which denominator this
// instance explains; both metrics are computed here from the SAME `rows`
// (App.jsx's settledAuctionSummary, already filtered to contributing
// auctions) rather than trusting a separately-passed KPI figure, so the
// on-screen formula always reconciles to the rows shown below it by
// construction. No extra request — rows were already fetched once.
export default function AvgBidDrilldownModal({ open, onClose, metric, category = "", rangeLabel, rows, lotsByAuction }) {
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);

  const totals = useMemo(() => {
    const totalBidAmount = rows.reduce((sum, r) => sum + r.settledBidAmount, 0);
    const auctionsCount = rows.length;
    const totalSoldLots = rows.reduce((sum, r) => sum + r.settledLotCount, 0);
    return {
      totalBidAmount,
      auctionsCount,
      totalSoldLots,
      avgPerAuction: auctionsCount > 0 ? totalBidAmount / auctionsCount : null,
      avgPerSoldLot: totalSoldLots > 0 ? totalBidAmount / totalSoldLots : null,
    };
  }, [rows]);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.settledBidAmount - a.settledBidAmount), [rows]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  function changePage(next) {
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
    setExpanded(null);
  }

  const isAuctionMetric = metric === "auction";
  const baseTitle = isAuctionMetric ? "Avg Bid / Auction · Contributing Auctions" : "Avg Bid / Sold Lot · Contributing Auctions";
  const title = category ? `${baseTitle} · ${category}` : baseTitle;
  const subtitle = category
    ? `${category} · ${rangeLabel} · ${totals.auctionsCount} auctions contributed settled value`
    : `${rangeLabel} · ${totals.auctionsCount} auctions contributed settled value`;
  const showCategoryColumn = !category;
  const columnCount = showCategoryColumn ? 9 : 8;

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="mb-4 px-4 py-3 rounded-lg bg-navySoft text-[15px] text-ink">
        {isAuctionMetric ? (
          <>
            <span className="tabular font-semibold">{formatPeso(totals.totalBidAmount)}</span>
            {" ÷ "}
            <span className="tabular font-semibold">{totals.auctionsCount} auctions</span>
            {" = "}
            <span className="tabular font-semibold text-series1">
              {totals.avgPerAuction != null ? formatPeso(totals.avgPerAuction) : "—"}
            </span>
          </>
        ) : (
          <>
            <span className="tabular font-semibold">{formatPeso(totals.totalBidAmount)}</span>
            {" ÷ "}
            <span className="tabular font-semibold">{totals.totalSoldLots} sold lots</span>
            {" = "}
            <span className="tabular font-semibold text-series1">
              {totals.avgPerSoldLot != null ? formatPeso(totals.avgPerSoldLot) : "—"}
            </span>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead>
            <tr className="text-ink text-[13px] uppercase tracking-wide">
              <th className="text-left font-medium pb-2 pr-4">Auction #</th>
              <th className="text-left font-medium pb-2 pr-4">Branch</th>
              <th className="text-left font-medium pb-2 pr-4">Name</th>
              <th className="text-left font-medium pb-2 pr-4">Type</th>
              <th className="text-left font-medium pb-2 pr-4">Sub Type</th>
              {showCategoryColumn && <th className="text-left font-medium pb-2 pr-4">Category</th>}
              <th className="text-right font-medium pb-2 pr-4">Lots Sold</th>
              <th className="text-right font-medium pb-2 pr-4">Total Bid Amount</th>
              <th className="text-right font-medium pb-2 text-navy">
                {isAuctionMetric ? "% Share of Total Bid" : "Avg Bid / Sold Lot"}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const sharePct = totals.totalBidAmount > 0 ? (r.settledBidAmount / totals.totalBidAmount) * 100 : 0;
              const avgPerSoldLot = r.settledLotCount > 0 ? r.settledBidAmount / r.settledLotCount : null;
              const isOpen = expanded === r.auctionNumber;
              return (
                <>
                  <tr
                    key={r.auctionNumber}
                    className="border-t border-gridline cursor-pointer hover:bg-plane"
                    onClick={() => setExpanded(isOpen ? null : r.auctionNumber)}
                  >
                    <td className="py-2 pr-4 tabular text-series1 font-semibold">{r.auctionNumber}</td>
                    <td className="py-2 pr-4 text-ink">{r.storeName || "—"}</td>
                    <td className="py-2 pr-4 text-ink max-w-[200px] truncate" title={r.name}>{r.name || "—"}</td>
                    <td className="py-2 pr-4 text-ink">{r.type || "—"}</td>
                    <td className="py-2 pr-4 text-ink">{r.subType || "—"}</td>
                    {showCategoryColumn && <td className="py-2 pr-4 text-ink">{r.category || "—"}</td>}
                    <td className="py-2 pr-4 text-right tabular text-ink">{r.lotsSold ?? r.settledLotCount}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{formatPeso(r.settledBidAmount)}</td>
                    <td className="py-2 text-right tabular text-navy font-semibold">
                      {isAuctionMetric
                        ? `${sharePct.toFixed(1)}%`
                        : avgPerSoldLot != null ? formatPeso(avgPerSoldLot) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.auctionNumber}-detail`} className="border-t border-gridline">
                      <td colSpan={columnCount} className="py-3 pl-4 bg-plane">
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
                <td colSpan={columnCount} className="py-6 text-center text-muted text-[14.5px]">
                  {category ? `No settled results for ${category} in the selected scope.` : "No auctions contributed to this KPI in the selected scope."}
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
