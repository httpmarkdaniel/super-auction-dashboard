import { useState } from "react";
import { formatPeso, formatCompactPeso } from "../utils/format";
import EntityBidderBreakdown from "./primitives/EntityBidderBreakdown";

function ChangeBadge({ pct, isNew }) {
  if (isNew) return <span className="text-[12.5px] font-semibold text-series1">New</span>;
  if (pct == null) return <span className="text-[12.5px] text-muted">—</span>;
  const up = pct >= 0;
  return (
    <span className={`text-[12.5px] font-medium ${up ? "text-toneGreenText" : "text-toneRedText"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// Inline expand — channel breakdown (Online Bidding/Negotiated/etc, only
// channels actually present in the data) + current-period figures for the
// clicked branch. All from the SAME already-loaded branchPerformance row —
// no request triggered by expanding (PART 13).
function BranchDetail({ row }) {
  const maxChannelBid = Math.max(...row.channels.map((c) => c.bidAmount), 1);
  return (
    <tr className="border-t border-gridline bg-plane">
      <td colSpan={13} className="py-4 px-4">
        <div className="text-[12.5px] uppercase tracking-wide text-muted font-semibold mb-2">Channel Breakdown — {row.branch}</div>
        <div className="space-y-2 mb-4 max-w-2xl">
          {row.channels.map((c) => (
            <div key={c.channel}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[14px] text-ink">{c.channel}</span>
                <span className="text-[13.5px] tabular text-ink">
                  {c.lotsSold} / {c.lotsListed} lots · {formatPeso(c.bidAmount)}
                  <span className="text-muted"> · {row.bidAmount > 0 ? ((c.bidAmount / row.bidAmount) * 100).toFixed(1) : "0.0"}% of branch</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gridline overflow-hidden">
                <div className="h-full rounded-full bg-series1" style={{ width: `${(c.bidAmount / maxChannelBid) * 100}%` }} />
              </div>
            </div>
          ))}
          {row.channels.length === 0 && <div className="text-[13.5px] text-muted">No channel data available.</div>}
        </div>

        <EntityBidderBreakdown participating={row.participating} winning={row.winning} entityLabel={row.branch} />
      </td>
    </tr>
  );
}

// BRANCH PERFORMANCE (PART 10/11/12/13) — every column reuses already-
// loaded branchBreakdown (settled financial/bidder figures + comparison)
// merged client-side with auctionSummaryRows (broad Lots Listed/Sold,
// channel split) — see App.jsx's branchPerformance. Clicking a row expands
// inline (no navigation, no new request); only one row open at a time.
export default function BranchPerformanceTable({ rows }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] min-w-[1000px]">
        <thead>
          <tr className="text-white text-[12px] uppercase tracking-wide bg-navy">
            <th className="text-left font-medium py-2 px-3 sticky left-0 bg-navy">Branch</th>
            <th className="text-right font-medium py-2 px-3">Auctions</th>
            <th className="text-right font-medium py-2 px-3">Lots Listed</th>
            <th className="text-right font-medium py-2 px-3">Lots Sold</th>
            <th className="text-right font-medium py-2 px-3">Sell-Through</th>
            <th className="text-right font-medium py-2 px-3">Bid Amount</th>
            <th className="text-right font-medium py-2 px-3">Buyer's Premium</th>
            <th className="text-right font-medium py-2 px-3">Service Fee</th>
            <th className="text-right font-medium py-2 px-3">Service Income</th>
            <th className="text-right font-medium py-2 px-3">Avg / Sold Lot</th>
            <th className="text-right font-medium py-2 px-3">vs Previous</th>
            <th className="text-right font-medium py-2 px-3">Participating</th>
            <th className="text-right font-medium py-2 px-3">Winning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expanded === row.branch;
            return (
              <>
                <tr
                  key={row.branch}
                  className="border-t border-gridline cursor-pointer hover:bg-plane"
                  onClick={() => setExpanded(isOpen ? null : row.branch)}
                >
                  <td className="py-2 px-3 text-ink font-medium sticky left-0 bg-surface1">
                    <span className="inline-block w-3 text-muted">{isOpen ? "▾" : "▸"}</span> {row.branch}
                  </td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.auctions}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.lotsListed.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.lotsSold.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.sellThroughPct != null ? `${row.sellThroughPct.toFixed(1)}%` : "—"}</td>
                  <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(row.bidAmount)}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(row.buyersPremiumIncome)}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(row.commissionIncome)}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(row.serviceIncome)}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.avgBidPerSoldLot != null ? formatCompactPeso(row.avgBidPerSoldLot) : "—"}</td>
                  <td className="py-2 px-3 text-right"><ChangeBadge pct={row.bidValueChangePct} isNew={row.isNewEntity} /></td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.participating.total}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{row.winning.total}</td>
                </tr>
                {isOpen && <BranchDetail key={`${row.branch}-detail`} row={row} />}
              </>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={13} className="py-6 text-center text-muted text-[14px]">
                No branch activity in this scope.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
