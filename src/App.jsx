import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import { CATEGORY_NAMES as CATEGORY_TABS } from "../api/_category.js";
import Topbar from "./components/Topbar";
import StorySection from "./components/primitives/StorySection";
import HeroKPIs from "./components/HeroKPIs";
import LiveMiniCard from "./components/primitives/LiveMiniCard";
import CategoryStrip from "./components/CategoryStrip";
import BranchStrip from "./components/BranchStrip";
import Leaderboard from "./components/Leaderboard";
import BidTrendChart from "./components/BidTrendChart";
import BidderPopulationCard from "./components/BidderPopulationCard";
import BidderCompositionModal from "./components/primitives/BidderCompositionModal";
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
import { useStoreList } from "./useStoreList";
import { resolveDateRange, defaultDateRange, comparisonLabel } from "./utils/dateRange";
import { formatPeso } from "./utils/format";
import { onTabVisible } from "./utils/visibility";

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
    totalBidEvents: 0,
    uniqueParticipatingBidders: 0,
    avgBidsPerUniqueBidder: null,
    totalBidsToday: 0,
    newBiddersToday: 0,
    returningBiddersToday: 0,
  },

  winningMaxBid: {
    winning_bids: 0,
    max_bid_wins: 0,
    normal_bid_wins: 0,
    unresolved_wins: 0,
    max_bid_win_pct: null,
    winning_bid_amount: 0,
  },
  winningMaxBidByBranch: [],
  winningMaxBidByCategory: [],

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
  avgBidCategoryBreakdown: [],
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
    totalBids: 0,
    avgBidsPerUniqueBidder: null,
  },

  auctionSummary: [],
  bidTrend: [],
  bidderEngagement: [],
  comparison: null,

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

  // Full financial-story fields for the Category & Branch hover detail —
  // same settled population as bidAmount, see api/overview.js's SETTLED
  // BRANCH/CATEGORY query comments (auction_count is DISTINCT auction_
  // number, never a lot count).
  function withHoverDetail(row) {
    const auctionCount = Number(row.auction_count) || 0;
    const lotsSold = Number(row.lots_sold) || 0;
    const buyersPremium = Number(row.buyers_premium_income) || 0;
    const commission = Number(row.commission_income) || 0;
    const bidAmount = Number(row.bid_amount) || 0;

    // Entity-specific Participating/Winning composition (see
    // api/overview.js's BRANCH / CATEGORY BIDDER COMPOSITION query
    // comment) — scoped to THIS branch/category only, same canonical
    // definitions/identity bridge as the top-level Bidder Composition
    // section, never the overall Overview totals.
    const pNew = Number(row.participating_new) || 0;
    const pReturning = Number(row.participating_returning) || 0;
    // Total Bids for THIS entity only — see api/overview.js's branch_
    // bidder_activity/category_bidder_activity CTEs. Avg Bids / Unique
    // Bidder below is derived from this entity's OWN bid events and
    // ENGAGED (real-bidder-only) count — deliberately NOT pTotal, which is
    // the real-bidders-UNION-winners population used for the Participating
    // vs Winning invariant and can include winner-only members with zero
    // real bid events (see api/overview.js's engaged_bidders comment).
    const pBidEvents = Number(row.participating_bid_events) || 0;
    // Avg Bids / Unique Bidder is now computed IN SQL as the average of
    // each bidder's own (bid events / distinct auction+lot) ratio (see
    // api/overview.js's branch_bidder_activity/category_bidder_activity
    // avgIf) — NEVER re-derived here as pBidEvents / pEngagedBidders, which
    // would silently revert to Total / Count, the formula this task
    // explicitly rules out.
    const pAvgBidsPerUniqueBidder = row.avg_bids_per_unique_bidder != null ? Number(row.avg_bids_per_unique_bidder) : null;
    const pTotal = pNew + pReturning;
    const wNew = Number(row.winning_new) || 0;
    const wReturning = Number(row.winning_returning) || 0;
    const wNewAmt = Number(row.winning_new_amount) || 0;
    const wReturningAmt = Number(row.winning_returning_amount) || 0;

    return {
      auctionCount,
      lotsSold,
      buyersPremiumIncome: buyersPremium,
      commissionIncome: commission,
      serviceIncome: buyersPremium + commission,
      avgBidPerAuction: auctionCount > 0 ? bidAmount / auctionCount : null,
      avgBidPerSoldLot: lotsSold > 0 ? bidAmount / lotsSold : null,
      participating: {
        total: pTotal,
        newBidders: pNew,
        returningBidders: pReturning,
        totalBids: pBidEvents,
        avgBidsPerUniqueBidder: pAvgBidsPerUniqueBidder,
      },
      winning: {
        total: wNew + wReturning,
        newBidders: wNew,
        returningBidders: wReturning,
        amount: wNewAmt + wReturningAmt,
        newAmount: wNewAmt,
        returningAmount: wReturningAmt,
      },
    };
  }

  const categoryBreakdown = categoryRows
    .slice(0, 8)
    .map((c) => ({
      category: c.category,
      bidAmount: Number(c.bid_amount),
      share: Number(
        ((Number(c.bid_amount) / categoryTotal) * 100).toFixed(1),
      ),
      ...withHoverDetail(c),
    }));

  // Avg Bid / Auction and Avg Bid / Sold Lot cards' own local category
  // breakdown — every canonical category always present (null-filled when
  // a category had zero settled results this period, never a fabricated
  // ₱0 average — see api/overview.js's settledCategoryResult, which is
  // independent of the sidebar's global Category filter by design).
  const avgBidCategoryMap = new Map(categoryRows.map((c) => [c.category, c]));
  const avgBidCategoryPrevMap = new Map(
    (kpis.comparison?.categories || []).map((c) => [c.category, c]),
  );
  function pctChangeSafe(curr, prev) {
    return curr != null && prev != null && prev > 0 ? ((curr - prev) / prev) * 100 : null;
  }
  const avgBidCategoryBreakdown = CATEGORY_TABS.map((name) => {
    const row = avgBidCategoryMap.get(name);
    const bidAmount = row ? Number(row.bid_amount) || 0 : 0;
    const auctionCount = row ? Number(row.auction_count) || 0 : 0;
    const lotsSold = row ? Number(row.lots_sold) || 0 : 0;
    const avgBidPerAuction = auctionCount > 0 ? bidAmount / auctionCount : null;
    const avgBidPerSoldLot = lotsSold > 0 ? bidAmount / lotsSold : null;

    const prevRow = avgBidCategoryPrevMap.get(name);
    const prevBidAmount = prevRow ? Number(prevRow.bid_amount) || 0 : 0;
    const prevAuctionCount = prevRow ? Number(prevRow.auction_count) || 0 : 0;
    const prevLotsSold = prevRow ? Number(prevRow.lots_sold) || 0 : 0;
    const prevAvgBidPerAuction = prevAuctionCount > 0 ? prevBidAmount / prevAuctionCount : null;
    const prevAvgBidPerSoldLot = prevLotsSold > 0 ? prevBidAmount / prevLotsSold : null;

    return {
      category: name,
      hasData: auctionCount > 0,
      bidAmount,
      auctionCount,
      lotsSold,
      avgBidPerAuction,
      avgBidPerSoldLot,
      avgBidPerAuctionPct: pctChangeSafe(avgBidPerAuction, prevAvgBidPerAuction),
      avgBidPerSoldLotPct: pctChangeSafe(avgBidPerSoldLot, prevAvgBidPerSoldLot),
    };
  });

  // Shared by auctionSummary below — same per-auction Participating/
  // Winning breakdowns api/leaderboards.js already computes, reused (not
  // refetched) for the drilldown.
  //
  // GLOBAL INVARIANT (Participating >= Winning): now sourced from
  // perAuctionParticipatingUnion — the real deduplicated UNION of bid-
  // history participants and resolved winning bidders per auction — not
  // the old bid-history-only perAuctionBiddingActivity. That older
  // definition could show Participating < Winning for a Negotiated auction
  // whose winner never generated a bid-history event (see the GLOBAL
  // BIDDER INVARIANT task); perAuctionParticipatingUnion already
  // guarantees Winning subset-of Participating structurally, since
  // Winning's own population (perAuctionComposition) is itself one of the
  // two sides of that union.
  const winningByAuction = new Map(
    (leaderboards.perAuctionComposition || []).map((a) => [a.auction_number, a]),
  );
  const participatingByAuction = new Map(
    (leaderboards.perAuctionParticipatingUnion || []).map((a) => [a.auction_number, a]),
  );

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

  const otherBranchesRows = branchRows.slice(7);
  const otherBranchesRollup = {
    auction_count: otherBranchesRows.reduce((s, b) => s + (Number(b.auction_count) || 0), 0),
    lots_sold: otherBranchesRows.reduce((s, b) => s + (Number(b.lots_sold) || 0), 0),
    buyers_premium_income: otherBranchesRows.reduce((s, b) => s + (Number(b.buyers_premium_income) || 0), 0),
    commission_income: otherBranchesRows.reduce((s, b) => s + (Number(b.commission_income) || 0), 0),
    bid_amount: otherBranchesTotal,
    // Note: summed (not re-deduplicated) across the rolled-up branches —
    // a bidder active in two "Others" branches would be counted twice
    // here, same known approximation already accepted for a bucket this
    // minor (only appears past the top 7 branches).
    participating_new: otherBranchesRows.reduce((s, b) => s + (Number(b.participating_new) || 0), 0),
    participating_returning: otherBranchesRows.reduce((s, b) => s + (Number(b.participating_returning) || 0), 0),
    participating_new_amount: otherBranchesRows.reduce((s, b) => s + (Number(b.participating_new_amount) || 0), 0),
    participating_returning_amount: otherBranchesRows.reduce((s, b) => s + (Number(b.participating_returning_amount) || 0), 0),
    winning_new: otherBranchesRows.reduce((s, b) => s + (Number(b.winning_new) || 0), 0),
    winning_returning: otherBranchesRows.reduce((s, b) => s + (Number(b.winning_returning) || 0), 0),
    winning_new_amount: otherBranchesRows.reduce((s, b) => s + (Number(b.winning_new_amount) || 0), 0),
    winning_returning_amount: otherBranchesRows.reduce((s, b) => s + (Number(b.winning_returning_amount) || 0), 0),
  };

  const branchBreakdown = [
    ...topBranches.map((b) => ({
      branch: b.branch,
      bidAmount: Number(b.bid_amount),
      ...withHoverDetail(b),
    })),

    ...(otherBranchesTotal > 0
      ? [{ branch: "Others", bidAmount: otherBranchesTotal, ...withHoverDetail(otherBranchesRollup) }]
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
    // PART 14/15: Participating is an ENGAGEMENT population, not a
    // financial one — no peso "Bid Activity" figure here. Total Bids /
    // Avg Bids per Unique Bidder reuse the SAME overall real-bid-only
    // engagement figures that feed the Avg Bids / Unique Bidder scorecard
    // (api/overview.js's bidderEngagementResultPromise, the correct
    // two-stage-average formula) — no new query, no extra request.
    totalBids: Number(kpis.total_bid_events) || 0,
    avgBidsPerUniqueBidder: kpis.avg_bids_per_unique_bidder != null ? Number(kpis.avg_bids_per_unique_bidder) : null,
  };

  // PART 18/19/26: hover-preview fields, all already present on the SAME
  // already-fetched leaderboards.vendors/bidders rows (api/leaderboards.js's
  // settledVendorsQuery/settledBiddersQuery) — hovering triggers zero
  // network requests. Fields not cheaply available (Lots Listed/Sell-
  // through/Unsold, per-vendor bidder engagement) are intentionally
  // deferred — see api/leaderboards.js's own comment and the final report.
  const topVendors = (leaderboards.vendors || []).map((v) => ({
    vendor: v.vendor,
    bidAmount: Number(v.settled_bid_amount) || 0,
    lots: Number(v.settled_lots) || 0,
    auctionEvents: Number(v.auction_events) || 0,
    serviceIncome: Number(v.service_income) || 0,
    avgBidPerAuction: v.avg_bid_per_auction != null ? Number(v.avg_bid_per_auction) : null,
    avgBidPerSoldLot: v.avg_bid_per_sold_lot != null ? Number(v.avg_bid_per_sold_lot) : null,
  }));

  const topBidders = (leaderboards.bidders || []).map((b) => ({
    bidder: b.bidder_name,
    bidAmount: Number(b.settled_bid_amount) || 0,
    wins: Number(b.settled_wins) || 0,
    // Canonical New/Returning classification reused from the backend
    // (api/leaderboards.js's settledBiddersResult) — never inferred on
    // the frontend from name/email. Rendered as its own badge chip (see
    // RankedBar's badgeKey), not appended into the name string, so it's
    // never lost to name truncation.
    new_or_returning: b.new_or_returning || "returning",
    winningAuctions: Number(b.winning_auctions) || 0,
    auctionsParticipated: Number(b.auctions_participated) || 0,
    distinctLotsBidOn: Number(b.distinct_lots_bid_on) || 0,
    totalBids: Number(b.total_bids) || 0,
    avgBidsPerLot: b.avg_bids_per_lot != null ? Number(b.avg_bids_per_lot) : null,
    maxBidUsagePct: b.max_bid_usage_pct != null ? Number(b.max_bid_usage_pct) : null,
    winningViaMaxBid: Number(b.winning_via_max_bid) || 0,
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

      // AVG BIDS / UNIQUE BIDDER — bidder engagement/intensity (Total Bid
      // Events ÷ Unique Participating Bidders), NOT a peso metric. See
      // api/overview.js's AVG BIDS / UNIQUE BIDDER query comment. null
      // (rendered as "—") when nobody participated, never a fabricated 0.
      totalBidEvents: Number(kpis.total_bid_events) || 0,
      uniqueParticipatingBidders: Number(kpis.unique_participating_bidders) || 0,
      avgBidsPerUniqueBidder:
        kpis.avg_bids_per_unique_bidder != null ? Number(kpis.avg_bids_per_unique_bidder) : null,

      // TOTAL BIDS TODAY / NEW & RETURNING BIDDERS TODAY — activity-time
      // (bid_created_at, today's Asia/Manila calendar day), NEVER
      // ending_time — see api/overview.js's todayActivityResultPromise.
      // Always "today" regardless of the range picker, same convention as
      // todaysBidAmount.
      totalBidsToday: Number(kpis.total_bids_today) || 0,
      newBiddersToday: Number(kpis.new_bidders_today) || 0,
      returningBiddersToday: Number(kpis.returning_bidders_today) || 0,
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
    // — see api/overview.js's AUCTION-LEVEL SUMMARY query comment, merged
    // with the SAME per-auction Participating/Winning breakdowns
    // api/leaderboards.js already computes (perAuctionBiddingActivity /
    // perAuctionComposition) — reused, not refetched, so the Auctions
    // Concluded drilldown's per-auction bidder composition costs zero
    // extra requests.
    auctionSummary: (() => {
      return (kpis.auction_summary || []).map((a) => {
        const w = winningByAuction.get(a.auction_number) || {};
        const p = participatingByAuction.get(a.auction_number) || {};
        return {
          auctionNumber: a.auction_number,
          name: a.name,
          storeName: a.store_name,
          startingTime: a.starting_time,
          endingTime: a.ending_time,
          type: a.type ?? null,
          subType: a.sub_type ?? null,
          lotsListed: Number(a.lots_listed) || 0,
          lotsSold: Number(a.lots_sold) || 0,
          lotsUnsold: Number(a.lots_unsold) || 0,
          settledBidAmount: Number(a.settled_bid_amount) || 0,
          settledLotCount: Number(a.settled_lot_count) || 0,
          participating: {
            total: Number(p.total_bidders) || 0,
            newBidders: Number(p.new_bidders) || 0,
            returningBidders: Number(p.returning_bidders) || 0,
            activity: Number(p.bid_amount) || 0,
            newActivity: Number(p.new_bidders_bid_amount) || 0,
            // Same fold-unclassified-into-returning convention already
            // used for Winning just below — a resolved union member whose
            // identity has no first-ever record (only possible for a
            // winning-only bidder) is real activity, never dropped.
            returningActivity: (Number(p.returning_bidders_bid_amount) || 0) + (Number(p.unclassified_bid_amount) || 0),
          },
          winning: {
            total: (Number(w.new_bidders) || 0) + (Number(w.returning_bidders) || 0),
            newBidders: Number(w.new_bidders) || 0,
            returningBidders: Number(w.returning_bidders) || 0,
            amount:
              (Number(w.new_bidders_bid_amount) || 0) +
              (Number(w.returning_bidders_bid_amount) || 0) +
              (Number(w.unclassified_bid_amount) || 0),
            newAmount: Number(w.new_bidders_bid_amount) || 0,
            returningAmount: (Number(w.returning_bidders_bid_amount) || 0) + (Number(w.unclassified_bid_amount) || 0),
          },
        };
      });
    })(),

    avgBidCategoryBreakdown,

    bidTrend: kpis.bid_trend || [],

    // Per-bidder drilldown behind the Avg Bids / Unique Bidder scorecard —
    // see api/overview.js's AVG BIDS / UNIQUE BIDDER query comment.
    // Already-fetched, already-sorted (bid_events desc) — no extra request.
    bidderEngagement: kpis.bidder_engagement || [],

    // Dynamic period-over-period comparison — see api/overview.js's
    // DYNAMIC COMPARISON PERIOD query comment. null when not computed.
    comparison: kpis.comparison || null,

    topVendors,

    topBidders,

    // WINNING BIDS VIA MAX BID — see api/overview.js's winningMaxBidQuery
    // comment for the exact winning-bid reconciliation and why unresolved
    // lots are reported separately, never guessed into Normal Bid.
    winningMaxBid: {
      winningBids: Number(kpis.winning_max_bid?.winning_bids) || 0,
      maxBidWins: Number(kpis.winning_max_bid?.max_bid_wins) || 0,
      normalBidWins: Number(kpis.winning_max_bid?.normal_bid_wins) || 0,
      unresolvedWins: Number(kpis.winning_max_bid?.unresolved_wins) || 0,
      maxBidWinPct: kpis.winning_max_bid?.max_bid_win_pct != null ? Number(kpis.winning_max_bid.max_bid_win_pct) : null,
      winningBidAmount: Number(kpis.winning_max_bid?.winning_bid_amount) || 0,
    },
    winningMaxBidByBranch: (kpis.winning_max_bid_by_branch || []).map((row) => ({
      branch: row.branch,
      winningBids: Number(row.winning_bids) || 0,
      maxBidWins: Number(row.max_bid_wins) || 0,
      normalBidWins: Number(row.normal_bid_wins) || 0,
      unresolvedWins: Number(row.unresolved_wins) || 0,
      maxBidWinPct: row.max_bid_win_pct != null ? Number(row.max_bid_win_pct) : null,
      winningBidAmount: Number(row.winning_bid_amount) || 0,
    })),
    winningMaxBidByCategory: (kpis.winning_max_bid_by_category || []).map((row) => ({
      category: row.category,
      winningBids: Number(row.winning_bids) || 0,
      maxBidWins: Number(row.max_bid_wins) || 0,
      normalBidWins: Number(row.normal_bid_wins) || 0,
      unresolvedWins: Number(row.unresolved_wins) || 0,
      maxBidWinPct: row.max_bid_win_pct != null ? Number(row.max_bid_win_pct) : null,
      winningBidAmount: Number(row.winning_bid_amount) || 0,
    })),

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
  compareLabel,
  loading,
  error,
  categoryOptions,
  selectedCategory,
  onCategoryChange,
  onSelectBranch,
  onSelectCategory,
  updatedAt,
  onGoLive,
}) {
  const story = buildStoryline();
  const [bidderCompositionOpen, setBidderCompositionOpen] = useState(false);

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

      {/* The ONE Overview-wide Category filter — Store/Date already have
          their own dedicated controls in the Topbar, so they're not
          repeated here. Changing this re-scopes every category-scopable
          metric below (Total Bid Amount, Avg Bid cards, Bid Trend, Bidder
          Composition, Bid Value by Category & Branch, Top Vendors &
          Bidders); Registration → Bidder stays global by design (its
          source mart has no category dimension). The Avg Bid cards have no
          selector of their own — they simply reflect this value. */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-[11px] tracking-[0.06em] uppercase text-muted font-semibold mr-1">Category</span>
        <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 text-[14px]">
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="font-semibold text-ink bg-transparent outline-none cursor-pointer max-w-[180px]"
          >
            <option value="">All Categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <StorySection
        title="Bid Trend"
        insight="Daily settled bid performance over the selected range — hover a day for its own numbers."
      >
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-4 items-stretch">
          <BidTrendChart data={overview.bidTrend} rangeLabel={rangeLabel} />
          <div className="flex flex-col gap-3">
            <LiveMiniCard
              label="Today's Bid"
              value={formatPeso(overview.heroKPIs.todaysBidAmount)}
              sub="Current standing bid value"
            />
            <LiveMiniCard
              label="Active Auctions"
              value={overview.heroKPIs.activeAuctionsNow}
              sub="Auction events live now"
              onClick={onGoLive}
            />
            <div className="text-[12px] text-muted text-right pr-1">Updated {updatedAt}</div>
          </div>
        </div>
      </StorySection>

      <div className="mb-8">
        <div className="mb-3">
          <div className="text-[13.5px] text-muted">{story.headline}</div>
        </div>
        <HeroKPIs
          overview={overview}
          rangeLabel={rangeLabel}
          compareLabel={compareLabel}
          globalCategory={selectedCategory}
          onSelectCategory={onSelectCategory}
        />
      </div>

      <StorySection
        title="Bidder Composition"
        insight="Participating = everyone who placed a real bid. Winning = settled Paid/Released winners — a subset of Participating, not a separate pool to add to it. Click either card for the branch/category breakdown."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BidderPopulationCard
            title="Participating Bidders"
            total={overview.participatingComposition.total}
            newCount={overview.participatingComposition.newBidders}
            returningCount={overview.participatingComposition.returningBidders}
            engagement={{
              totalBids: overview.participatingComposition.totalBids,
              avgBidsPerUniqueBidder: overview.participatingComposition.avgBidsPerUniqueBidder,
            }}
            onClick={() => setBidderCompositionOpen(true)}
          />
          <BidderPopulationCard
            title="Winning Bidders"
            total={overview.bidderComposition.newBidders + overview.bidderComposition.returningBidders}
            newCount={overview.bidderComposition.newBidders}
            returningCount={overview.bidderComposition.returningBidders}
            amountLabel="Winning Bid Amount"
            newAmount={overview.bidderComposition.newBiddersBidAmount}
            returningAmount={overview.bidderComposition.returningBiddersBidAmount}
            onClick={() => setBidderCompositionOpen(true)}
          />
        </div>
      </StorySection>

      <BidderCompositionModal
        open={bidderCompositionOpen}
        onClose={() => setBidderCompositionOpen(false)}
        branchBreakdown={overview.branchBreakdown}
        categoryBreakdown={overview.categoryBreakdown}
        rangeLabel={rangeLabel}
      />

      <StorySection
        title="Bid Value by Category & Branch"
        insight="How this period's bid value splits across item categories and store branches."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryStrip
            data={overview.categoryBreakdown}
            rangeLabel={rangeLabel}
            onSelectCategory={onSelectCategory}
          />

          <BranchStrip
            data={overview.branchBreakdown}
            rangeLabel={rangeLabel}
            onSelectBranch={onSelectBranch}
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
            emptyMessage="No settled auction results yet for this period."
            hoverKind="vendor"
          />

          <Leaderboard
            title={`Top Bidders · ${rangeLabel}`}
            rows={overview.topBidders}
            nameKey="bidder"
            metaKey="wins"
            metaLabel="wins"
            emptyMessage="No settled auction results yet for this period."
            badgeKey="new_or_returning"
            hoverKind="bidder"
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

  // Full Auction Detail's own category scope, set when arriving from an
  // Overview category click (an exact-match filter on the canonical
  // category — see AuctionSummaryTable's categoryFilter, distinct from its
  // free-text search). Cleared whenever the user navigates to Full Auction
  // Detail any other way, or clears it explicitly there.
  const [fadCategory, setFadCategory] = useState("");

  const contentRef = useRef(null);

  function goHome() {
    setTab("Overview");

    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }

  // Branch click: reuse the existing global Store filter — Full Auction
  // Detail already scopes by it. Category click: set Full Auction Detail's
  // own category scope (exact match, not a free-text search). Both
  // preserve the currently selected global date range (untouched) and land
  // on Full Auction Detail, never a duplicate page.
  function goToFullAuctionDetailForBranch(branch) {
    setStore(branch);
    setFadCategory("");
    setTab("Full Auction Detail");
  }
  function goToFullAuctionDetailForCategory(category) {
    setFadCategory(category);
    setTab("Full Auction Detail");
  }

  const [refreshNonce, setRefreshNonce] =
    useState(0);

  const [lastUpdated, setLastUpdated] =
    useState(() => new Date());

  const triggerRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
    setLastUpdated(new Date());
  }, []);

  // Vercel P0 usage fix: a backgrounded/minimized browser tab must not
  // keep generating server load every 30s forever. The interval itself
  // keeps running on its own clock (nothing to recreate), but the tick
  // skips triggerRefresh entirely while document.hidden; onTabVisible
  // fires exactly one immediate refresh the moment the tab is
  // foregrounded again, then the normal 30s cadence resumes.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      triggerRefresh();
    }, AUTO_REFRESH_MS);

    const unsubscribe = onTabVisible(triggerRefresh);

    return () => {
      clearInterval(id);
      unsubscribe();
    };
  }, [triggerRefresh]);

  const realStores = useStoreList();

  const storeOptions = realStores?.length
    ? [ALL_STORES, ...realStores]
    : STORE_OPTIONS;

  // The historical/settled Overview fetch (useLiveOverview) is expensive —
  // ~4 HTTP requests rebuilding the settled-lot population on every 30s
  // tick — and was previously running unconditionally regardless of the
  // active tab (see the Architecture Audit's P0 finding). It's paused
  // whenever the active tab needs none of its output: Overview itself,
  // Auction Types (reads overview.channelBreakdown), and Export (reads the
  // whole overview object) are the only tabs that do. Every other tab
  // fetches its own data independently and never touched this hook. The
  // Topbar search bar also reads operationsDetail (derived from this same
  // data) on every tab — while paused it shows the last-fetched snapshot
  // rather than going stale-empty, and catches up the moment the user
  // returns to a tab that needs it (see useLiveOverview.js's `active` param).
  const needsOverviewData =
    tab === "Overview" || tab === "Auction Types" || tab === "Export";

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
    needsOverviewData,
  );

  const rangeLabel =
    resolveDateRange(dateRange).label;

  const compareLabel = comparisonLabel(dateRange);

  // DISABLED (Vercel P0 usage fix): useLiveOverview never populates a real
  // `overview.auctions` array — it only inherits MOCK_OVERVIEW's 10 fake
  // auction numbers (see mockApiData.js), so this was firing 10 wasted
  // /api/live-bid-amounts calls every 30s, unconditionally regardless of
  // tab, for a correction that could never resolve to anything real. This
  // has always evaluated to 0 in production since the mock auction
  // numbers can never resolve — no behavior change. Re-enable only once
  // overview.auctions carries genuine live auction_numbers from a real
  // source.
  const bidCorrectionDelta = 0;

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
          className={`flex-1 overflow-y-auto px-4 py-4 sm:px-6 md:px-10 md:py-8 ${
            tab === "Full Auction Detail" ? "max-w-none" : "max-w-[1400px]"
          }`}
        >
          {tab === "Overview" && (
            <OverviewTab
              overview={overview}
              rangeLabel={rangeLabel}
              compareLabel={compareLabel}
              loading={overviewLoading}
              error={overviewError}
              categoryOptions={CATEGORY_TABS}
              selectedCategory={overviewCategory}
              onCategoryChange={
                setOverviewCategory
              }
              onSelectBranch={goToFullAuctionDetailForBranch}
              onSelectCategory={goToFullAuctionDetailForCategory}
              updatedAt={formatUpdatedAt(lastUpdated)}
              onGoLive={() => setTab("Online Bidding")}
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
              category={fadCategory}
              onClearCategory={() => setFadCategory("")}
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
              dateRange={dateRange}
              rangeLabel={rangeLabel}
              refreshNonce={refreshNonce}
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