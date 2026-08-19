import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar, { CATEGORY_TABS } from "./components/Sidebar";
import Topbar from "./components/Topbar";
import StoryHeader from "./components/StoryHeader";
import StorySection from "./components/primitives/StorySection";
import HeroKPIs from "./components/HeroKPIs";
import HealthScoreCard from "./components/HealthScoreCard";
import BranchTallyModal from "./components/primitives/BranchTallyModal";
import CategoryStrip from "./components/CategoryStrip";
import BranchStrip from "./components/BranchStrip";
import Leaderboard from "./components/Leaderboard";
import BidderComposition from "./components/BidderComposition";
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
import { ALL_STORES, STORE_OPTIONS } from "./mockData";
import { buildStoryline, computeHealthScore } from "./insights";
import { formatPeso } from "./utils/format";
import { useLiveOverview } from "./useLiveOverview";
import { useLiveBidCorrection, useMarqueeSummary } from "./useLiveBidding";
import { useStoreList } from "./useStoreList";
import { resolveDateRange, defaultDateRange } from "./utils/dateRange";

const AGING_STATUS = ["good", "warning", "critical"];

// How often the dashboard auto-refetches every real data source, on top of
// the manual Refresh button — ClickHouse's marts aren't updated
// second-by-second like cms.hmr.ph, so this doesn't need to match the
// Online Bidding tab's 20s poll, just feel reliably current.
const AUTO_REFRESH_MS = 30000;

function formatUpdatedAt(date) {
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
});

// Zeroed placeholder shown only before the first real fetch resolves (or if
// it fails) — an honest "nothing yet" shape, never a fabricated number.
const EMPTY_OVERVIEW = {
  heroKPIs: {
    totalBidAmount: 0,
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
  },
  unsoldLots: { count: 0, value: 0, deltaPct: undefined, avgAgeDays: 0, fresh: 0, aging: 0, stale: 0, totalInventory: 0, withReserveCount: 0, withReserveValue: 0 },
  categoryBreakdown: [],
  branchBreakdown: [],
  branchTally: [],
  categoryTally: [],
  auctionNumbersInRange: new Set(),
  channelBreakdown: [],
  hourlyTrend: [],
  bidderComposition: { newBidders: 0, returningBidders: 0, newBiddersBidAmount: 0, returningBiddersBidAmount: 0, newBidderTrend: [], byAuction: [] },
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
  moneyFlow: [
    { stage: "Bid Amount", value: 0, type: "total" },
    { stage: "Commission", value: 0, type: "deduction" },
    { stage: "Buyer's Premium", value: 0, type: "deduction" },
    { stage: "Service Fee", value: 0, type: "deduction" },
    { stage: "Net Vendor Payable", value: 0, type: "result" },
  ],
};

