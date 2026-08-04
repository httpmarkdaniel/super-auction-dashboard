import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";

export default function BranchStrip({ data: branchBreakdown, rangeLabel = "Today" }) {
  const sorted = [...branchBreakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  return (
    <Card title={`By Branch · ${rangeLabel}`}>
      <RankedBar rows={sorted} labelKey="branch" valueKey="bidAmount" showRank={false} />
    </Card>
  );
}
