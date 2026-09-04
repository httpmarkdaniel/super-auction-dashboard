import { useCallback, useMemo, useRef, useState } from "react";
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
import StatTile from "./components/primitives/StatTile";
import BidderEngagementModal from "./components/primitives/BidderEngagementModal";
import WinningMaxBidModal from "./components/primitives/WinningMaxBidModal";
import CategoryView from "./components/CategoryView";
import LiveAuctionView from "./components/LiveAuctionView";
import UpcomingAuctionsView from "./components/UpcomingAuctionsView";
import ExportView from "./components/ExportView";
import TrendsView from "./components/TrendsView";
import AuctionTypeView from "./components/AuctionTypeView";
import StoreView from "./components/StoreView";
import PayablesView from "./components/PayablesView";
import FullAuctionDetailView from "./components/FullAuctionDetailView";
import RevenueBreakdownView from "./components/RevenueBreakdownView";
import BidderAnalyticsView from "./components/BidderAnalyticsView";
import VendorAnalyticsView from "./components/VendorAnalyticsView";
import OperationalFlagsView from "./components/OperationalFlagsView";
import BranchPerformanceTable from "./components/BranchPerformanceTable";
import AuctionMixPanel from "./components/AuctionMixPanel";
import { buildStoryline } from "./insights";
import { ALL_STORES, STORE_OPTIONS } from "./mockData";
import { useLiveOverview } from "./useLiveOverview";
import { useStoreList } from "./useStoreList";
import { resolveDateRange, defaultDateRange, comparisonLabel } from "./utils/dateRange";
import { formatPeso } from "./utils/format";

