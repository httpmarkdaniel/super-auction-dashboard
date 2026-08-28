import { formatPeso, formatCompactPeso } from "../utils/format";

// Compact New/Returning breakdown for ONE bidder population (Participating
// or Winning) — reused for both inside the Bid Trend section. Bid Share is
// AMOUNT share (New/Returning contribution to this population's total
// amount), never a bidder-COUNT share — see the task's explicit "Bid Share,
// not Rate" requirement.
export default function BidderPopulationCard({ title, total, newCount, returningCount, amountLabel, newAmount, returningAmount }) {
  const totalAmount = newAmount + returningAmount;
  const newSharePct = totalAmount > 0 ? (newAmount / totalAmount) * 100 : 0;
  const returningSharePct = totalAmount > 0 ? (returningAmount / totalAmount) * 100 : 0;

  return (
    <div className="border border-gridline rounded-lg p-4 bg-plane">
      <div className="text-[13px] uppercase tracking-wide text-ink2 font-semibold mb-1">{title}</div>
      <div className="font-display text-[28px] leading-none text-ink mb-1">{total}</div>
      <div className="text-[13.5px] text-ink mb-3">
        {newCount} New · {returningCount} Returning
      </div>

      <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">{amountLabel}</div>
      <div className="text-[20px] tabular text-series1 font-semibold mb-2">{formatCompactPeso(totalAmount)}</div>

      <div className="h-1.5 rounded-full overflow-hidden bg-gridline mb-1.5">
        <div className="bg-series1 h-full" style={{ width: `${newSharePct}%` }} />
      </div>
      <div className="flex justify-between gap-3 text-[13px] text-ink">
        <span>New · {formatPeso(newAmount)} · {newSharePct.toFixed(1)}% share</span>
        <span className="text-right">Returning · {formatPeso(returningAmount)} · {returningSharePct.toFixed(1)}% share</span>
      </div>
    </div>
  );
}
