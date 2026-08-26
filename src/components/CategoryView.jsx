import StatTile from "./primitives/StatTile";
import StoryHeader from "./StoryHeader";
import { formatPeso } from "../utils/format";
import { buildCategoryStoryline } from "../insights";
import { useCategoryOverview } from "../useCategoryOverview";

// Reshapes /api/overview (called with ?category=X) into the summary
// CategoryView renders — story header + the four top KPI tiles only. See
// useCategoryOverview.js for why no other endpoint is fetched here.
function buildLiveCategoryData(live) {
  const { overview: o } = live;

  const totalBidAmount = Number(o.total_bid_amount) || 0;
  const endedLotsListed = Number(o.ended_lots_listed) || 0;
  const endedLotsSold = Number(o.ended_lots_sold) || 0;
  const lotsUnsold = Number(o.unsold_count) || 0;

  return {
    totalBidAmount,
    sellThroughRate: endedLotsListed > 0 ? Math.round((endedLotsSold / endedLotsListed) * 100) : 0,
    lotsSold: endedLotsSold,
    lotsListed: endedLotsListed,
    lotsUnsold,
    avgBidPerLot: endedLotsListed > 0 ? Math.round(totalBidAmount / endedLotsListed) : 0,
    totalAuctions: Number(o.total_auctions) || 0,
  };
}

export default function CategoryView({ category, store, dateRange, rangeLabel = "Today", refreshNonce }) {
  const { data: live, loading, error } = useCategoryOverview(category, store, dateRange, refreshNonce);

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load {category} data: {error}
      </div>
    );
  }
  if (loading || !live) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading {category} data…</div>;
  }

  const d = buildLiveCategoryData(live);
  const story = buildCategoryStoryline(d, category, store);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${category} · ${store} · ${rangeLabel}${live ? " · Live" : ""} · The Story`}
          headline={story.headline}
          amount={formatPeso(d.totalBidAmount)}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatTile eyebrow="Sell-Through Rate" value={`${d.sellThroughRate}%`} />
          <StatTile eyebrow="Lots Sold / Listed" value={`${d.lotsSold} / ${d.lotsListed}`} sub={`${d.lotsUnsold} unsold`} />
          <StatTile eyebrow="Avg Bid per Lot" value={formatPeso(d.avgBidPerLot)} sub={`${d.totalAuctions} auctions`} />
          <StatTile eyebrow="Total Auctions" value={d.totalAuctions} />
        </div>
      </div>
    </div>
  );
}
