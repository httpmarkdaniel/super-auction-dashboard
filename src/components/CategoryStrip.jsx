import Card from "./primitives/Card";
import EntityBreakdownRow from "./primitives/EntityBreakdownRow";
import { formatPeso } from "../utils/format";

export default function CategoryStrip({ data: categoryBreakdown, rangeLabel = "Today", onSelectCategory }) {
  const sorted = [...categoryBreakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  const total = sorted.reduce((s, r) => s + r.bidAmount, 0);
  const max = Math.max(...sorted.map((r) => r.bidAmount), 1);

  if (sorted.length === 0) {
    return (
      <Card title={`By Category · ${rangeLabel}`}>
        <div className="text-center text-muted text-[15px] py-6">No settled auction results yet for this period.</div>
      </Card>
    );
  }

  return (
    <Card title={`By Category · ${rangeLabel}`}>
      <div className="space-y-3">
        {sorted.map((r) => (
          <EntityBreakdownRow
            key={r.category}
            label={r.category}
            bidAmount={r.bidAmount}
            share={r.share}
            max={max}
            detail={r}
            onClick={() => onSelectCategory?.(r.category)}
          />
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-gridline text-right text-[15.5px] font-semibold text-toneRedText">
        Total: {formatPeso(total)}
      </div>
    </Card>
  );
}