const AGING_STATUS = ["good", "warning", "critical"];

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
  branchPerformance: [],
  auctionMix: { category: [], site: [], channel: [] },
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
    unclassifiedBidders: 0,
    pctChange: null,
    winRate: null,
    previousWinRate: null,
  },

  participatingComposition: {
    total: 0,
    newBidders: 0,
    returningBidders: 0,
    totalBids: 0,
    avgBidsPerUniqueBidder: null,
    previousTotal: 0,
    pctChange: null,
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

  // Bid Value click-detail previous-period comparison (PART 12/15/22) —
  // CURRENT PERIOD BID VALUE vs PREVIOUS COMPARABLE PERIOD BID VALUE only,
  // never bidder/auction counts. previousRow absent (a genuinely new
  // category/branch with zero prior activity) -> "New" if current > 0,
  // else a safe 0.0% (no fabricated Infinity%). previousRow present with
  // previousBidAmount === 0 and current === 0 also resolves to 0.0%.
  function bidValueComparison(currentBidAmount, previousRow) {
    const hasPreviousData = previousRow != null;
    const previousBidAmount = hasPreviousData ? Number(previousRow.bid_amount) || 0 : 0;
    const isNewEntity = previousBidAmount <= 0 && currentBidAmount > 0;
    return {
      previousBidAmount,
      bidValueChangePct: previousBidAmount > 0 ? ((currentBidAmount - previousBidAmount) / previousBidAmount) * 100 : isNewEntity ? null : 0,
      bidValueChangeAbsolute: currentBidAmount - previousBidAmount,
      isNewEntity,
      hasPreviousData,
    };
  }

  const cmpCategoryBidValueMap = new Map((kpis.comparison?.categories || []).map((c) => [c.category, c]));
  const cmpBranchBidValueMap = new Map((kpis.comparison?.branches || []).map((b) => [b.branch, b]));

  const categoryBreakdown = categoryRows
    .slice(0, 8)
    .map((c) => ({
      category: c.category,
      bidAmount: Number(c.bid_amount),
      share: Number(
        ((Number(c.bid_amount) / categoryTotal) * 100).toFixed(1),
      ),
      ...withHoverDetail(c),
      ...bidValueComparison(Number(c.bid_amount), cmpCategoryBidValueMap.get(c.category)),
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
      ...bidValueComparison(Number(b.bid_amount), cmpBranchBidValueMap.get(b.branch)),
    })),

    ...(otherBranchesTotal > 0
      ? [
          {
            branch: "Others",
            bidAmount: otherBranchesTotal,
            ...withHoverDetail(otherBranchesRollup),
            // "Others" is a rolled-up bucket, not a real entity — a
            // period-over-period comparison for it isn't meaningful (see
            // EntityBreakdownRow's own "Others" guard).
            previousBidAmount: 0,
            bidValueChangePct: null,
            bidValueChangeAbsolute: 0,
            isNewEntity: false,
            hasPreviousData: false,
          },
        ]
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
  const participatingTotal = (Number(participating.new_bidders) || 0) + (Number(participating.returning_bidders) || 0);

  // Headline Performance's Participating Bidders comparison — the CURRENT
  // total above comes from this (leaderboards) endpoint, but the previous-
  // period counterpart of that SAME canonical population is computed in
  // api/overview.js's comparison block (compareFrom/compareTo aren't known
  // to leaderboards.js) and exposed as a raw count — so the % change is
  // derived here, combining both already-fetched values, never a second
  // request. null (never a fabricated %) when no comparison window was
  // requested or the previous period had zero participants.
  const participatingBiddersPreviousTotal = Number(kpis.comparison?.participating_bidders_previous ?? 0);
  const participatingBiddersPct =
    kpis.comparison && participatingBiddersPreviousTotal > 0
      ? ((participatingTotal - participatingBiddersPreviousTotal) / participatingBiddersPreviousTotal) * 100
      : null;

  // WINNING BIDDERS panel (PART 8) — Unclassified is a distinct-bidder
  // count (composition.unclassified_bidders — a resolved identity with no
  // first-ever record on either bridge), never guessed into New/
  // Returning. Comparison + win rate reuse the SAME raw-previous-count
  // convention as Participating above (api/overview.js's cmpWinningResult,
  // added to the existing comparison block) — no new query beyond that.
  const winningUnclassified = Number(composition.unclassified_bidders) || 0;
  const winningTotal = newBidders + returningBidders;
  const winningPreviousNew = Number(kpis.comparison?.winning_bidders_new_previous ?? 0);
  const winningPreviousReturning = Number(kpis.comparison?.winning_bidders_returning_previous ?? 0);
  const winningPreviousUnclassified = Number(kpis.comparison?.winning_bidders_unclassified_previous ?? 0);
  const winningPreviousTotal = winningPreviousNew + winningPreviousReturning + winningPreviousUnclassified;
  const winningBiddersPct =
    kpis.comparison && winningPreviousTotal > 0 ? ((winningTotal - winningPreviousTotal) / winningPreviousTotal) * 100 : null;
  const winRate = participatingTotal > 0 ? (winningTotal / participatingTotal) * 100 : null;
  const previousWinRate = participatingBiddersPreviousTotal > 0 ? (winningPreviousTotal / participatingBiddersPreviousTotal) * 100 : null;

  bidderComposition.unclassifiedBidders = winningUnclassified;
  bidderComposition.pctChange = winningBiddersPct;
  bidderComposition.winRate = winRate;
  bidderComposition.previousWinRate = previousWinRate;

  const participatingComposition = {
    total: participatingTotal,
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
    // Headline Performance card's own previous-period comparison — see
    // comment above.
    previousTotal: participatingBiddersPreviousTotal,
    pctChange: participatingBiddersPct,
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

  // Auction-grain drilldown rows behind Total Bid Amount/Auctions
  // Concluded/Avg Bid per Auction/Avg Bid per Sold Lot/Lots Sold/Listed —
  // see api/overview.js's AUCTION-LEVEL SUMMARY query comment, merged
  // with the SAME per-auction Participating/Winning breakdowns
  // api/leaderboards.js already computes (perAuctionBiddingActivity /
  // perAuctionComposition) — reused, not refetched. Named/hoisted above
  // the return object (it used to be an inline IIFE there) so
  // branchPerformance/auctionMix below can reuse these SAME already-
  // fetched per-auction rows (type/subType/lotsListed/lotsSold/
  // settledBidAmount/storeName) instead of new queries.
  const auctionSummaryRows = (kpis.auction_summary || []).map((a) => {
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

  // BRANCH PERFORMANCE table (PART 10) — merges branchBreakdown's settled
  // (Paid/Released) financial/bidder figures (already correct, already
  // has previous-period comparison) with a client-side aggregation of
  // auctionSummaryRows by storeName for "Lots Listed"/"Auctions" — the
  // SAME broader Sold/Listed definition as the Headline Performance Lots
  // Sold/Listed KPI (Outstanding/Paid/Unpaid/Released all count as Sold),
  // deliberately NOT branchBreakdown's own narrower settled-only
  // lotsSold/auctionCount. No new query — auctionSummaryRows is already
  // fully loaded.
  const branchAuctionRows = new Map();
  for (const a of auctionSummaryRows) {
    const key = a.storeName || "—";
    if (!branchAuctionRows.has(key)) branchAuctionRows.set(key, []);
    branchAuctionRows.get(key).push(a);
  }
  const branchPerformance = branchBreakdown
    .filter((b) => b.branch !== "Others")
    .map((b) => {
      const rows = branchAuctionRows.get(b.branch) || [];
      const lotsListed = rows.reduce((s, a) => s + a.lotsListed, 0);
      const lotsSold = rows.reduce((s, a) => s + a.lotsSold, 0);
      // Channel breakdown for this branch's own expand detail (PART 11) —
      // grouped by the auction's real `type` (Online/Onsite/Negotiated/
      // Live/Simulcast/EOI — xv3.auctions.type, the SAME corrected source
      // api/revenue-breakdown.js already uses; never an auction_number-
      // suffix heuristic). Only channels actually present are returned.
      const channelMap = new Map();
      for (const a of rows) {
        const key = a.type || "Unspecified";
        if (!channelMap.has(key)) channelMap.set(key, { channel: key, lotsListed: 0, lotsSold: 0, bidAmount: 0, auctions: 0 });
        const c = channelMap.get(key);
        c.lotsListed += a.lotsListed;
        c.lotsSold += a.lotsSold;
        c.bidAmount += a.settledBidAmount;
        c.auctions += 1;
      }
      const channels = [...channelMap.values()].sort((x, y) => y.bidAmount - x.bidAmount);
      return {
        ...b,
        auctions: rows.length,
        lotsListed,
        lotsSold,
        sellThroughPct: lotsListed > 0 ? (lotsSold / lotsListed) * 100 : null,
        channels,
      };
    })
    .sort((a, b2) => b2.bidAmount - a.bidAmount);

  // AUCTION MIX (PART 14-17) — Category reuses categoryBreakdown as-is
  // (already computed above, same settled population). Site (At Branch /
  // Onsite — productivity_report's own sub_type field) and Channel
  // (Online/Onsite/Negotiated/Live/Simulcast/EOI — xv3.auctions.type, the
  // SAME corrected source as api/revenue-breakdown.js) are both derived
  // client-side from the SAME auctionSummaryRows already loaded — no new
  // query for either.
  function groupByBidAmount(rows, keyFn, fallbackLabel) {
    const map = new Map();
    for (const a of rows) {
      const key = keyFn(a) || fallbackLabel;
      if (!map.has(key)) map.set(key, { label: key, bidAmount: 0, auctions: 0 });
      const g = map.get(key);
      g.bidAmount += a.settledBidAmount;
      g.auctions += 1;
    }
    const total = [...map.values()].reduce((s, g) => s + g.bidAmount, 0) || 1;
    return [...map.values()]
      .map((g) => ({ ...g, share: (g.bidAmount / total) * 100 }))
      .sort((a, b2) => b2.bidAmount - a.bidAmount);
  }
  const auctionMix = {
    category: categoryBreakdown.map((c) => ({ label: c.category, bidAmount: c.bidAmount, share: c.share })),
    site: groupByBidAmount(auctionSummaryRows, (a) => a.subType, "Unspecified"),
    channel: groupByBidAmount(auctionSummaryRows, (a) => a.type, "Unspecified"),
  };

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

      // REGISTRATION -> BIDDER (renamed conceptually to REGISTRATION ->
      // PARTICIPATION) — numerator is now the SAME canonical Participating
      // Bidders population shown on the Bidder Composition card
      // (participatingComposition.total: real bid-history participants
      // UNION resolved winning bidders, deduplicated by canonical identity
      // — see leaderboards.js's compositionQuery), NOT
      // cms.mart_cms_bidder_registrations' own is_participating_bidder
      // flag. That flag-based count is a narrower, differently-identified
      // population (customer_id-keyed registration rows, not canonical
      // email-keyed bid/winner identity) that under-counted real
      // participation — see the investigation report for the exact
      // reconciliation. Denominator (registered_customers) is unchanged:
      // unique customers registered for an auction in this ending_time
      // cohort — the registration mart has no per-lot category dimension,
      // so it stays Category-invariant by data limitation, same as before.
      registeredCustomers: Number(kpis.registered_customers) || 0,
      participatingRegisteredBidders: participatingComposition.total,
      registrationConversionPct:
        Number(kpis.registered_customers) > 0
          ? (participatingComposition.total / Number(kpis.registered_customers)) * 100
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

    auctionSummary: auctionSummaryRows,

    branchPerformance,
    auctionMix,

    avgBidCategoryBreakdown,

    bidTrend: kpis.bid_trend || [],
    bidTrendBucketLabel: kpis.bid_trend_bucket_label || "day",

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
      maxBidWinningAmount: Number(kpis.winning_max_bid?.max_bid_winning_amount) || 0,
      normalBidWinningAmount: Number(kpis.winning_max_bid?.normal_bid_winning_amount) || 0,
      unresolvedWinningAmount: Number(kpis.winning_max_bid?.unresolved_winning_amount) || 0,
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
  const [avgBidsOpen, setAvgBidsOpen] = useState(false);
  const [winningMaxBidOpen, setWinningMaxBidOpen] = useState(false);

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
          <BidTrendChart data={overview.bidTrend} bucketLabel={overview.bidTrendBucketLabel} rangeLabel={rangeLabel} />
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
              footer={
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <div className="text-muted">Total Clicks/Bids Today</div>
                    <div className="tabular font-semibold text-ink">{overview.heroKPIs.totalBidsToday.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted">New Bidders Today</div>
                    <div className="tabular font-semibold text-ink">{overview.heroKPIs.newBiddersToday.toLocaleString()}</div>
                  </div>
                </div>
              }
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
          onOpenBidderComposition={() => setBidderCompositionOpen(true)}
        />
      </div>

      <StorySection
        title="Bidder Composition"
        insight="Participating = everyone who placed a real bid. Winning = settled Paid/Released winners — a subset of Participating, not a separate pool to add to it. Click any card for the Branch/Category breakdown — the central place for historical bidder analytics."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatTile
            accent
            eyebrow="Avg Bids / Unique Bidder"
            value={overview.heroKPIs.avgBidsPerUniqueBidder != null ? overview.heroKPIs.avgBidsPerUniqueBidder.toFixed(2) : "—"}
            sub={
              overview.heroKPIs.uniqueParticipatingBidders > 0
                ? `${overview.heroKPIs.totalBidEvents} bids · ${overview.heroKPIs.uniqueParticipatingBidders} bidders`
                : "No bidder activity"
            }
            methodology="The AVERAGE OF EACH BIDDER'S OWN ratio (that bidder's real bid events ÷ that bidder's distinct auction+lot combinations bid on), every bidder weighted equally — NOT Total Bids ÷ Unique Bidders. Click to see the per-bidder breakdown."
            onClick={() => setAvgBidsOpen(true)}
          />
          <StatTile
            accent
            eyebrow="Winning Bids via Max Bid"
            value={overview.winningMaxBid.maxBidWinPct != null ? `${overview.winningMaxBid.maxBidWinPct.toFixed(1)}%` : "—"}
            sub={`${overview.winningMaxBid.maxBidWins.toLocaleString()} of ${(overview.winningMaxBid.maxBidWins + overview.winningMaxBid.normalBidWins).toLocaleString()} winning bids`}
            methodology="Of the actual winning/final bid for each settled (Paid/Released) lot, the share placed via Max Bid rather than Normal Bid — matched to the bid-history event whose amount equals the settled winning amount. Click for the Branch/Category breakdown."
            onClick={() => setWinningMaxBidOpen(true)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* LEFT: WINNING BIDDERS panel (PART 8) */}
          <div className="bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3.5 pb-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">Winning Bidders</div>
            <div className="flex items-baseline gap-2 mb-2.5">
              <div className="font-display text-[28px] leading-none text-ink">
                {overview.bidderComposition.newBidders + overview.bidderComposition.returningBidders}
              </div>
              {overview.bidderComposition.pctChange != null && (
                <span className={`text-[13px] font-medium ${overview.bidderComposition.pctChange >= 0 ? "text-toneGreenText" : "text-toneRedText"}`}>
                  {overview.bidderComposition.pctChange >= 0 ? "▲" : "▼"} {Math.abs(overview.bidderComposition.pctChange).toFixed(1)}% vs previous
                </span>
              )}
            </div>
            {(() => {
              const bc = overview.bidderComposition;
              const total = bc.newBidders + bc.returningBidders + bc.unclassifiedBidders || 1;
              return (
                <>
                  <div className="h-2 rounded-full overflow-hidden flex bg-gridline mb-1.5">
                    <div className="bg-series8 h-full" style={{ width: `${(bc.newBidders / total) * 100}%` }} />
                    <div className="bg-navy h-full" style={{ width: `${(bc.returningBidders / total) * 100}%` }} />
                    <div className="bg-muted h-full" style={{ width: `${(bc.unclassifiedBidders / total) * 100}%` }} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12.5px] text-ink mb-3">
                    <span>New {bc.newBidders}</span>
                    <span>Returning {bc.returningBidders}</span>
                    {bc.unclassifiedBidders > 0 && <span className="text-muted">Unmatched {bc.unclassifiedBidders}</span>}
                  </div>
                </>
              );
            })()}
            <div className="pt-2.5 border-t border-gridline grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] text-muted">Win Rate</div>
                <div className="tabular font-medium text-ink">{overview.bidderComposition.winRate != null ? `${overview.bidderComposition.winRate.toFixed(1)}%` : "—"}</div>
              </div>
              <div>
                <div className="text-[12px] text-muted">Previous Rate</div>
                <div className="tabular font-medium text-ink">{overview.bidderComposition.previousWinRate != null ? `${overview.bidderComposition.previousWinRate.toFixed(1)}%` : "—"}</div>
              </div>
            </div>
          </div>

          {/* RIGHT: WON VIA — MAX BID VS. REGULAR BID (PART 9) */}
          <div className="bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3.5 pb-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Won Via — Max Bid vs. Regular Bid</div>
            {(() => {
              const wmb = overview.winningMaxBid;
              const rows = [
                { label: "Regular Bid", lots: wmb.normalBidWins, amount: wmb.normalBidWinningAmount },
                { label: "Max Bid", lots: wmb.maxBidWins, amount: wmb.maxBidWinningAmount },
                { label: "No Electronic Match", lots: wmb.unresolvedWins, amount: wmb.unresolvedWinningAmount },
              ];
              const max = Math.max(...rows.map((r) => r.lots), 1);
              return (
                <div className="space-y-3">
                  {rows.map((r) => (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-[14px] text-ink">{r.label}</span>
                        <span className="text-[13.5px] tabular text-ink">{r.lots.toLocaleString()} lots · {formatPeso(r.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gridline overflow-hidden">
                        <div className={`h-full rounded-full ${r.label === "Max Bid" ? "bg-series8" : r.label === "Regular Bid" ? "bg-series1" : "bg-muted"}`} style={{ width: `${(r.lots / max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </StorySection>

      <StorySection title="Branch Performance" insight={`${rangeLabel} · click a branch for its channel breakdown and period comparison.`}>
        <BranchPerformanceTable rows={overview.branchPerformance} />
      </StorySection>

      <StorySection title="Auction Mix" insight="How this period's settled Bid Amount splits by category, site, and channel.">
        <AuctionMixPanel auctionMix={overview.auctionMix} />
      </StorySection>

      <BidderCompositionModal
        open={bidderCompositionOpen}
        onClose={() => setBidderCompositionOpen(false)}
        branchBreakdown={overview.branchBreakdown}
        categoryBreakdown={overview.categoryBreakdown}
        rangeLabel={rangeLabel}
      />
      <BidderEngagementModal
        open={avgBidsOpen}
        onClose={() => setAvgBidsOpen(false)}
        rows={overview.bidderEngagement}
        rangeLabel={rangeLabel}
        totalBidEvents={overview.heroKPIs.totalBidEvents}
        uniqueParticipatingBidders={overview.heroKPIs.uniqueParticipatingBidders}
        avgBidsPerUniqueBidder={overview.heroKPIs.avgBidsPerUniqueBidder}
      />
      <WinningMaxBidModal
        open={winningMaxBidOpen}
        onClose={() => setWinningMaxBidOpen(false)}
        summary={overview.winningMaxBid}
        branchBreakdown={overview.winningMaxBidByBranch}
        categoryBreakdown={overview.winningMaxBidByCategory}
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
            compareLabel={compareLabel}
            onSelectCategory={onSelectCategory}
          />

          <BranchStrip
            data={overview.branchBreakdown}
            rangeLabel={rangeLabel}
            compareLabel={compareLabel}
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
  "Operational Flags": "Operational Flags",
  "Online Bidding": "Online Bidding",
  "Upcoming Auctions": "Upcoming Auctions",
  Trends: "Yearly Trends",
  "Auction Types": "Sale Channels",
  Stores: "Store Performance",
  "Vendor Payables": "Vendor Payables",
  "Full Auction Detail": "Full Auction Detail",
  "Bidding Pace": "Bidding Pace",
  "Revenue Breakdown": "Revenue Breakdown",
  "Bidder Analytics": "Bidder Analytics",
  "Vendor Analytics": "Vendor Analytics",
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

  // Vercel P0 usage fix (round 2): every dashboard surface is now
  // mount/filter/manual-refresh-driven only — there is no automatic
  // background-refresh timer anywhere in the app any more (there used to
  // be a global 30s tick here that silently re-fetched whichever tab
  // happened to be open, indefinitely, which was the single largest
  // source of unnecessary Vercel traffic). `manualRefreshNonce` only
  // bumps when the user explicitly presses the Topbar's Refresh button;
  // every historical/analytics view (Overview, every Category tab, Full
  // Auction Detail, Revenue Breakdown, Vendor Payables, Upcoming
  // Auctions, Bidder/Vendor Analytics, Operational Flags, Bidding Pace)
  // is wired to this SAME nonce, so one Refresh click legitimately
  // refreshes whichever of those is currently mounted — never a timer.
  // Online Bidding's live poll (useOnlineBidding.js) is intentionally
  // independent of this nonce entirely; it keeps its own 20s clock since
  // that's the one genuinely "live" operational surface in the app.
  const [manualRefreshNonce, setManualRefreshNonce] =
    useState(0);

  const [lastUpdated, setLastUpdated] =
    useState(() => new Date());

  const handleManualRefresh = useCallback(() => {
    setManualRefreshNonce((n) => n + 1);
    setLastUpdated(new Date());
  }, []);

  const realStores = useStoreList();

  const storeOptions = realStores?.length
    ? [ALL_STORES, ...realStores]
    : STORE_OPTIONS;

  // The historical/settled Overview fetch (useLiveOverview) is expensive —
  // ~4 HTTP requests rebuilding the settled-lot population per fetch — so
  // it's paused whenever the active tab needs none of its output: Overview
  // itself, Auction Types (reads overview.channelBreakdown), and Export
  // (reads the whole overview object) are the only tabs that do. Every
  // other tab fetches its own data independently and never touched this
  // hook. The Topbar search bar also reads operationsDetail (derived from
  // this same data) on every tab — while paused it shows the last-fetched
  // snapshot rather than going stale-empty, and catches up the moment the
  // user returns to a tab that needs it (see useLiveOverview.js's `active`
  // param). No automatic timer drives this any more — only a real
  // store/category/date-range change or the manual Refresh button
  // (manualRefreshNonce) triggers a re-fetch.
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
    manualRefreshNonce,
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
          onRefresh={handleManualRefresh}
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
              refreshNonce={manualRefreshNonce}
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
              refreshNonce={manualRefreshNonce}
            />
          )}

          {tab === "Trends" && (
            <TrendsView
              store={store}
              refreshNonce={manualRefreshNonce}
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
              refreshNonce={manualRefreshNonce}
            />
          )}

          {tab === "Vendor Payables" && (
            <PayablesView
              store={store}
              refreshNonce={manualRefreshNonce}
            />
          )}

          {tab === "Full Auction Detail" && (
            <FullAuctionDetailView
              store={store}
              dateRange={dateRange}
              rangeLabel={rangeLabel}
              refreshNonce={manualRefreshNonce}
              category={fadCategory}
              onClearCategory={() => setFadCategory("")}
            />
          )}

          {tab === "Revenue Breakdown" && (
            <RevenueBreakdownView
              store={store}
              dateRange={dateRange}
              rangeLabel={rangeLabel}
              refreshNonce={manualRefreshNonce}
            />
          )}

          {tab === "Operational Flags" && (
            <OperationalFlagsView
              dateRange={dateRange}
              store={store === ALL_STORES ? undefined : store}
              category={overviewCategory}
              rangeLabel={rangeLabel}
              refreshNonce={manualRefreshNonce}
            />
          )}

          {tab === "Bidder Analytics" && (
            <BidderAnalyticsView
              dateRange={dateRange}
              store={store === ALL_STORES ? undefined : store}
              biddingPaceStore={store}
              category={overviewCategory}
              rangeLabel={rangeLabel}
              refreshNonce={manualRefreshNonce}
              biddingPaceRefreshNonce={manualRefreshNonce}
            />
          )}

          {tab === "Vendor Analytics" && (
            <VendorAnalyticsView
              dateRange={dateRange}
              store={store === ALL_STORES ? undefined : store}
              category={overviewCategory}
              rangeLabel={rangeLabel}
              refreshNonce={manualRefreshNonce}
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