import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";
import StatTile from "./primitives/StatTile";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import { formatPeso } from "../utils/format";
import { scopePossessive } from "../insights";

export default function AuctionTypeView({ store, data: breakdown, rangeLabel = "Today", isLive }) {
  const sorted = [...breakdown].sort((a, b) => b.bidAmount - a.bidAmount);
  const top = sorted[0];
  const total = sorted.reduce((s, t) => s + t.bidAmount, 0) || 1;
  const topShare = top ? Math.round((top.bidAmount / total) * 100) : 0;

  const headline = top
    ? `${top.type} leads ${scopePossessive(store)} sale channels at ${formatPeso(
        top.bidAmount
      )} (${topShare}% of bid value), clearing ${top.sellThroughRate}% of its lots.`
    : `No sale-channel activity recorded ${scopePossessive(store)} for this period.`;

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · Sale Channels · ${rangeLabel}${isLive ? " · Live" : ""}`}
          headline={headline}
        />
      </div>

      <StorySection title="Bid amount by sale channel" insight="Ranked by gross bid value across channels." last>
        <div className="space-y-4">
          <Card title="Bid Amount by Sale Channel">
            <RankedBar rows={sorted} labelKey="type" valueKey="bidAmount" showRank={false} />
          </Card>

          <div className="flex flex-wrap gap-4">
            {sorted.map((t) => (
              <StatTile key={t.type} eyebrow={t.type} value={`${t.sellThroughRate}%`} sub={`${t.lots} lots`} />
            ))}
          </div>
        </div>
      </StorySection>
    </div>
  );
}
