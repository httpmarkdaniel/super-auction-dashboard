import Modal from "./Modal";
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

function EntityTable({ rows, nameKey, totalBidAmount }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14.5px]">
        <thead>
          <tr className="text-ink text-[13px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">{nameKey === "branch" ? "Branch" : "Category"}</th>
            <th className="text-right font-medium pb-2 pr-4">Total Bid Amount</th>
            <th className="text-right font-medium pb-2 pr-4">% Share</th>
            <th className="text-right font-medium pb-2">Auctions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[nameKey]} className="border-t border-gridline">
              <td className="py-2 pr-4 text-ink">{r[nameKey]}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
              <td className="py-2 pr-4 text-right tabular text-ink">{r.share}%</td>
              <td className="py-2 text-right tabular text-ink">{r.auctionCount}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted text-[14.5px]">No data for this period.</td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="border-t-2 border-gridline font-semibold">
              <td className="py-2.5 pr-4 text-ink">Total</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(totalBidAmount)}</td>
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
export default function TotalBidAmountModal({ open, onClose, rangeLabel, compareLabel, heroKPIs, comparison, categoryBreakdown, branchBreakdown }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Total Bid Amount"
      subtitle={`${rangeLabel} · settled Paid/Released lots only`}
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

      <div className="mb-2 text-[13px] uppercase tracking-wide text-muted font-semibold">Bid Value by Branch</div>
      <div className="mb-6">
        <EntityTable rows={branchBreakdown} nameKey="branch" totalBidAmount={heroKPIs.totalBidAmount} />
      </div>

      <div className="mb-2 text-[13px] uppercase tracking-wide text-muted font-semibold">Bid Value by Category</div>
      <EntityTable rows={categoryBreakdown} nameKey="category" totalBidAmount={heroKPIs.totalBidAmount} />
    </Modal>
  );
}
