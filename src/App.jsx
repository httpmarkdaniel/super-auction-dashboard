import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import { CATEGORY_NAMES as CATEGORY_TABS } from "../api/_category.js";
import Topbar from "./components/Topbar";
import StorySection from "./components/primitives/StorySection";
import HeroKPIs from "./components/HeroKPIs";
import CategoryStrip from "./components/CategoryStrip";
import BranchStrip from "./components/BranchStrip";
import Leaderboard from "./components/Leaderboard";
import BidTrendChart from "./components/BidTrendChart";
import BidderPopulationCard from "./components/BidderPopulationCard";
import CategoryView from "./components/CategoryView";
import LiveAuctionView from "./components/LiveAuctionView";
import UpcomingAuctionsView from "./components/UpcomingAuctionsView";
import ExportView from "./components/ExportView";
import TrendsView from "./components/TrendsView";
import AuctionTypeView from "./components/AuctionTypeView";
import StoreView from "./components/StoreView";
import PayablesView from "./components/PayablesView";
import FullAuctionDetailView from "./components/FullAuctionDetailView";
import BiddingPaceView from "./components/BiddingPaceView";
import RevenueBreakdownView from "./components/RevenueBreakdownView";
import { buildStoryline } from "./insights";
import { ALL_STORES, STORE_OPTIONS } from "./mockData";
import { useLiveOverview } from "./useLiveOverview";
import { useLiveBidCorrection } from "./useLiveBidding";
import { useStoreList } from "./useStoreList";
import { resolveDateRange, defaultDateRange } from "./utils/dateRange";

const AGING_STATUS = ["good", "warning", "critical"];

const AUTO_REFRESH_MS = 30000;

function formatUpdatedAt(date) {
  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
});

const EMPTY_OVERVIEW = {
  heroKPIs: {
    totalBidAmount: 0,
    todaysBidAmount: 0,
    totalBidAmountDeltaPct: undefined,
    totalBidAmountWeekDeltaPct: undefined,
    totalBidAmountMonthDeltaPct: undefined,
    activeAuctionsNow: 0,
    sellThroughRate: 0,
    sellThroughDeltaPct: undefined,
    serviceIncome: 0,
    serviceIncomeDeltaPct: undefined,
    lotsSold: 0,
    lotsListed: 0,
    pendingApprovalCount: 0,
    pendingApprovalValue: 0,
    auctionsConcluded: 0,
    avgBidPerAuction: null,
    avgBidPerSoldLot: null,
    registeredCustomers: 0,
    participatingRegisteredBidders: 0,
    registrationConversionPct: null,
  },

  unsoldLots: {
    count: 0,
    value: 0,
    deltaPct: undefined,
    avgAgeDays: 0,
    fresh: 0,
    aging: 0,
    stale: 0,
    totalInventory: 0,
    withReserveCount: 0,
    withReserveValue: 0,
  },

  categoryBreakdown: [],
  branchBreakdown: [],
  branchTally: [],
  categoryTally: [],
  auctionNumbersInRange: new Set(),
  channelBreakdown: [],
  hourlyTrend: [],

  bidderComposition: {
    newBidders: 0,
    returningBidders: 0,
    newBiddersBidAmount: 0,
    returningBiddersBidAmount: 0,
    newBidderTrend: [],
    byAuction: [],
  },

  participatingComposition: {
    total: 0,
    newBidders: 0,
    returningBidders: 0,
    newBidActivity: 0,
    returningBidActivity: 0,
  },

  auctionSummary: [],
  bidTrend: [],
  bidTrendGrain: "day",

  topVendors: [],
  topBidders: [],

  reservePerformance: {
    belowReserve: { count: 0, value: 0, pct: 0 },
    atReserve: { count: 0, value: 0, pct: 0 },
    aboveReserve: { count: 0, value: 0, pct: 0 },
  },

  vendorPayablesBacklog: {
    totalBacklog: 0,
    aging: [
      { bucket: "0–30 days", value: 0, status: "good" },
      { bucket: "31–60 days", value: 0, status: "warning" },
      { bucket: "60+ days", value: 0, status: "critical" },
    ],
  },

  operationsDetail: [],
  settledLots: [],
  activeAuctionRows: [],
  unsoldLotRows: [],
  serviceIncomeLots: [],
  forApprovalLots: [],

  moneyFlow: [
    { stage: "Bid Amount", value: 0, type: "total" },
    { stage: "Commission", value: 0, type: "deduction" },
    { stage: "Buyer's Premium", value: 0, type: "deduction" },
    { stage: "Service Fee", value: 0, type: "deduction" },
    { stage: "Net Vendor Payable", value: 0, type: "result" },
  ],
};

