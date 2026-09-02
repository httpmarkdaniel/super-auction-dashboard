import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";

export default function Leaderboard({ title, rows, nameKey, metaLabel, metaKey, badgeKey, hoverKind, emptyMessage }) {
  return (
    <Card title={title} className="flex-1">
      <RankedBar rows={rows} labelKey={nameKey} valueKey="bidAmount" metaKey={metaKey} metaLabel={metaLabel} badgeKey={badgeKey} hoverKind={hoverKind} emptyMessage={emptyMessage} showAvg />
    </Card>
  );
}
