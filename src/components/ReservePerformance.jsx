import Card from "./primitives/Card";
import DivergingBar from "./primitives/DivergingBar";

export default function ReservePerformance({ data: reservePerformance }) {
  const segments = [
    { label: "Below Reserve", role: "neg", ...reservePerformance.belowReserve },
    { label: "At Reserve", role: "mid", ...reservePerformance.atReserve },
    { label: "Above Reserve", role: "pos", ...reservePerformance.aboveReserve },
  ];
  return (
    <Card title="Reserve Price Performance" subtitle="Where sold lots landed vs. vendor's minimum price" className="flex-1">
      <DivergingBar segments={segments} />
    </Card>
  );
}