function buildLiveOverview(live, bidCorrectionDelta) {
  const {
    overview: kpis,
    leaderboards,
    reservePerformance,
    categories,
    lots,
    payables,
    settledLots,
    activeAuctionRows,
    unsoldLotRows,
    serviceIncomeLots,
    forApprovalLots,
  } = live;

  const totalLots = Number(kpis.total_lots) || 0;
  const totalPaid = Number(kpis.total_paid) || 0;

  const endedLotsListed = Number(kpis.ended_lots_listed) || 0;
  const endedLotsSold = Number(kpis.ended_lots_sold) || 0;

  const categoryRows = (categories.categories || []).filter(
    (c) => c.category && c.bid_amount != null,
  );

  const categoryTotal =
    categoryRows.reduce((s, c) => s + Number(c.bid_amount), 0) || 1;

  const categoryBreakdown = categoryRows
    .slice(0, 8)
    .map((c) => ({
      category: c.category,
      bidAmount: Number(c.bid_amount),
      share: Number(
        ((Number(c.bid_amount) / categoryTotal) * 100).toFixed(1),
      ),
    }));

  const channelRows = categories.channels || [];

  const channelBreakdown = channelRows.map((c) => ({
    type: c.channel,
    bidAmount: Number(c.bidAmount) || 0,
    lots: Number(c.endedLotsListed) || 0,
    sellThroughRate:
      c.endedLotsListed > 0
        ? Math.round((c.endedLotsSold / c.endedLotsListed) * 100)
        : 0,
  }));

  const branchRows = (kpis.branches || []).filter(
    (b) => b.branch && b.bid_amount != null,
  );

  const branchTotal =
    branchRows.reduce((s, b) => s + Number(b.bid_amount), 0) || 1;

  const topBranches = branchRows.slice(0, 7);

  const otherBranchesTotal = branchRows
    .slice(7)
    .reduce((s, b) => s + Number(b.bid_amount), 0);

  const branchBreakdown = [
    ...topBranches.map((b) => ({
      branch: b.branch,
      bidAmount: Number(b.bid_amount),
    })),

    ...(otherBranchesTotal > 0
      ? [{ branch: "Others", bidAmount: otherBranchesTotal }]
      : []),
  ].map((b) => ({
    ...b,
    share: Number(((b.bidAmount / branchTotal) * 100).toFixed(1)),
  }));

  // Keep this because HeroKPIs still uses the hourly trend/sparkline.
  const hourlyRows = (kpis.hourly || []).filter(
    (h) => h.hour != null,
  );

  const hourlyTrend = hourlyRows.map((h) => ({
    hour: HOUR_LABELS[Number(h.hour)],
    bidAmount: Number(h.bid_amount) || 0,
  }));

  const composition = leaderboards.composition || {};

  const newBidders =
    Number(composition.new_bidders) || 0;

  const returningBidders =
    Number(composition.returning_bidders) || 0;

  /*
   * Business presentation rule:
   * settled bid value that cannot be classified as New is included
   * under Returning for the Overview bidder-value presentation.
   *
   * We do NOT fabricate an additional Returning bidder count here.
   * Only the value is absorbed.
   */
  const bidderComposition = {
    newBidders,
    returningBidders,

    newBiddersBidAmount:
      Number(composition.new_bidders_bid_amount) || 0,

    returningBiddersBidAmount:
      (Number(composition.returning_bidders_bid_amount) || 0) +
      (Number(composition.unclassified_bid_amount) || 0),

    newBidderTrend: (leaderboards.newBidderTrend || []).map((d) => ({
      week: d.day,
      newBidders: Number(d.new_bidders) || 0,
    })),

    byAuction: (leaderboards.perAuctionComposition || []).map((a) => ({
      auctionNumber: a.auction_number,

      newBidders:
        Number(a.new_bidders) || 0,

      returningBidders:
        Number(a.returning_bidders) || 0,

      newBiddersBidAmount:
        Number(a.new_bidders_bid_amount) || 0,

      returningBiddersBidAmount:
        (Number(a.returning_bidders_bid_amount) || 0) +
        (Number(a.unclassified_bid_amount) || 0),
    })),
  };

  // PARTICIPATING bidders — sum of every real bid EVENT in the selected
  // scope (leaderboards.participatingComposition, unchanged
  // bidding_activity_composition definition), a DIFFERENT population from
  // the settled Winning bidderComposition above — see api/leaderboards.js.
  const participating = leaderboards.participatingComposition || {};
  const participatingComposition = {
    total: (Number(participating.new_bidders) || 0) + (Number(participating.returning_bidders) || 0),
    newBidders: Number(participating.new_bidders) || 0,
    returningBidders: Number(participating.returning_bidders) || 0,
    newBidActivity: Number(participating.new_bidders_bid_amount) || 0,
    returningBidActivity: Number(participating.returning_bidders_bid_amount) || 0,
  };

  const topVendors = (leaderboards.vendors || []).map((v) => ({
    vendor: v.vendor,
    bidAmount: Number(v.settled_bid_amount) || 0,
    lots: Number(v.settled_lots) || 0,
  }));

  const topBidders = (leaderboards.bidders || []).map((b) => ({
    // Canonical New/Returning label reused from the backend classification
    // (api/leaderboards.js's settledBiddersResult) — never inferred on the
    // frontend from name/email.
    bidder: `${b.bidder_name} · ${b.new_or_returning === "new" ? "New" : "Returning"}`,
    bidAmount: Number(b.settled_bid_amount) || 0,
    wins: Number(b.settled_wins) || 0,
  }));

  const rp = reservePerformance;

  const reserveTotalValue =
    (Number(rp.below_value) || 0) +
      (Number(rp.at_value) || 0) +
      (Number(rp.above_value) || 0) ||
    1;

  const pct = (v) =>
    Number(((v / reserveTotalValue) * 100).toFixed(1));

  const bidAmount =
    (Number(kpis.total_bid_amount) || 0) +
    (bidCorrectionDelta || 0);

  const commission =
    Number(kpis.total_commission) || 0;

  const buyersPremium =
    Number(kpis.total_buyers_premium) || 0;

  const serviceFee =
    Number(kpis.total_service_fee) || 0;

  const netVendorPayable =
    bidAmount - commission - buyersPremium - serviceFee;

  const weekCurrent =
    Number(kpis.week_current) || 0;

  const weekPrevious =
    Number(kpis.week_previous) || 0;

  const monthCurrent =
    Number(kpis.month_current) || 0;

  const monthPrevious =
    Number(kpis.month_previous) || 0;

  const totalBidAmountWeekDeltaPct =
    weekPrevious > 0
      ? Number(
          (
            ((weekCurrent - weekPrevious) / weekPrevious) *
            100
          ).toFixed(1),
        )
      : undefined;

  const totalBidAmountMonthDeltaPct =
    monthPrevious > 0
      ? Number(
          (
            ((monthCurrent - monthPrevious) / monthPrevious) *
            100
          ).toFixed(1),
        )
      : undefined;

  const moneyFlow = [
    {
      stage: "Bid Amount",
      value: bidAmount,
      type: "total",
    },
    {
      stage: "Commission",
      value: -commission,
      type: "deduction",
    },
    {
      stage: "Buyer's Premium",
      value: -buyersPremium,
      type: "deduction",
    },
    {
      stage: "Service Fee",
      value: -serviceFee,
      type: "deduction",
    },
    {
      stage: "Net Vendor Payable",
      value: netVendorPayable,
      type: "result",
    },
  ];

  const bidderByAuction = new Map(
    (leaderboards.perAuctionComposition || []).map((row) => [
      row.auction_number,
      {
        participatingBidders:
          Number(row.participating_bidders) || 0,

        participatingBidAmount:
          Number(row.participating_bid_amount) || 0,

        participatingNewBidders:
          Number(row.participating_new_bidders) || 0,

        participatingNewBidAmount:
          Number(row.participating_new_bid_amount) || 0,

        participatingReturningBidders:
          Number(row.participating_returning_bidders) || 0,

        participatingReturningBidAmount:
          Number(row.participating_returning_bid_amount) || 0,

        winningBidders: 0,
        winningBidAmount: 0,
        winningNewBidders: 0,
        winningNewBidAmount: 0,
        winningReturningBidders: 0,
        winningReturningBidAmount: 0,
      },
    ]),
  );

  const operationsDetail = (lots.lots || []).map((lot) => ({
    ...lot,

    ...(bidderByAuction.get(lot.auctionNumber) || {
      participatingBidders: 0,
      participatingBidAmount: 0,
      participatingNewBidders: 0,
      participatingNewBidAmount: 0,
      participatingReturningBidders: 0,
      participatingReturningBidAmount: 0,

      winningBidders: 0,
      winningBidAmount: 0,
      winningNewBidders: 0,
      winningNewBidAmount: 0,
      winningReturningBidders: 0,
      winningReturningBidAmount: 0,
    }),
  }));

  return {
    heroKPIs: {
      totalBidAmount: bidAmount,

      todaysBidAmount:
        Number(kpis.todays_bid_amount) || 0,

      totalBidAmountDeltaPct: undefined,

      totalBidAmountWeekDeltaPct,

      totalBidAmountMonthDeltaPct,

      // Live "right now" count — active_auctions, NOT total_auctions
      // (that field is the settled/date-scoped Auctions Concluded count,
      // a completely different population — see AUCTIONS CONCLUDED below).
      activeAuctionsNow:
        Number(kpis.active_auctions) || 0,

      sellThroughRate:
        endedLotsListed > 0
          ? Math.round(
              (endedLotsSold / endedLotsListed) * 100,
            )
          : 0,

      sellThroughDeltaPct: undefined,

      serviceIncome:
        (Number(kpis.service_income_buyers_premium) || 0) +
        (Number(kpis.service_income_commission) || 0),

      serviceIncomeDeltaPct: undefined,

      lotsSold: endedLotsSold,

      lotsListed: endedLotsListed,

      // AUCTIONS CONCLUDED / AVG BID PER AUCTION / AVG BID PER SOLD LOT —
      // same settled population as totalBidAmount above (see
      // api/overview.js's AUCTION-LEVEL SUMMARY / settledTotalResult).
      // Safe division: null (rendered as "—") when the denominator is 0,
      // never a fabricated average.
      auctionsConcluded: Number(kpis.auctions_concluded) || 0,
      avgBidPerAuction:
        Number(kpis.auctions_concluded) > 0
          ? bidAmount / Number(kpis.auctions_concluded)
          : null,
      avgBidPerSoldLot:
        Number(kpis.settled_lot_count) > 0
          ? bidAmount / Number(kpis.settled_lot_count)
          : null,

      // REGISTRATION -> BIDDER CONVERSION — see api/overview.js's
      // REGISTRATION -> BIDDER CONVERSION query comment for cohort
      // definition. null (rendered as "—") when nobody registered for an
      // auction in this scope, never a fabricated 0%.
      registeredCustomers: Number(kpis.registered_customers) || 0,
      participatingRegisteredBidders: Number(kpis.participating_registered_bidders) || 0,
      registrationConversionPct:
        Number(kpis.registered_customers) > 0
          ? (Number(kpis.participating_registered_bidders) / Number(kpis.registered_customers)) * 100
          : null,
    },

    unsoldLots: {
      count: Number(kpis.unsold_count) || 0,
      value: Number(kpis.unsold_value) || 0,
      deltaPct: undefined,
      avgAgeDays:
        Math.round(Number(kpis.unsold_avg_age_days) || 0),
      fresh: Number(kpis.unsold_fresh) || 0,
      aging: Number(kpis.unsold_aging) || 0,
      stale: Number(kpis.unsold_stale) || 0,
      totalInventory:
        Number(kpis.total_inventory) || 0,
      withReserveCount:
        Number(kpis.unsold_with_reserve_count) || 0,
      withReserveValue:
        Number(kpis.unsold_with_reserve_value) || 0,
    },

    categoryBreakdown,

    branchBreakdown,

    branchTally: branchRows
      .map((b) => ({
        branch: b.branch,
        bidAmount: Number(b.bid_amount) || 0,
        share: Number(
          (
            (Number(b.bid_amount) / branchTotal) *
            100
          ).toFixed(1),
        ),
      }))
      .sort((a, b) => b.bidAmount - a.bidAmount),

    categoryTally: categoryRows
      .map((c) => ({
        category: c.category,
        bidAmount: Number(c.bid_amount) || 0,
        share: Number(
          (
            (Number(c.bid_amount) / categoryTotal) *
            100
          ).toFixed(1),
        ),
      }))
      .sort((a, b) => b.bidAmount - a.bidAmount),

    auctionNumbersInRange: new Set(
      (kpis.auctions || []).map(
        (a) => a.auction_number,
      ),
    ),

    channelBreakdown,

    hourlyTrend,

    bidderComposition,
    participatingComposition,

    // Auction-grain drilldown rows behind Total Bid Amount/Auctions
    // Concluded/Avg Bid per Auction/Avg Bid per Sold Lot/Lots Sold/Listed
    // — see api/overview.js's AUCTION-LEVEL SUMMARY query comment.
    auctionSummary: (kpis.auction_summary || []).map((a) => ({
      auctionNumber: a.auction_number,
      name: a.name,
      storeName: a.store_name,
      startingTime: a.starting_time,
      lotsListed: Number(a.lots_listed) || 0,
      lotsSold: Number(a.lots_sold) || 0,
      lotsUnsold: Number(a.lots_unsold) || 0,
      settledBidAmount: Number(a.settled_bid_amount) || 0,
      settledLotCount: Number(a.settled_lot_count) || 0,
    })),

    bidTrend: kpis.bid_trend || [],
    bidTrendGrain: kpis.bid_trend_grain || "day",

    topVendors,

    topBidders,

    reservePerformance: {
      belowReserve: {
        count: Number(rp.below_count) || 0,
        value: Number(rp.below_value) || 0,
        pct: pct(Number(rp.below_value) || 0),
      },

      atReserve: {
        count: Number(rp.at_count) || 0,
        value: Number(rp.at_value) || 0,
        pct: pct(Number(rp.at_value) || 0),
      },

      aboveReserve: {
        count: Number(rp.above_count) || 0,
        value: Number(rp.above_value) || 0,
        pct: pct(Number(rp.above_value) || 0),
      },
    },

    vendorPayablesBacklog: {
      totalBacklog:
        Number(payables.total_backlog) || 0,

      aging: [
        {
          bucket: "0–30 days",
          value:
            Number(payables.aged_0_30) || 0,
        },
        {
          bucket: "31–60 days",
          value:
            Number(payables.aged_31_60) || 0,
        },
        {
          bucket: "60+ days",
          value:
            Number(payables.aged_60_plus) || 0,
        },
      ].map((a, i) => ({
        ...a,
        status: AGING_STATUS[i],
      })),
    },

    operationsDetail,
    settledLots: settledLots || [],
    activeAuctionRows: activeAuctionRows || [],
    unsoldLotRows: unsoldLotRows || [],
    serviceIncomeLots: serviceIncomeLots || [],
    forApprovalLots: forApprovalLots || [],

    moneyFlow,
  };
}

