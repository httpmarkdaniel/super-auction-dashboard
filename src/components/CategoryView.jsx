import Leaderboard from "./Leaderboard";
import StatTile from "./primitives/StatTile";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import HourlyTrend from "./HourlyTrend";
import { formatPeso } from "../utils/format";
import { buildCategoryStoryline } from "../insights";
import { useCategoryOverview } from "../useCategoryOverview";

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
});

// Reshapes /api/overview and /api/leaderboards (both called with
// ?category=X) into what CategoryView renders — story header + the four
// top KPI tiles, Top Vendors & Bidders, and Bidding Activity by Hour. See
// useCategoryOverview.js for why no other endpoint is fetched here.
function buildLiveCategoryData(live) {
  const { overview: o, leaderboards } = live;

  const totalBidAmount = Number(o.total_bid_amount) || 0;
  const endedLotsListed = Number(o.ended_lots_listed) || 0;
  const endedLotsSold = Number(o.ended_lots_sold) || 0;
  const lotsUnsold = Number(o.unsold_count) || 0;

  // No mock fallback — an empty array is a real, honest "no activity in
  // this scope" result, not a sign the data hasn't loaded.
  const hourlyRows = (o.hourly || []).filter((h) => h.hour != null);
  const hourlyTrend = hourlyRows.map((h) => ({ hour: HOUR_LABELS[Number(h.hour)], bidAmount: Number(h.bid_amount) || 0 }));

  return {
    totalBidAmount,
    sellThroughRate: endedLotsListed > 0 ? Math.round((endedLotsSold / endedLotsListed) * 100) : 0,
    lotsSold: endedLotsSold,
    lotsListed: endedLotsListed,
    lotsUnsold,
    avgBidPerLot: endedLotsListed > 0 ? Math.round(totalBidAmount / endedLotsListed) : 0,
    totalAuctions: Number(o.total_auctions) || 0,
    topVendors: (leaderboards.vendors || []).map((v) => ({
      vendor: v.vendor,
      bidAmount: Number(v.bid_amount) || 0,
      lots: Number(v.lots) || 0,
    })),
    topBidders: (leaderboards.bidders || []).map((b) => ({
      bidder: b.bidder_name,
      bidAmount: Number(b.bid_amount) || 0,
      wins: Number(b.wins) || 0,
    })),
    hourlyTrend,
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

      <StorySection title="Top Vendors & Bidders" insight="The vendors bringing in the most consignments and the bidders winning the most lots in this category.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard title={`Top Vendors · ${category}`} rows={d.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
          <Leaderboard title={`Top Bidders · ${category}`} rows={d.topBidders} nameKey="bidder" metaKey="wins" metaLabel="wins" />
        </div>
      </StorySection>

      <StorySection title="Bidding Activity by Hour" insight="How bidding activity is spread across the hours of the day." last>
        <HourlyTrend data={d.hourlyTrend} rangeLabel={rangeLabel} />
      </StorySection>
    </div>
  );
}
