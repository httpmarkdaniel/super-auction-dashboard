import { useState } from "react";
import { formatPeso, formatCompactPeso } from "../utils/format";

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

// Inline expand — current-period figures + previous comparable period for
// the clicked category. All from the SAME already-loaded categoryPerformance
// row — no request triggered by expanding, same pattern as
// BranchPerformanceTable.jsx. No channel/store breakdown here (unlike
// Branch): an auction can span multiple categories, so there is no 1:1
// auction→category relationship to derive a channel split from the way
// Branch Performance does — this is a genuine, documented grain limitation,
// not an oversight.
function CategoryDetail({ row }) {
  return (
    <tr className="border-t border-gridline bg-plane">
      <td colSpan={13} className="py-4 px-4">
        <div className="text-[12.5px] uppercase tracking-wide text-muted font-semibold mb-2">
          Current vs Previous Comparable Period — {row.category}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl">
          <div>
            <div className="text-[12px] text-muted mb-0.5">Bid Amount</div>
            <div className="tabular font-medium text-ink">{formatPeso(row.bidAmount)}</div>
            <ChangeBadge pct={row.bidValueChangePct} isNew={row.isNewEntity} />
          </div>
          <div>
            <div className="text-[12px] text-muted mb-0.5">Buyer's Premium</div>
            <div className="tabular font-medium text-ink">{formatPeso(row.buyersPremiumIncome)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted mb-0.5">Service Fee</div>
            <div className="tabular font-medium text-ink">{formatPeso(row.commissionIncome)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted mb-0.5">Service Income</div>
            <div className="tabular font-medium text-ink">{formatPeso(row.serviceIncome)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted mb-0.5">Auctions</div>
            <div className="tabular font-medium text-ink">{row.auctions}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted mb-0.5">Participating Bidders</div>
            <div className="tabular font-medium text-ink">{row.participating.total}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted mb-0.5">Winning Bidders</div>
            <div className="tabular font-medium text-ink">{row.winning.total}</div>
          </div>
        </div>
        <div className="text-[11.5px] text-muted mt-3">
          No channel/store breakdown here — an auction can span multiple categories, so there is no per-auction category grain to split by channel the way Branch Performance does.
        </div>
      </td>
    </tr>
  );
}

// CATEGORY PERFORMANCE — same analytical shape as Branch Performance
// (App.jsx's categoryPerformance merges categoryBreakdown's settled
// financial/bidder figures + comparison with api/overview.js's new
// category_lot_status aggregate for the broader Lots Listed/Sold — see
// App.jsx's own comment). Clicking a row expands inline, no new request.
export default function CategoryPerformanceTable({ rows }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] min-w-[1000px]">
        <thead>
          <tr className="text-white text-[12px] uppercase tracking-wide bg-navy">
            <th className="text-left font-medium py-2 px-3 sticky left-0 bg-navy">Category</th>
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
            const isOpen = expanded === row.category;
            return (
              <>
                <tr
                  key={row.category}
                  className="border-t border-gridline cursor-pointer hover:bg-plane"
                  onClick={() => setExpanded(isOpen ? null : row.category)}
                >
                  <td className="py-2 px-3 text-ink font-medium sticky left-0 bg-surface1">
                    <span className="inline-block w-3 text-muted">{isOpen ? "▾" : "▸"}</span> {row.category}
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
                {isOpen && <CategoryDetail key={`${row.category}-detail`} row={row} />}
              </>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={13} className="py-6 text-center text-muted text-[14px]">
                No category activity in this scope.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