function OverviewTab({
  overview,
  rangeLabel,
  loading,
  error,
  categoryOptions,
  selectedCategory,
  onCategoryChange,
}) {
  const story = buildStoryline();

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
          Couldn't load dashboard data: {error}
        </div>
      )}

      {loading && !error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-plane border border-gridline text-ink text-[15.5px]">
          Loading live dashboard data…
        </div>
      )}

      <div className="mb-8">
        <div className="mb-3">
          <div className="text-[13.5px] text-muted">{story.headline}</div>
        </div>
        <HeroKPIs
          overview={overview}
          rangeLabel={rangeLabel}
        />
      </div>

      <StorySection
        title="Bid Trend"
        insight="Settled bid performance over the selected range, plus who's participating vs. who's winning."
      >
        <div className="flex items-center justify-end gap-1.5 mb-3">
          <span className="text-[11px] tracking-[0.06em] uppercase text-muted font-semibold">Overview Category</span>
          <div className="flex items-center bg-surface1 border border-gridline rounded-lg px-2.5 h-8">
            <select
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="text-[14px] font-semibold text-ink bg-transparent outline-none cursor-pointer max-w-[160px]"
            >
              <option value="">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <BidTrendChart data={overview.bidTrend} grain={overview.bidTrendGrain} rangeLabel={rangeLabel} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <BidderPopulationCard
            title="Participating Bidders"
            total={overview.participatingComposition.total}
            newCount={overview.participatingComposition.newBidders}
            returningCount={overview.participatingComposition.returningBidders}
            amountLabel="Bid Activity"
            newAmount={overview.participatingComposition.newBidActivity}
            returningAmount={overview.participatingComposition.returningBidActivity}
          />
          <BidderPopulationCard
            title="Winning Bidders"
            total={overview.bidderComposition.newBidders + overview.bidderComposition.returningBidders}
            newCount={overview.bidderComposition.newBidders}
            returningCount={overview.bidderComposition.returningBidders}
            amountLabel="Winning Bid Amount"
            newAmount={overview.bidderComposition.newBiddersBidAmount}
            returningAmount={overview.bidderComposition.returningBiddersBidAmount}
          />
        </div>
      </StorySection>

      <StorySection
        title="Bid Value by Category & Branch"
        insight="How this period's bid value splits across item categories and store branches."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryStrip
            data={overview.categoryBreakdown}
            rangeLabel={rangeLabel}
          />

          <BranchStrip
            data={overview.branchBreakdown}
            rangeLabel={rangeLabel}
          />
        </div>
      </StorySection>

      <StorySection
        title="Top Vendors & Bidders"
        insight="The vendors bringing in the most consignments and the bidders winning the most lots."
        last
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard
            title={`Top Vendors · ${rangeLabel}`}
            rows={overview.topVendors}
            nameKey="vendor"
            metaKey="lots"
            metaLabel="lots"
          />

          <Leaderboard
            title={`Top Bidders · ${rangeLabel}`}
            rows={overview.topBidders}
            nameKey="bidder"
            metaKey="wins"
            metaLabel="wins"
          />
        </div>
      </StorySection>
    </div>
  );
}

