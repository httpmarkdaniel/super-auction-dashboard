import Modal from "./Modal";
import { formatPeso } from "../../utils/format";

// The exact lot population behind the For Approval KPI — every row here
// has approval="For Approval" by definition (for_approval_status is
// independent of lifecycle status, so Status can legitimately be Unsold,
// Outstanding, Unpaid, Paid, Released, Returned, or Refunded). Sum of Bid
// Amount reconciles exactly to the KPI value. Reserve Price is shown as a
// separate informational column only — never added to or blended with Bid
// Amount.
function ForApprovalTable({ rows }) {
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
            <th className="text-left font-medium pb-2 pr-4">Vendor</th>
            <th className="text-left font-medium pb-2 pr-4">Status</th>
            <th className="text-left font-medium pb-2 pr-4">Approval</th>
            <th className="text-right font-medium pb-2 pr-4">Bid Amount</th>
            <th className="text-right font-medium pb-2">Reserve Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.auctionNumber}-${r.lotNumber}`} className="border-t border-gridline hover:bg-plane/60 transition-colors">
              <td className="py-2.5 pr-4 tabular text-ink">{r.auctionNumber}</td>
              <td className="py-2.5 pr-4 tabular text-ink">{r.lotNumber}</td>
              <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.item}>
                {r.item || "—"}
              </td>
              <td className="py-2.5 pr-4 text-ink">{r.branch || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.status || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.approval || "—"}</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
              <td className="py-2.5 text-right tabular text-ink">
                {r.reservedPrice > 0 ? formatPeso(r.reservedPrice) : <span className="text-muted">No Reserve</span>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="py-6 text-center text-muted text-[15.5px]">
                No lots pending approval in this range.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-gridline font-semibold">
              <td colSpan={7} className="py-2.5 pr-4 text-ink">Total</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ForApprovalModal({ open, onClose, rows, rangeLabel }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="For Approval · Lot Detail"
      subtitle={rangeLabel}
    >
      <ForApprovalTable rows={rows} />
    </Modal>
  );
}