// Reshapes the raw /api/* responses into the shape every component below
// renders — always real data; EMPTY_OVERVIEW above covers the pre-load case.
function buildLiveOverview(live, bidCorrectionDelta) {
  const { overview: kpis, leaderboards, reservePerformance, categories, lots, payables } = live;
  const totalLots = Number(kpis.total_lots) || 0;
  const totalPaid = Number(kpis.total_paid) || 0;
  // Sell-through is scoped to auctions that have actually ended (an open
  // auction's lots all show "Unsold" simply because no winner's been
  // decided yet) and counts anything past the Unsold stage — Outstanding
  // (won, payment pending) or Released/Paid — as sold, not just fully paid.
  // See api/overview.js's ended_lots_listed/ended_lots_sold for the query.
  const endedLotsListed = Number(kpis.ended_lots_listed) || 0;
  const endedLotsSold = Number(kpis.ended_lots_sold) || 0;

  const categoryRows = (categories.categories || []).filter((c) => c.category && c.bid_amount != null);
  const categoryTotal = categoryRows.reduce((s, c) => s + Number(c.bid_amount), 0) || 1;
  const categoryBreakdown = categoryRows
    .slice(0, 8)
    .map((c) => ({
      category: c.category,
      bidAmount: Number(c.bid_amount),
      share: Number(((Number(c.bid_amount) / categoryTotal) * 100).toFixed(1)),
    }));

  // Sale channels (Online Bidding / Live Auction / Simulcast / Buy Now) —
  // real productivity_report.category breakdown, folded into the same
  // /api/categories call rather than its own route (12-function cap).
  const channelRows = categories.channels || [];
  const channelBreakdown = channelRows.map((c) => ({
    type: c.channel,
    bidAmount: Number(c.bidAmount) || 0,
    lots: Number(c.endedLotsListed) || 0,
    sellThroughRate: c.endedLotsListed > 0 ? Math.round((c.endedLotsSold / c.endedLotsListed) * 100) : 0,
  }));

  // Top 7 branches by bid amount + an "Others" bucket for the rest, so the
  // ranked list stays readable even though there are 16 real branches.
  const branchRows = (kpis.branches || []).filter((b) => b.branch && b.bid_amount != null);
  const branchTotal = branchRows.reduce((s, b) => s + Number(b.bid_amount), 0) || 1;
  const topBranches = branchRows.slice(0, 7);
  const otherBranchesTotal = branchRows.slice(7).reduce((s, b) => s + Number(b.bid_amount), 0);
  const branchBreakdown = [
    ...topBranches.map((b) => ({ branch: b.branch, bidAmount: Number(b.bid_amount) })),
    ...(otherBranchesTotal > 0 ? [{ branch: "Others", bidAmount: otherBranchesTotal }] : []),
  ].map((b) => ({ ...b, share: Number(((b.bidAmount / branchTotal) * 100).toFixed(1)) }));

  // Pace by hour-of-day — whatever hours actually have activity in this
  // range, in order; null bid_amount (rows exist but none carry a value)
  // reads as 0 rather than a gap.
  const hourlyRows = (kpis.hourly || []).filter((h) => h.hour != null);
  const hourlyTrend = hourlyRows.map((h) => ({ hour: HOUR_LABELS[Number(h.hour)], bidAmount: Number(h.bid_amount) || 0 }));

  // New vs returning bidders — an honest zero (no bidder activity in this
  // scope) is a real, valid state, not a reason to fall back to mock; see
  // BidderComposition's own zero-guard on the percentage math.
  const composition = leaderboards.composition || {};
  const newBidders = Number(composition.new_bidders) || 0;
  const returningBidders = Number(composition.returning_bidders) || 0;
  const bidderComposition = {
    newBidders,
    returningBidders,
    newBiddersBidAmount: Number(composition.new_bidders_bid_amount) || 0,
    returningBiddersBidAmount: Number(composition.returning_bidders_bid_amount) || 0,
    newBidderTrend: (leaderboards.newBidderTrend || []).map((d) => ({
      week: d.day,
      newBidders: Number(d.new_bidders) || 0,
    })),
    byAuction: (leaderboards.perAuctionComposition || []).map((a) => ({
      auctionNumber: a.auction_number,
      newBidders: Number(a.new_bidders) || 0,
      returningBidders: Number(a.returning_bidders) || 0,
      newBiddersBidAmount: Number(a.new_bidders_bid_amount) || 0,
      returningBiddersBidAmount: Number(a.returning_bidders_bid_amount) || 0,
    })),
  };

  const topVendors = (leaderboards.vendors || []).map((v) => ({
    vendor: v.vendor,
    bidAmount: Number(v.bid_amount) || 0,
    lots: Number(v.lots) || 0,
  }));
  const topBidders = (leaderboards.bidders || []).map((b) => ({
    bidder: b.bidder_name,
    bidAmount: Number(b.bid_amount) || 0,
    wins: Number(b.wins) || 0,
  }));

  const rp = reservePerformance;
  const reserveTotalValue = (Number(rp.below_value) || 0) + (Number(rp.at_value) || 0) + (Number(rp.above_value) || 0) || 1;
  const pct = (v) => Number(((v / reserveTotalValue) * 100).toFixed(1));

  // Real commission/premium/fee breakdown — built from the same overview
  // query rather than mock stage values, so the "% of gross" narrative
  // text stays consistent with the real total bid amount above it.
  const bidAmount = (Number(kpis.total_bid_amount) || 0) + (bidCorrectionDelta || 0);
  const commission = Number(kpis.total_commission) || 0;
  const buyersPremium = Number(kpis.total_buyers_premium) || 0;
  const serviceFee = Number(kpis.total_service_fee) || 0;
  const netVendorPayable = bidAmount - commission - buyersPremium - serviceFee;

  // Fixed rolling-window trend (today vs 7/14/30/60 days back) — see
  // api/overview.js's trendWhere comment for why this ignores the
  // date-range picker rather than comparing whatever's currently selected.
  const weekCurrent = Number(kpis.week_current) || 0;
  const weekPrevious = Number(kpis.week_previous) || 0;
  const monthCurrent = Number(kpis.month_current) || 0;
  const monthPrevious = Number(kpis.month_previous) || 0;
  const totalBidAmountWeekDeltaPct =
    weekPrevious > 0 ? Number((((weekCurrent - weekPrevious) / weekPrevious) * 100).toFixed(1)) : undefined;
  const totalBidAmountMonthDeltaPct =
    monthPrevious > 0 ? Number((((monthCurrent - monthPrevious) / monthPrevious) * 100).toFixed(1)) : undefined;

  const moneyFlow = [
    { stage: "Bid Amount", value: bidAmount, type: "total" },
    { stage: "Commission", value: -commission, type: "deduction" },
    { stage: "Buyer's Premium", value: -buyersPremium, type: "deduction" },
    { stage: "Service Fee", value: -serviceFee, type: "deduction" },
    { stage: "Net Vendor Payable", value: netVendorPayable, type: "result" },
  ];

  return {
    heroKPIs: {
      totalBidAmount: bidAmount,
      totalBidAmountDeltaPct: undefined,
      totalBidAmountWeekDeltaPct,
      totalBidAmountMonthDeltaPct,
      activeAuctionsNow: Number(kpis.total_auctions) || 0,
      sellThroughRate: endedLotsListed > 0 ? Math.round((endedLotsSold / endedLotsListed) * 100) : 0,
      sellThroughDeltaPct: undefined,
      serviceIncome: (Number(kpis.service_income_buyers_premium) || 0) + (Number(kpis.service_income_service_fee) || 0),
      serviceIncomeDeltaPct: undefined,
      lotsSold: endedLotsSold,
      lotsListed: endedLotsListed,
      pendingApprovalCount: Number(kpis.pending_payment_count) || 0,
      pendingApprovalValue: Number(kpis.pending_payment_value) || 0,
    },
    unsoldLots: {
      count: Number(kpis.unsold_count) || 0,
      value: Number(kpis.unsold_value) || 0,
      deltaPct: undefined,
      avgAgeDays: Math.round(Number(kpis.unsold_avg_age_days) || 0),
      fresh: Number(kpis.unsold_fresh) || 0,
      aging: Number(kpis.unsold_aging) || 0,
      stale: Number(kpis.unsold_stale) || 0,
      totalInventory: Number(kpis.total_inventory) || 0,
      withReserveCount: Number(kpis.unsold_with_reserve_count) || 0,
      withReserveValue: Number(kpis.unsold_with_reserve_value) || 0,
    },
    categoryBreakdown,
    branchBreakdown,
    // Uncapped per-branch tally (branchBreakdown above rolls anything past
    // the top 7 into "Others" for the compact chart) — for the Total Bid
    // Amount drill-down, which should show every branch individually.
    branchTally: branchRows
      .map((b) => ({
        branch: b.branch,
        bidAmount: Number(b.bid_amount) || 0,
        share: Number(((Number(b.bid_amount) / branchTotal) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.bidAmount - a.bidAmount),
    // Uncapped per-category tally, same idea as branchTally above — every
    // category individually, not just the top 8 categoryBreakdown keeps.
    categoryTally: categoryRows
      .map((c) => ({
        category: c.category,
        bidAmount: Number(c.bid_amount) || 0,
        share: Number(((Number(c.bid_amount) / categoryTotal) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.bidAmount - a.bidAmount),
    // Auction numbers counted in heroKPIs.activeAuctionsNow (same
    // productivityWhere scope) — lets the Active Auctions drill-down filter
    // operationsDetail down to just those auctions' lots.
    auctionNumbersInRange: new Set((kpis.auctions || []).map((a) => a.auction_number)),
    channelBreakdown,
    hourlyTrend,
    bidderComposition,
    topVendors,
    topBidders,
    reservePerformance: {
      belowReserve: { count: Number(rp.below_count) || 0, value: Number(rp.below_value) || 0, pct: pct(Number(rp.below_value) || 0) },
      atReserve: { count: Number(rp.at_count) || 0, value: Number(rp.at_value) || 0, pct: pct(Number(rp.at_value) || 0) },
      aboveReserve: { count: Number(rp.above_count) || 0, value: Number(rp.above_value) || 0, pct: pct(Number(rp.above_value) || 0) },
    },
    vendorPayablesBacklog: {
      totalBacklog: Number(payables.total_backlog) || 0,
      aging: [
        { bucket: "0–30 days", value: Number(payables.aged_0_30) || 0 },
        { bucket: "31–60 days", value: Number(payables.aged_31_60) || 0 },
        { bucket: "60+ days", value: Number(payables.aged_60_plus) || 0 },
      ].map((a, i) => ({ ...a, status: AGING_STATUS[i] })),
    },
    operationsDetail: lots.lots || [],
    moneyFlow,
  };
}

const BID_AMOUNT_METHODOLOGY =
  "Sum of every lot's bid amount across auctions in the selected date range, corrected against cms.hmr.ph's live current-bid figures for any auction still in progress (ClickHouse's own snapshot can lag behind real-time bids).";

const HEALTH_SCORE_METHODOLOGY =
  "Composite 0–100 score: 50% sell-through rate + 30% reserve performance (lots sold at or above reserve) + 20% inverse unsold-inventory ratio (current company-wide standing stock, not scoped to the selected date range). 80+ is On Track, 60–79 is Needs Attention, below 60 is Critical.";

function OverviewTab({ store, overview, rangeLabel, isLive, loading, error }) {
  const story = buildStoryline(overview, store);
  const health = computeHealthScore(overview);
  const trend = overview.hourlyTrend.map((h) => h.bidAmount);
  const [showBranchTally, setShowBranchTally] = useState(false);

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
        <BidderComposition data={overview.bidderComposition} rangeLabel={rangeLabel} />
      </div>
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <div className="flex-1 min-w-0">
            <StoryHeader
              eyebrow={`${store} · ${rangeLabel}${isLive ? " · Live" : ""}`}
              headline={story.headline}
              amount={formatPeso(overview.heroKPIs.totalBidAmount)}
              deltaPct={overview.heroKPIs.totalBidAmountDeltaPct}
              methodology={BID_AMOUNT_METHODOLOGY}
              onAmountClick={() => setShowBranchTally(true)}
              extraDeltas={[
                overview.heroKPIs.totalBidAmountWeekDeltaPct !== undefined && {
                  label: "vs last week",
                  pct: overview.heroKPIs.totalBidAmountWeekDeltaPct,
                },
                overview.heroKPIs.totalBidAmountMonthDeltaPct !== undefined && {
                  label: "vs last month",
                  pct: overview.heroKPIs.totalBidAmountMonthDeltaPct,
                },
              ].filter(Boolean)}
            />
          </div>
          <HealthScoreCard {...health} trend={trend} methodology={HEALTH_SCORE_METHODOLOGY} />
          <BranchTallyModal
            open={showBranchTally}
            onClose={() => setShowBranchTally(false)}
            branchTally={overview.branchTally}
            categoryTally={overview.categoryTally}
            rangeLabel={rangeLabel}
          />
        </div>
        <div className="mt-4">
          <HeroKPIs overview={overview} rangeLabel={rangeLabel} />
        </div>
      </div>

      <StorySection title="Bid Value by Category & Branch" insight="How this period's bid value splits across item categories and store branches.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryStrip data={overview.categoryBreakdown} rangeLabel={rangeLabel} />
          <BranchStrip data={overview.branchBreakdown} rangeLabel={rangeLabel} />
        </div>
      </StorySection>

      <StorySection title="Top Vendors & Bidders" insight="The vendors bringing in the most consignments and the bidders winning the most lots." last>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard title={`Top Vendors · ${rangeLabel}`} rows={overview.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
          <Leaderboard title={`Top Bidders · ${rangeLabel}`} rows={overview.topBidders} nameKey="bidder" metaKey="wins" metaLabel="wins" />
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
  const [store, setStore] = useState(ALL_STORES);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef(null);

  function goHome() {
    setTab("Overview");
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }

  // Bumping this re-runs every data-fetching hook below (each one takes it
  // as an effect dependency) — the single mechanism behind both the
  // Refresh button and the auto-refresh timer, so neither is decorative.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  const triggerRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    const id = setInterval(triggerRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [triggerRefresh]);

  // Real distinct store/branch names from ClickHouse for the dropdown —
  // falls back to the mock list until loaded (just a static name list, not
  // fabricated business data).
  const realStores = useStoreList();
  const storeOptions = realStores?.length ? [ALL_STORES, ...realStores] : STORE_OPTIONS;

  // ClickHouse-backed data for the currently selected date range + store.
  // "All Stores" is a mock-only sentinel, not a real branch value, so it's
  // omitted from the query (meaning "don't filter by store").
  const { data: live, loading: overviewLoading, error: overviewError } = useLiveOverview(
    dateRange,
    store === ALL_STORES ? undefined : store,
    refreshNonce
  );
  const rangeLabel = resolveDateRange(dateRange).label;

  // Deferred, non-blocking correction of the stale ClickHouse snapshot for
  // auctions still live right now — see useLiveBidCorrection's own comment
  // for why this isn't done inside useLiveOverview's fetch itself.
  const bidCorrectionDelta = useLiveBidCorrection(live?.overview?.auctions, refreshNonce);
  const marquee = useMarqueeSummary(refreshNonce);

  const overview = useMemo(() => {
    if (!live) return EMPTY_OVERVIEW;
    return buildLiveOverview(live, bidCorrectionDelta);
  }, [live, bidCorrectionDelta]);

  const searchPool = useMemo(
    () =>
      overview.operationsDetail.map((o) => ({
        lotNumber: o.lotNumber,
        primary: o.vendor,
        secondary: o.category,
        status: o.status,
      })),
    [overview]
  );

  return (
    <div className="flex h-screen overflow-hidden bg-plane">
      <Sidebar
        active={tab}
        onChange={setTab}
        onLogoClick={goHome}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar
          store={store}
          onStoreChange={setStore}
          onExportClick={() => setTab("Export")}
          onMenuClick={() => setSidebarOpen(true)}
          marquee={marquee}
          searchPool={searchPool}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          storeOptions={storeOptions}
          updatedAt={formatUpdatedAt(lastUpdated)}
          onRefresh={triggerRefresh}
        />

        <div className="flex items-center gap-3 px-4 md:px-10 pt-5">
          <h1 className="flex items-center gap-2.5 text-[15.5px] uppercase tracking-[0.14em] font-bold text-navy shrink-0">
            <span className="w-12 h-[3px] bg-navy" />
            {TITLES[tab] || tab}
          </h1>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 md:px-10 md:py-8 max-w-[1400px]">
          {tab === "Overview" && (
            <OverviewTab
              store={store}
              overview={overview}
              rangeLabel={rangeLabel}
              isLive={Boolean(live)}
              loading={overviewLoading}
              error={overviewError}
            />
          )}
          {CATEGORY_TABS.includes(tab) && (
            <CategoryView category={tab} store={store} dateRange={dateRange} rangeLabel={rangeLabel} refreshNonce={refreshNonce} />
          )}
          {tab === "Online Bidding" && <LiveAuctionView store={store} />}
          {tab === "Upcoming Auctions" && <UpcomingAuctionsView store={store} refreshNonce={refreshNonce} />}
          {tab === "Trends" && <TrendsView store={store} refreshNonce={refreshNonce} />}
          {tab === "Auction Types" && (
            <AuctionTypeView store={store} data={overview.channelBreakdown} rangeLabel={rangeLabel} isLive={Boolean(live)} />
          )}
          {tab === "Stores" && <StoreView store={store} dateRange={dateRange} refreshNonce={refreshNonce} />}
          {tab === "Vendor Payables" && <PayablesView store={store} refreshNonce={refreshNonce} />}
          {tab === "Full Auction Detail" && (
            <FullAuctionDetailView store={store} overview={overview} rangeLabel={rangeLabel} isLive={Boolean(live)} />
          )}
          {tab === "Bidding Pace" && (
            <BiddingPaceView store={store} overview={overview} rangeLabel={rangeLabel} isLive={Boolean(live)} />
          )}
          {tab === "Revenue Breakdown" && (
            <RevenueBreakdownView store={store} overview={overview} rangeLabel={rangeLabel} isLive={Boolean(live)} />
          )}
          {tab === "Export" && <ExportView store={store} overview={overview} rangeLabel={rangeLabel} />}

          <footer className="text-center text-[14.5px] text-muted pt-8 pb-2">
            HMR Auction Services · Internal Use Only
          </footer>
        </div>
      </main>
    </div>
  );
}
