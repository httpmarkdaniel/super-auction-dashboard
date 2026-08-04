import Leaderboard from "./Leaderboard";
import StatTile from "./primitives/StatTile";
import Card from "./primitives/Card";
import DivergingBar from "./primitives/DivergingBar";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import HourlyTrend from "./HourlyTrend";
import UnsoldLotsCard from "./UnsoldLotsCard";
import VendorPayablesBacklog from "./VendorPayablesBacklog";
import MoneyFlowWaterfall from "./MoneyFlowWaterfall";
import OperationsTable from "./OperationsTable";
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
  const { overview: o, leaderboards, payables, lots } = live;

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
    vendorPayablesBacklog: {
      totalBacklog: Number(payables.total_backlog) || 0,
      aging: [
        { bucket: "0–30 days", value: Number(payables.aged_0_30) || 0, status: "good" },
        { bucket: "31–60 days", value: Number(payables.aged_31_60) || 0, status: "warning" },
        { bucket: "60+ days", value: Number(payables.aged_60_plus) || 0, status: "critical" },
      ],
    },
    moneyFlow: [
      { stage: "Bid Amount", value: totalBidAmount, type: "total" },
      { stage: "Buyer's Premium", value: -buyersPremium, type: "deduction" },
      { stage: "Service Fee", value: -serviceFee, type: "deduction" },
      { stage: "Net Vendor Payable", value: netVendorPayable, type: "result" },
    ],
    operationsDetail: (lots.lots || []).map((l) => ({ ...l, status: STATUS_MAP[l.status] ?? l.status })),
  };
}

export default function CategoryView({ category, store, dateRange, rangeLabel = "Today", refreshNonce }) {
  const { data: live, loading, error } = useCategoryOverview(category, store, dateRange, refreshNonce);

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[13px]">
        Couldn't load {category} data: {error}
      </div>
    );
  }
  if (loading || !live) {
    return <div className="text-center text-ink text-[13px] py-12">Loading {category} data…</div>;
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

      <StorySection title="Fee economics" insight={story.feeInsight}>
        <div className="grid grid-cols-3 gap-4">
          <StatTile eyebrow="Avg Buyer's Premium" value={`${d.avgBuyersPremiumPct}%`} />
          <StatTile eyebrow="Avg Commission" value={`${d.avgCommissionPct}%`} />
          <StatTile eyebrow="Avg Premium over Reserve" value={`${d.avgPremiumOverReservePct}%`} />
        </div>
      </StorySection>

      <StorySection title="Who's driving this category" insight={story.peopleInsight}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard title={`Top Vendors · ${category}`} rows={d.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
          <Leaderboard title={`Top Bidders · ${category}`} rows={d.topBidders} nameKey="bidder" metaKey="wins" metaLabel="wins" />
        </div>
      </StorySection>

      <StorySection title="Bidding pace" insight={story.paceInsight}>
        <HourlyTrend data={d.hourlyTrend} rangeLabel={rangeLabel} />
      </StorySection>

      <StorySection title="What needs attention" insight={story.attentionInsight}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Card title="Reserve Price Performance">
              <DivergingBar segments={reserveSegments} />
            </Card>
          </div>
          <UnsoldLotsCard data={d.unsoldLots} />
        </div>
        <div className="mt-4">
          <VendorPayablesBacklog data={d.vendorPayablesBacklog} />
        </div>
      </StorySection>

      <StorySection title="Where the money goes" insight={story.moneyFlowInsight}>
        <MoneyFlowWaterfall data={d.moneyFlow} rangeLabel={rangeLabel} />
      </StorySection>

      <StorySection
        title="Full lot detail"
        insight={`Drill into every individual ${category} lot from ${
          rangeLabel === "Today" ? "today" : `the ${rangeLabel.toLowerCase()}`
        } below.`}
        last
      >
        <OperationsTable data={d.operationsDetail} />
      </StorySection>
    </div>
  );
}
