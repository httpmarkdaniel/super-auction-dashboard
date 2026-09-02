import { useState } from "react";
import Modal from "./Modal";
import BranchCategoryToggle from "./BranchCategoryToggle";
import { formatPeso } from "../../utils/format";

function DeltaBadge({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={`text-[13px] font-medium ${up ? "text-toneGreenText" : "text-toneRedText"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// Avg Bid / Auction and Avg Bid / Sold Lot here are the SAME safe-division
// formula as the Overview Avg Bid cards (branch/category settled Bid
// Amount ÷ that entity's own distinct auction count / settled lot count —
// see withHoverDetail in App.jsx, which already computes both fields on
// every branchBreakdown/categoryBreakdown row), just scoped per row
// instead of blended — never a fabricated value when a row has zero
// auctions or lots.
function EntityTable({ rows, nameKey, totalBidAmount }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14.5px]">
        <thead>
          <tr className="text-ink text-[13px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">{nameKey === "branch" ? "Branch" : "Category"}</th>
            <th className="text-right font-medium pb-2 pr-4">Total Bid Amount</th>
            <th className="text-right font-medium pb-2 pr-4">% Share</th>
            <th className="text-right font-medium pb-2 pr-4">Auction Count</th>
            <th className="text-right font-medium pb-2 pr-4">Avg Bid / Auction</th>
            <th className="text-right font-medium pb-2">Avg Bid / Sold Lot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[nameKey]} className="border-t border-gridline">
              <td className="py-2 pr-4 text-ink">{r[nameKey]}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{r.share}%</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{r.auctionCount}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{r.avgBidPerAuction != null ? formatPeso(r.avgBidPerAuction) : "—"}</td>
              <td className="py-2 text-right tabular text-ink">{r.avgBidPerSoldLot != null ? formatPeso(r.avgBidPerSoldLot) : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted text-[14.5px]">No settled auction results yet for this period.</td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="border-t-2 border-gridline font-semibold">
              <td className="py-2.5 pr-4 text-ink">Total</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(totalBidAmount)}</td>
              <td className="py-2.5 pr-4"></td>
              <td className="py-2.5 pr-4"></td>
              <td className="py-2.5 pr-4"></td>
              <td className="py-2.5"></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Total Bid Amount's first-level detail: financial summary + branch/
// category breakdown (share + distinct auction count), NOT an auction-
// level list — that population lives behind the separate Auctions
// Concluded KPI. SUM(branch bid amount) and SUM(category bid amount) both
// reconcile exactly to totalBidAmount (same settled_lots population, see
// api/overview.js's SETTLED BRANCH/CATEGORY query comments).
export default function TotalBidAmountModal({
  open,
  onClose,
  rangeLabel,
  compareLabel,
  heroKPIs,
  comparison,
  categoryBreakdown,
  branchBreakdown,
  globalCategory = "",
}) {
  const [view, setView] = useState("branch");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Total Bid Amount"
      subtitle={
        globalCategory
          ? `${rangeLabel} · settled Paid/Released lots only · Category: ${globalCategory}`
          : `${rangeLabel} · settled Paid/Released lots only`
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 pb-5 border-b border-gridline">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Total Bid Amount</div>
          <div className="font-display text-[22px] text-ink">{formatPeso(heroKPIs.totalBidAmount)}</div>
          <DeltaBadge pct={comparison?.total_bid_amount_pct} />
          {comparison && <div className="text-[11.5px] text-muted mt-0.5">{compareLabel}</div>}
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Auctions Concluded</div>
          <div className="font-display text-[22px] text-ink">{heroKPIs.auctionsConcluded}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Lots Sold</div>
          <div className="font-display text-[22px] text-ink">{heroKPIs.lotsSold}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Avg Bid / Auction</div>
          <div className="font-display text-[22px] text-ink">{heroKPIs.avgBidPerAuction != null ? formatPeso(heroKPIs.avgBidPerAuction) : "—"}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Avg Bid / Sold Lot</div>
          <div className="font-display text-[22px] text-ink">{heroKPIs.avgBidPerSoldLot != null ? formatPeso(heroKPIs.avgBidPerSoldLot) : "—"}</div>
        </div>
      </div>

      <BranchCategoryToggle value={view} onChange={setView} />
      {view === "branch" ? (
        <EntityTable rows={branchBreakdown} nameKey="branch" totalBidAmount={heroKPIs.totalBidAmount} />
      ) : (
        <EntityTable rows={categoryBreakdown} nameKey="category" totalBidAmount={heroKPIs.totalBidAmount} />
      )}
    </Modal>
  );
}
