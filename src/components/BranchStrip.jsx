import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";
import { branchBreakdown } from "../mockData";

export default function BranchStrip() {
  const sorted = [...branchBreakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  return (
    <Card title="By Branch · Today">
      <RankedBar rows={sorted} labelKey="branch" valueKey="bidAmount" showRank={false} />
    </Card>
  );
}
