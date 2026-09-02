import { useState } from "react";
import Modal from "./Modal";
import BranchCategoryToggle from "./BranchCategoryToggle";
import { formatCompactPeso } from "../../utils/format";

// One BY BRANCH / BY CATEGORY table — same shape, different entity label.
// Rows are already-fetched Overview data (branchBreakdown/categoryBreakdown,
// each entity carrying its OWN Participating/Winning composition — see
// App.jsx's withHoverDetail) — no separate request, no per-entity query.
function EntityTable({ entityLabel, rows, getLabel }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-ink text-[12.5px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">{entityLabel}</th>
            <th className="text-right font-medium pb-2 pr-4">Participating</th>
            <th className="text-right font-medium pb-2 pr-4">New / Returning</th>
            <th className="text-right font-medium pb-2 pr-4">Total Bids</th>
            <th className="text-right font-medium pb-2 pr-4">Avg Bids / Unique Bidder</th>
            <th className="text-right font-medium pb-2 pr-4">Winning</th>
            <th className="text-right font-medium pb-2">Winning New / Returning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.participating;
            const w = r.winning;
            return (
              <tr key={getLabel(r)} className="border-t border-gridline">
                <td className="py-2 pr-4 text-ink">{getLabel(r)}</td>
                <td className="py-2 pr-4 text-right tabular text-ink font-semibold">{p.total}</td>
                <td className="py-2 pr-4 text-right tabular text-muted">{p.newBidders} / {p.returningBidders}</td>
                <td className="py-2 pr-4 text-right tabular text-ink">{p.totalBids.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right tabular text-series1 font-semibold">
                  {p.avgBidsPerUniqueBidder != null ? p.avgBidsPerUniqueBidder.toFixed(2) : "—"}
                </td>
                <td className="py-2 pr-4 text-right tabular text-ink">
                  {w.total}
                  <span className="text-muted font-normal"> · {formatCompactPeso(w.amount)}</span>
                </td>
                <td className="py-2 text-right tabular text-muted">{w.newBidders} / {w.returningBidders}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-5 text-center text-muted text-[14px]">
                No bidder activity in this scope.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Dedicated breakdown behind the Bidder Composition section — Participating/
// Winning split BY BRANCH and BY CATEGORY for the current Date/Store/
// Category scope. Every field here is entity-scoped (this branch's own bid
// events ÷ this branch's own unique bidders), never the overall Overview
// denominator — see App.jsx's withHoverDetail comment.
export default function BidderCompositionModal({ open, onClose, branchBreakdown, categoryBreakdown, rangeLabel }) {
  const [view, setView] = useState("branch");

  return (
    <Modal open={open} onClose={onClose} title="Bidder Composition" subtitle={rangeLabel}>
      <BranchCategoryToggle value={view} onChange={setView} />
      {view === "branch" ? (
        <EntityTable entityLabel="Branch" rows={branchBreakdown} getLabel={(r) => r.branch} />
      ) : (
        <EntityTable entityLabel="Category" rows={categoryBreakdown} getLabel={(r) => r.category} />
      )}
    </Modal>
  );
}
