import Modal from "./Modal";
import { formatPeso } from "../../utils/format";

// The exact settled (Paid/Released) lots behind the Service Income KPI —
// sum of Total Service Income reconciles exactly to the card, and sum of
// Buyer's Premium Income / Commission Income reconcile exactly to their
// own component KPIs. buyers_premium_pct/commission_pct are the underlying
// warehouse RATES (not pesos) — shown alongside the peso income they
// produce so the math is auditable per row.
function ServiceIncomeTable({ rows }) {
  const totalBuyersPremium = rows.reduce((s, r) => s + r.buyersPremiumIncome, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commissionIncome, 0);
  const total = totalBuyersPremium + totalCommission;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15.5px]">
        <thead>
          <tr className="text-ink text-[13.5px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">Auction #</th>
            <th className="text-left font-medium pb-2 pr-4">Lot #</th>
            <th className="text-left font-medium pb-2 pr-4">Branch</th>
            <th className="text-left font-medium pb-2 pr-4">Category</th>
            <th className="text-left font-medium pb-2 pr-4">Vendor</th>
            <th className="text-left font-medium pb-2 pr-4">Status</th>
            <th className="text-left font-medium pb-2 pr-4">Approval</th>
            <th className="text-right font-medium pb-2 pr-4">Bid Amount</th>
            <th className="text-right font-medium pb-2 pr-4">Buyer's Premium %</th>
            <th className="text-right font-medium pb-2 pr-4">Buyer's Premium Income</th>
            <th className="text-right font-medium pb-2 pr-4">Commission %</th>
            <th className="text-right font-medium pb-2 pr-4">Commission Income</th>
            <th className="text-right font-medium pb-2">Total Service Income</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.auctionNumber}-${r.lotNumber}`} className="border-t border-gridline">
              <td className="py-2.5 pr-4 tabular text-ink">{r.auctionNumber}</td>
              <td className="py-2.5 pr-4 tabular text-ink">{r.lotNumber}</td>
              <td className="py-2.5 pr-4 text-ink">{r.branch || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.category || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.status || "—"}</td>
              <td className="py-2.5 pr-4 text-ink">{r.approval || "—"}</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
              <td className="py-2.5 pr-4 text-right tabular text-muted">{r.buyersPremiumPct}%</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.buyersPremiumIncome)}</td>
              <td className="py-2.5 pr-4 text-right tabular text-muted">{r.commissionPct}%</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.commissionIncome)}</td>
              <td className="py-2.5 text-right tabular text-ink font-semibold">{formatPeso(r.totalServiceIncome)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={13} className="py-6 text-center text-muted text-[15.5px]">
                No settled lots in this range yet.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-gridline font-semibold">
              <td colSpan={9} className="py-2.5 pr-4 text-ink">Total</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(totalBuyersPremium)}</td>
              <td className="py-2.5 pr-4"></td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(totalCommission)}</td>
              <td className="py-2.5 text-right tabular text-ink">{formatPeso(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ServiceIncomeModal({ open, onClose, rows, rangeLabel }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Service Income · Settled Lots"
      subtitle={rangeLabel}
    >
      <ServiceIncomeTable rows={rows} />
    </Modal>
  );
}
