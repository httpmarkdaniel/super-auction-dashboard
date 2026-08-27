import { useState } from "react";
import Modal from "./Modal";
import OperationsTable from "../OperationsTable";
import { formatPeso } from "../../utils/format";

const MANILA_TZ = "Asia/Manila";

function formatManila(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" });
}

// Auction-first drilldown for the Overview KPI strip (Total Bid Amount,
// Auctions Concluded, Avg Bid/Auction, Avg Bid/Sold Lot, Lots Sold/Listed) —
// ONE row per auction, aggregated in ClickHouse (see api/overview.js's
// AUCTION-LEVEL SUMMARY query), never every individual lot up front. A row
// expands in place to that auction's own lots only, reusing the already-
// fetched `lots` population (OperationsTable) rather than a new request —
// see App.jsx's auctionSummary mapping for why this is safe (no
// per-auction fetch, no full lot-level dump on open).
export default function AuctionSummaryModal({ open, onClose, title, subtitle, rows, highlight, lotsByAuction }) {
  const [expanded, setExpanded] = useState(null);

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
            {rows.map((r) => {
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
                          {r.auctionNumber} · {formatManila(r.startingTime)} · lot-level detail
                        </div>
                        <OperationsTable data={lotsByAuction(r.auctionNumber)} initialTab="All" embedded />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted text-[14.5px]">
                  No auctions contributed to this KPI in the selected scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
