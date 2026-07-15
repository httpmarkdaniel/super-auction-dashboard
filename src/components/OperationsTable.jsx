import { useState } from "react";
import { formatPeso } from "../utils/format";

const statusStyle = {
  Sold: "text-good bg-good/10",
  "For Approval": "text-warning bg-warning/10",
  Unsold: "text-critical bg-critical/10",
};

export default function OperationsTable({ data: operationsDetail }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="eyebrow">Operations · Lot Detail</div>
        <span className="text-ink2 text-[13px]">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="px-6 pb-5 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-muted text-[11px] uppercase tracking-wide">
                <th className="text-left font-medium pb-2 pr-4">Lot #</th>
                <th className="text-left font-medium pb-2 pr-4">Vendor</th>
                <th className="text-left font-medium pb-2 pr-4">Category</th>
                <th className="text-left font-medium pb-2 pr-4">Status</th>
                <th className="text-right font-medium pb-2 pr-4">Sold Price</th>
                <th className="text-left font-medium pb-2">Approval</th>
              </tr>
            </thead>
            <tbody>
              {operationsDetail.map((r) => (
                <tr key={r.lotNumber} className="border-t border-[var(--border)]">
                  <td className="py-2.5 pr-4 tabular text-ink">{r.lotNumber}</td>
                  <td className="py-2.5 pr-4 text-ink">{r.vendor}</td>
                  <td className="py-2.5 pr-4 text-ink2">{r.category}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[12px] font-medium ${
                        statusStyle[r.status] || "text-ink2 bg-gridline"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.soldPrice)}</td>
                  <td className="py-2.5 text-ink2">{r.approval}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
