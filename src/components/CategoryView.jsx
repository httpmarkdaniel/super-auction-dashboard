import Leaderboard from "./Leaderboard";
import StatTile from "./primitives/StatTile";
import Card from "./primitives/Card";
import DivergingBar from "./primitives/DivergingBar";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import HourlyTrend from "./HourlyTrend";
import UnsoldLotsCard from "./UnsoldLotsCard";
import VendorPayablesBreakdown from "./VendorPayablesBreakdown";
import MoneyFlowWaterfall from "./MoneyFlowWaterfall";
import AuctionSummaryTable from "./AuctionSummaryTable";
import { formatPeso } from "../utils/format";
import { buildCategoryStoryline } from "../insights";
import { useCategoryOverview } from "../useCategoryOverview";

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
});

const STATUS_MAP = { Paid: "Sold", Released: "Sold", Unpaid: "For Approval", Outstanding: "For Approval", Unsold: "Unsold", Returned: "Unsold", Refunded: "Sold" };

// Reshapes /api/overview, /api/leaderboards, /api/payables, /api/lots
// (each called with ?category=X) into the same shape CategoryView already
// renders, mirroring App.jsx's buildLiveOverview for the main Overview tab.
function buildLiveCategoryData(live) {
  const { overview: o, leaderboards, lots } = live;

  const totalBidAmount = Number(o.total_bid_amount) || 0;
  const buyersPremium = Number(o.buyers_premium_amount) || 0;
  const serviceFee = Number(o.service_fee_amount) || 0;
  const endedLotsListed = Number(o.ended_lots_listed) || 0;
  const endedLotsSold = Number(o.ended_lots_sold) || 0;
  const lotsUnsold = Number(o.unsold_count) || 0;
  const soldAtOrBelow = Number(o.sold_at_or_below) || 0;
  const soldAbove = Number(o.sold_above) || 0;
  const reserveSample = soldAtOrBelow + soldAbove;

  // No mock fallback here on purpose — an empty array is a real, honest
  // "no activity in this scope" result (e.g. a category with zero bids
  // this week), not a sign the data hasn't loaded. Falling back to mock
  // would silently show fabricated vendors/bidders/hours as if real.
  const hourlyRows = (o.hourly || []).filter((h) => h.hour != null);
  const hourlyTrend = hourlyRows.map((h) => ({ hour: HOUR_LABELS[Number(h.hour)], bidAmount: Number(h.bid_amount) || 0 }));

  const netVendorPayable = totalBidAmount - buyersPremium - serviceFee;

  return {
    totalBidAmount,
    sellThroughRate: endedLotsListed > 0 ? Math.round((endedLotsSold / endedLotsListed) * 100) : 0,
    lotsSold: endedLotsSold,
    lotsListed: endedLotsListed,
    lotsUnsold,
    avgBidPerLot: endedLotsListed > 0 ? Math.round(totalBidAmount / endedLotsListed) : 0,
    totalAuctions: Number(o.total_auctions) || 0,
    avgBuyersPremiumPct: Number((Number(o.avg_buyers_premium_pct) || 0).toFixed(1)),
    avgCommissionPct: Number((Number(o.avg_commission_pct) || 0).toFixed(1)),
    avgPremiumOverReservePct: Number((Number(o.avg_premium_over_reserve_pct) || 0).toFixed(1)),
    soldAtOrBelowReserve: soldAtOrBelow,
    soldAboveReserve: soldAbove,
    pctSoldAboveReserve: reserveSample > 0 ? Number(((soldAbove / reserveSample) * 100).toFixed(1)) : 0,
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
    unsoldLots: { count: lotsUnsold, value: Number(o.unsold_value) || 0 },
    moneyFlow: [
      { stage: "Bid Amount", value: totalBidAmount, type: "total" },
      { stage: "Buyer's Premium", value: -buyersPremium, type: "deduction" },
      { stage: "Commission", value: -serviceFee, type: "deduction" },
      { stage: "Net Vendor Payable", value: netVendorPayable, type: "result" },
    ],
    operationsDetail: (lots.lots || []).map((l) => ({ ...l, status: STATUS_MAP[l.status] ?? l.status })),
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

      <StorySection title="Commission & Fees" insight="The average commission and buyer's premium rates HMR charges on this category.">
        <div className="grid grid-cols-3 gap-4">
          <StatTile eyebrow="Avg Buyer's Premium" value={`${d.avgBuyersPremiumPct}%`} />
          <StatTile eyebrow="Avg Commission" value={`${d.avgCommissionPct}%`} />
          <StatTile eyebrow="Avg Premium over Reserve" value={`${d.avgPremiumOverReservePct}%`} />
        </div>
      </StorySection>

      <StorySection title="Top Vendors & Bidders" insight="The vendors bringing in the most consignments and the bidders winning the most lots in this category.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard title={`Top Vendors · ${category}`} rows={d.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
          <Leaderboard title={`Top Bidders · ${category}`} rows={d.topBidders} nameKey="bidder" metaKey="wins" metaLabel="wins" />
        </div>
      </StorySection>

      <StorySection title="Bidding Activity by Hour" insight="How bidding activity is spread across the hours of the day.">
        <HourlyTrend data={d.hourlyTrend} rangeLabel={rangeLabel} />
      </StorySection>

      <StorySection title="What Needs Attention" insight="Reserve-price performance and unsold lots for this category.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Card title="Reserve Price Performance">
              <DivergingBar segments={reserveSegments} />
            </Card>
          </div>
          <UnsoldLotsCard data={d.unsoldLots} />
        </div>
      </StorySection>

      {live.payables ? (
        <VendorPayablesBreakdown data={live.payables} scopeLabel={category} isLastSection={false} />
      ) : (
        <StorySection title="Vendor Payables" insight="Category-scoped vendor payables are not available yet." last={false}>
          <div className="text-center text-muted text-[15.5px] py-8">
            Vendor Payables by category is deferred — there is no real payables data source
            (no /api/payables endpoint) to scope by category yet.
          </div>
        </StorySection>
      )}

      <StorySection title="Revenue & Payout Breakdown" insight="How the total bid amount splits between buyer's premium, service fees, and what's left for the vendor.">
        <MoneyFlowWaterfall data={d.moneyFlow} rangeLabel={rangeLabel} />
      </StorySection>

      <StorySection
        title="Full Auction Detail"
        insight={`Every ${category} auction from the selected date range, rolled up from its individual lots.`}
        last
      >
        <AuctionSummaryTable data={d.operationsDetail} />
      </StorySection>
    </div>
  );
}
