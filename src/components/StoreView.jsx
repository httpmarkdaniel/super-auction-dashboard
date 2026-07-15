import StatTile from "./primitives/StatTile";
import Leaderboard from "./Leaderboard";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import { getStoreDetail } from "../mockData";
import { formatPeso } from "../utils/format";
import { buildStoreStoryline } from "../insights";

export default function StoreView({ store }) {
  const d = getStoreDetail(store);
  const story = buildStoreStoryline(d, store);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader eyebrow={`${store} · Today's Story`} headline={story.headline} amount={formatPeso(d.totalBidAmount)} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatTile eyebrow="Sell-Through Rate" value={`${d.sellThroughRate}%`} />
          <StatTile eyebrow="Lots Sold / Listed" value={`${d.lotsSold} / ${d.lotsListed}`} />
          <StatTile eyebrow="Avg Bid per Item" value={formatPeso(d.avgBidPerItem)} />
          <StatTile eyebrow="Active Auctions" value={d.activeAuctions} live={d.activeAuctions > 0} />
        </div>
      </div>

      <StorySection title="Who's driving results here" insight={story.peopleInsight} last>
        <Leaderboard title={`Top Vendors · ${store}`} rows={d.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
      </StorySection>
    </div>
  );
}
