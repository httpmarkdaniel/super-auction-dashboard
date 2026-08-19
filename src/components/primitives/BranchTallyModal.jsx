import { useState } from "react";
import Modal from "./Modal";
import { formatPeso } from "../../utils/format";

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

export default function BranchTallyModal({ open, onClose, branchTally, categoryTally, rangeLabel }) {
  const [tab, setTab] = useState("branch");
  const hasCategoryTab = Boolean(categoryTally);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Total Bid Amount · By ${tab === "branch" ? "Branch" : "Category"}`}
      subtitle={rangeLabel}
    >
      {hasCategoryTab && (
        <div className="flex items-center gap-1.5 mb-4">
          {[
            { key: "branch", label: "By Branch" },
            { key: "category", label: "By Category" },
          ].map((t) => (
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
      )}

      {tab === "branch" ? (
        <TallyTable rows={branchTally} labelKey="branch" />
      ) : (
        <TallyTable rows={categoryTally} labelKey="category" />
      )}
    </Modal>
  );
}
