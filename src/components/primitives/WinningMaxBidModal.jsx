import { useState } from "react";
import Modal from "./Modal";
import BranchCategoryToggle from "./BranchCategoryToggle";
import { formatPeso } from "../../utils/format";

// PART 9: By Branch / By Category breakdown behind the Winning Bids via
// Max Bid scorecard — one row per entity, already-fetched (no per-entity
// request). unresolvedWins (a settled lot with no matching bid_history
// event, e.g. Negotiated) is surfaced, never folded into Normal Bid.
function EntityTable({ entityLabel, rows, getLabel }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-ink text-[12.5px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">{entityLabel}</th>
            <th className="text-right font-medium pb-2 pr-4">Winning Bids</th>
            <th className="text-right font-medium pb-2 pr-4">Max Bid Wins</th>
            <th className="text-right font-medium pb-2 pr-4">Normal Bid Wins</th>
            <th className="text-right font-medium pb-2 pr-4">Max Bid Win %</th>
            <th className="text-right font-medium pb-2 pr-4">Unresolved</th>
            <th className="text-right font-medium pb-2">Winning Bid Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={getLabel(r)} className="border-t border-gridline hover:bg-plane/60 transition-colors">
              <td className="py-2 pr-4 text-ink">{getLabel(r)}</td>
              <td className="py-2 pr-4 text-right tabular text-ink font-semibold">{r.winningBids}</td>
              <td className="py-2 pr-4 text-right tabular text-series1">{r.maxBidWins}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{r.normalBidWins}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{r.maxBidWinPct != null ? `${r.maxBidWinPct.toFixed(1)}%` : "—"}</td>
              <td className="py-2 pr-4 text-right tabular text-muted">{r.unresolvedWins}</td>
              <td className="py-2 text-right tabular text-ink">{formatPeso(r.winningBidAmount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-5 text-center text-muted text-[14px]">
                No settled winning bids in this scope.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function WinningMaxBidModal({ open, onClose, summary, branchBreakdown, categoryBreakdown, rangeLabel }) {
  const [view, setView] = useState("branch");

  return (
    <Modal open={open} onClose={onClose} title="Winning Bids via Max Bid" subtitle={rangeLabel}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-5 border-b border-gridline">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Winning Bids</div>
          <div className="font-display text-[22px] text-ink">{summary.winningBids.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Max Bid Wins</div>
          <div className="font-display text-[22px] text-series1">{summary.maxBidWins.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Max Bid Win %</div>
          <div className="font-display text-[22px] text-ink">{summary.maxBidWinPct != null ? `${summary.maxBidWinPct.toFixed(1)}%` : "—"}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Unresolved</div>
          <div className="font-display text-[22px] text-ink">{summary.unresolvedWins.toLocaleString()}</div>
          <div className="text-[11.5px] text-muted mt-0.5">No matching bid-history event (e.g. Negotiated)</div>
        </div>
      </div>

      <BranchCategoryToggle value={view} onChange={setView} />
      {view === "branch" ? (
        <EntityTable entityLabel="Branch" rows={branchBreakdown} getLabel={(r) => r.branch} />
      ) : (
        <EntityTable entityLabel="Category" rows={categoryBreakdown} getLabel={(r) => r.category} />
      )}
    </Modal>
  );
}
