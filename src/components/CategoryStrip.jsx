import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";
import { formatPeso } from "../utils/format";

export default function CategoryStrip({ data: categoryBreakdown, rangeLabel = "Today" }) {
  const sorted = [...categoryBreakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  const total = sorted.reduce((s, r) => s + r.bidAmount, 0);
  return (
    <Card title={`By Category · ${rangeLabel}`}>
      <RankedBar rows={sorted} labelKey="category" valueKey="bidAmount" showRank={false} />
      <div className="mt-4 pt-3 border-t border-gridline text-right text-[15.5px] font-semibold text-toneRedText">
        Total: {formatPeso(total)}
      </div>
    </Card>
  );
}