const TITLES = {
  Overview: "Overview",
  "Online Bidding": "Online Bidding",
  "Upcoming Auctions": "Upcoming Auctions",
  Trends: "Yearly Trends",
  "Auction Types": "Sale Channels",
  Stores: "Store Performance",
  "Vendor Payables": "Vendor Payables",
  "Full Auction Detail": "Full Auction Detail",
  "Bidding Pace": "Bidding Pace",
  "Revenue Breakdown": "Revenue Breakdown",
  Export: "Export Report",
};

export default function App() {
  const [tab, setTab] = useState("Overview");

  const [store, setStore] =
    useState(ALL_STORES);

  const [dateRange, setDateRange] =
    useState(defaultDateRange);

  const [overviewCategory, setOverviewCategory] =
    useState("");

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const contentRef = useRef(null);

  function goHome() {
    setTab("Overview");

    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }

  const [refreshNonce, setRefreshNonce] =
    useState(0);

  const [lastUpdated, setLastUpdated] =
    useState(() => new Date());

  const triggerRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    const id = setInterval(
      triggerRefresh,
      AUTO_REFRESH_MS,
    );

    return () => clearInterval(id);
  }, [triggerRefresh]);

  const realStores = useStoreList();

  const storeOptions = realStores?.length
    ? [ALL_STORES, ...realStores]
    : STORE_OPTIONS;

  const {
    data: live,
    loading: overviewLoading,
    error: overviewError,
  } = useLiveOverview(
    dateRange,
    store === ALL_STORES
      ? undefined
      : store,
    overviewCategory,
    refreshNonce,
  );

  const rangeLabel =
    resolveDateRange(dateRange).label;

  const bidCorrectionDelta =
    useLiveBidCorrection(
      live?.overview?.auctions,
      refreshNonce,
    );

  const overview = useMemo(() => {
    if (!live) {
      return EMPTY_OVERVIEW;
    }

    return buildLiveOverview(
      live,
      bidCorrectionDelta,
    );
  }, [live, bidCorrectionDelta]);

  const searchPool = useMemo(
    () =>
      overview.operationsDetail.map((o) => ({
        lotNumber: o.lotNumber,
        primary: o.vendor,
        secondary: o.category,
        status: o.status,
      })),

    [overview],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-plane">
      <Sidebar
        active={tab}
        onChange={setTab}
        onLogoClick={goHome}
        open={sidebarOpen}
        onClose={() =>
          setSidebarOpen(false)
        }
      />

      <main className="flex-1 flex flex-col min-w-0">
        <Topbar
          store={store}
          onStoreChange={setStore}
          onExportClick={() =>
            setTab("Export")
          }
          onMenuClick={() =>
            setSidebarOpen(true)
          }
          searchPool={searchPool}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          storeOptions={storeOptions}
          updatedAt={formatUpdatedAt(
            lastUpdated,
          )}
          onRefresh={triggerRefresh}
        />

        <div className="flex items-center gap-3 px-4 md:px-10 pt-5">
          <h1 className="flex items-center gap-2.5 text-[15.5px] uppercase tracking-[0.14em] font-bold text-navy shrink-0">
            <span className="w-12 h-[3px] bg-navy" />
            {TITLES[tab] || tab}
          </h1>
        </div>

        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 md:px-10 md:py-8 max-w-[1400px]"
        >
          {tab === "Overview" && (
            <OverviewTab
              overview={overview}
              rangeLabel={rangeLabel}
              loading={overviewLoading}
              error={overviewError}
              categoryOptions={CATEGORY_TABS}
              selectedCategory={overviewCategory}
              onCategoryChange={
                setOverviewCategory
              }
            />
          )}

          {CATEGORY_TABS.includes(tab) && (
            <CategoryView
              category={tab}
              store={store}
              dateRange={dateRange}
              rangeLabel={rangeLabel}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Online Bidding" && (
            <LiveAuctionView
              store={store}
            />
          )}

          {tab === "Upcoming Auctions" && (
            <UpcomingAuctionsView
              store={store}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Trends" && (
            <TrendsView
              store={store}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Auction Types" && (
            <AuctionTypeView
              store={store}
              data={overview.channelBreakdown}
              rangeLabel={rangeLabel}
              isLive={Boolean(live)}
            />
          )}

          {tab === "Stores" && (
            <StoreView
              store={store}
              dateRange={dateRange}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Vendor Payables" && (
            <PayablesView
              store={store}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Full Auction Detail" && (
            <FullAuctionDetailView
              store={store}
              dateRange={dateRange}
              rangeLabel={rangeLabel}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Bidding Pace" && (
            <BiddingPaceView
              store={store}
              dateRange={dateRange}
              rangeLabel={rangeLabel}
              refreshNonce={refreshNonce}
            />
          )}

          {tab === "Revenue Breakdown" && (
            <RevenueBreakdownView
              store={store}
              overview={overview}
              rangeLabel={rangeLabel}
              isLive={Boolean(live)}
            />
          )}

          {tab === "Export" && (
            <ExportView
              store={store}
              overview={overview}
              rangeLabel={rangeLabel}
            />
          )}

          <footer className="text-center text-[14.5px] text-muted pt-8 pb-2">
            HMR Auction Services · Internal Use Only
          </footer>
        </div>
      </main>
    </div>
  );
}