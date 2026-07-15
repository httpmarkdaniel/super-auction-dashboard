import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";

export default function CategoryStrip({ data: categoryBreakdown }) {
  const sorted = [...categoryBreakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  return (
    <Card title="By Category · Today">
      <RankedBar rows={sorted} labelKey="category" valueKey="bidAmount" showRank={false} />
    </Card>
  );
}
