import Card from "./primitives/Card";
import EntityBreakdownRow from "./primitives/EntityBreakdownRow";
import { formatPeso } from "../utils/format";

export default function BranchStrip({ data: branchBreakdown, rangeLabel = "Today", onSelectBranch }) {
  const sorted = [...branchBreakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  const total = sorted.reduce((s, r) => s + r.bidAmount, 0);
  const max = Math.max(...sorted.map((r) => r.bidAmount), 1);

  if (sorted.length === 0) {
    return (
      <Card title={`By Branch · ${rangeLabel}`}>
        <div className="text-center text-muted text-[15px] py-6">No settled auction results yet for this period.</div>
      </Card>
    );
  }

  return (
    <Card title={`By Branch · ${rangeLabel}`}>
      <div className="space-y-3">
        {sorted.map((r) => (
          <EntityBreakdownRow
            key={r.branch}
            label={r.branch}
            bidAmount={r.bidAmount}
            share={r.share}
            max={max}
            detail={r}
            // "Others" isn't a real, selectable branch — no drilldown target.
            onClick={r.branch === "Others" ? undefined : () => onSelectBranch?.(r.branch)}
          />
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-gridline text-right text-[15.5px] font-semibold text-toneRedText">
        Total: {formatPeso(total)}
      </div>
    </Card>
  );
}
