import { useState } from "react";
import Modal from "./Modal";
import { formatPeso } from "../../utils/format";

// The exact settled (Paid/Released) lots behind Total Bid Amount — sum
// of this table's Bid Amount column reconciles exactly to the KPI. A
// bidder identity that couldn't be resolved via the deterministic ID
// bridge shows as "—", never a fabricated name.
function LotsTable({ rows }) {
  const total = rows.reduce((s, r) => s + r.bidAmount, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15.5px]">
        <thead>
          <tr className="text-ink text-[13.5px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">Auction #</th>
            <th className="text-left font-medium pb-2 pr-4">Lot #</th>
            <th className="text-left font-medium pb-2 pr-4">Item</th>
            <th className="text-left font-medium pb-2 pr-4">Branch</th>
            <th className="text-left font-medium pb-2 pr-4">Category</th>
            <th className="text-left font-medium pb-2 pr-4">Vendor</th>
            <th className="text-left font-medium pb-2 pr-4">Status</th>
            <th className="text-left font-medium pb-2 pr-4">Approval</th>
            <th className="text-left font-medium pb-2 pr-4">Bidder</th>
            <th className="text-right font-medium pb-2">Bid Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.auctionNumber}-${r.lotNumber}`} className="border-t border-gridline">
              <td className="py-2.5 pr-4 tabular text-ink">{r.auctionNumber}</td>
              <td className="py-2.5 pr-4 tabular text-ink">{r.lotNumber}</td>
              <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.item}>
                {r.item || "—"}
              </td>
              <td className="py-2.5 pr-4 text-ink">{r.branch || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.category || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.status || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.approval || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.bidderName || "—"}</td>
              <td className="py-2.5 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="py-6 text-center text-muted text-[15.5px]">
                No settled lots in this range yet.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-gridline font-semibold">
              <td colSpan={9} className="py-2.5 pr-4 text-ink">Total</td>
              <td className="py-2.5 text-right tabular text-ink">{formatPeso(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function TallyTable({ rows, labelKey }) {
  const total = rows.reduce((s, r) => s + r.bidAmount, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15.5px]">
        <thead>
          <tr className="text-ink text-[13.5px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">{labelKey === "branch" ? "Branch" : "Category"}</th>
            <th className="text-right font-medium pb-2 pr-4">Bid Amount</th>
            <th className="text-right font-medium pb-2">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[labelKey]} className="border-t border-gridline">
              <td className="py-2.5 pr-4 text-ink">{r[labelKey]}</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
              <td className="py-2.5 text-right tabular text-muted">{r.share}%</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-muted text-[15.5px]">
                No bid activity in this range yet.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-gridline font-semibold">
              <td className="py-2.5 pr-4 text-ink">Total</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(total)}</td>
              <td className="py-2.5 text-right tabular text-muted">100%</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const TITLES = {
  branch: "Total Bid Amount · By Branch",
  category: "Total Bid Amount · By Category",
  lots: "Total Bid Amount · Settled Lots",
};

export default function BranchTallyModal({ open, onClose, branchTally, categoryTally, lotsTally, rangeLabel }) {
  const [tab, setTab] = useState("branch");
  const hasCategoryTab = Boolean(categoryTally);
  const hasLotsTab = Boolean(lotsTally);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={TITLES[tab]}
      subtitle={rangeLabel}
    >
      <div className="flex items-center gap-1.5 mb-4">
        {[
          { key: "branch", label: "By Branch" },
          hasCategoryTab && { key: "category", label: "By Category" },
          hasLotsTab && { key: "lots", label: "Settled Lots" },
        ]
          .filter(Boolean)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-[15px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                tab === t.key
                  ? "bg-navySoft text-navy border-navySoft"
                  : "bg-transparent text-ink border-gridline hover:bg-plane"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "branch" && <TallyTable rows={branchTally} labelKey="branch" />}
      {tab === "category" && <TallyTable rows={categoryTally} labelKey="category" />}
      {tab === "lots" && <LotsTable rows={lotsTally} />}
    </Modal>
  );
}
