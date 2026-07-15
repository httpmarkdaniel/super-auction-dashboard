import Leaderboard from "./Leaderboard";
import StatTile from "./primitives/StatTile";
import Card from "./primitives/Card";
import DivergingBar from "./primitives/DivergingBar";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import { getCategoryForStore } from "../mockData";
import { formatPeso } from "../utils/format";
import { buildCategoryStoryline } from "../insights";

export default function CategoryView({ category, store }) {
  const d = getCategoryForStore(category, store);
  if (!d) return null;

  const story = buildCategoryStoryline(d, category, store);

  const reserveSegments = [
    {
      label: "Sold At/Below Reserve",
      role: "neg",
      count: d.soldAtOrBelowReserve,
      pct: Number((100 - d.pctSoldAboveReserve).toFixed(1)),
    },
    {
      label: "Sold Above Reserve",
      role: "pos",
      count: d.soldAboveReserve,
      pct: d.pctSoldAboveReserve,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <StoryHeader eyebrow={`${category} · ${store} · Today's Story`} headline={story.headline} amount={formatPeso(d.totalBidAmount)} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatTile eyebrow="Sell-Through Rate" value={`${d.sellThroughRate}%`} />
          <StatTile eyebrow="Lots Sold / Listed" value={`${d.lotsSold} / ${d.lotsListed}`} sub={`${d.lotsUnsold} unsold`} />
          <StatTile eyebrow="Avg Bid per Lot" value={formatPeso(d.avgBidPerLot)} sub={`${d.totalAuctions} auctions`} />
          <StatTile eyebrow="Total Auctions" value={d.totalAuctions} />
        </div>
      </div>

      <StorySection title="Where lots landed vs. reserve" insight={story.reserveInsight}>
        <Card title="Reserve Price Performance">
          <DivergingBar segments={reserveSegments} />
        </Card>
      </StorySection>

      <StorySection title="Fee economics" insight={story.feeInsight}>
        <div className="grid grid-cols-3 gap-4">
          <StatTile eyebrow="Avg Buyer's Premium" value={`${d.avgBuyersPremiumPct}%`} />
          <StatTile eyebrow="Avg Commission" value={`${d.avgCommissionPct}%`} />
          <StatTile eyebrow="Avg Premium over Reserve" value={`${d.avgPremiumOverReservePct}%`} />
        </div>
      </StorySection>

      <StorySection title="Who's driving this category" insight={story.peopleInsight} last>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard title={`Top Vendors · ${category}`} rows={d.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
          <Leaderboard title={`Top Bidders · ${category}`} rows={d.topBidders} nameKey="bidder" metaKey="wins" metaLabel="wins" />
        </div>
      </StorySection>
    </div>
  );
}
