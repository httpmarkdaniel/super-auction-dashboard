import StatTile from "./primitives/StatTile";
import { formatPeso } from "../utils/format";

export default function HeroKPIs({ data: heroKPIs }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatTile
        eyebrow="Total Bid Amount · Today"
        value={formatPeso(heroKPIs.totalBidAmount)}
        delta={heroKPIs.totalBidAmountDeltaPct}
        sub="vs yesterday"
        accent
      />
      <StatTile
        eyebrow="Sell-Through Rate"
        value={`${heroKPIs.sellThroughRate}%`}
        delta={heroKPIs.sellThroughDeltaPct}
        sub="vs last week"
      />
      <StatTile eyebrow="Active Auctions" value={heroKPIs.activeAuctionsNow} live />
      <StatTile
        eyebrow="Buyer's Premium + Fees"
        value={formatPeso(heroKPIs.buyersPremiumPlusFees)}
        delta={heroKPIs.buyersPremiumDeltaPct}
        sub="HMR revenue"
      />
      <StatTile
        eyebrow="Lots Sold / Listed"
        value={`${heroKPIs.lotsSold} / ${heroKPIs.lotsListed}`}
        sub={`${((heroKPIs.lotsSold / heroKPIs.lotsListed) * 100).toFixed(0)}% cleared`}
      />
    </div>
  );
}
