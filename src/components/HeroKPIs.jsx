import { useMemo, useState } from "react";
import StatTile from "./primitives/StatTile";
import AuctionSummaryModal from "./primitives/AuctionSummaryModal";
import TotalBidAmountModal from "./primitives/TotalBidAmountModal";
import ServiceIncomeModal from "./primitives/ServiceIncomeModal";
import BidderEngagementModal from "./primitives/BidderEngagementModal";
import WinningMaxBidModal from "./primitives/WinningMaxBidModal";
import BiddersTodayPie from "./primitives/BiddersTodayPie";
import { formatPeso } from "../utils/format";

const METHODOLOGY = {
  totalBidAmount:
    "Sum of every settled lot's bid amount (status Paid or Released only) across auctions in the selected date range, deduped by auction and lot number. Click to see the contributing auctions.",
  auctionsConcluded:
    "Distinct auction events contributing to the settled Total Bid Amount above — same population, same scope. Click to see them.",
  lotsSoldListed:
    "Lots sold ÷ lots listed, scoped to auctions that have already ended. \"Sold\" counts any lot past the Unsold stage — Outstanding (won, payment pending), Released, or Paid — not just fully paid lots. Click to see the contributing auctions.",
  serviceIncome:
    "Revenue generated from settled Paid/Released auction lots, consisting of buyer's premium plus vendor commission, within the selected date range. Click to see the underlying settled lots.",
  registration:
    "Of customers registered for an auction starting in the selected period, the share who actually placed at least one bid (cms.mart_cms_bidder_registrations' own is_participating_bidder flag) — a period cohort, not lifetime registrations vs. current activity.",
  avgBidsPerUniqueBidder:
    "The AVERAGE OF EACH BIDDER'S OWN ratio (that bidder's real bid events ÷ that bidder's distinct auction+lot combinations bid on), every bidder weighted equally — NOT Total Bids ÷ Unique Bidders. A measure of bidder engagement/intensity, not a peso figure. Click to see the per-bidder breakdown.",
  totalBidsToday:
    "Count of every real bid-history event today (Asia/Manila calendar day) — one bidding action/click per row, never deduplicated by bidder, lot, or auction. Always \"today\", regardless of the date range picker.",
  newBiddersToday:
    "Canonical bidders whose first-ever real bid, across the complete bid-history dataset, occurred today — never a registration or first-bid-in-a-filter substitute. Always \"today\", regardless of the date range picker.",
  winningMaxBid:
    "Of the actual winning/final bid for each settled (Paid/Released) lot in the selected scope, the share placed via Max Bid rather than Normal Bid — matched to the bid-history event whose amount equals the settled winning amount, never merely \"Max Bid activity from eventual winners\". Click for the Branch/Category breakdown.",
};

export default function HeroKPIs({ overview, rangeLabel = "Today", compareLabel, globalCategory = "" }) {
  const {
    heroKPIs,
    unsoldLots,
    operationsDetail,
    auctionSummary,
    serviceIncomeLots,
    categoryBreakdown,
    branchBreakdown,
    bidderEngagement,
    comparison,
    winningMaxBid,
    winningMaxBidByBranch,
    winningMaxBidByCategory,
  } = overview;
  const [drilldown, setDrilldown] = useState(null);

  const lotsByAuction = useMemo(() => {
    const map = new Map();
    for (const lot of operationsDetail) {
      if (!map.has(lot.auctionNumber)) map.set(lot.auctionNumber, []);
      map.get(lot.auctionNumber).push(lot);
    }
    return (auctionNumber) => map.get(auctionNumber) ?? [];
  }, [operationsDetail]);

  const sellThroughPct = heroKPIs.lotsListed > 0 ? ((heroKPIs.lotsSold / heroKPIs.lotsListed) * 100).toFixed(0) : 0;

  // auctionSummary covers every auction with a LISTED lot (needed for the
  // Lots Sold/Listed drilldown's population), but Total Bid Amount/
  // Auctions Concluded/Avg Bid per Auction/Avg Bid per Sold Lot are scoped
  // to the SETTLED (Paid/Released) population only — filtering here keeps
  // each drilldown's row count/sum reconciling to its own parent KPI (see
  // api/overview.js's AUCTION-LEVEL SUMMARY comment), never showing
  // auctions with zero settled contribution under "Auctions Concluded".
  const settledAuctionSummary = useMemo(
    () => auctionSummary.filter((a) => a.settledLotCount > 0),
    [auctionSummary],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* AUCTION PERFORMANCE */}
      <div>
        <div className="panel-title mb-2">Auction Performance · {rangeLabel}</div>
        <div className="grid grid-cols-2 gap-4">
          <StatTile
            eyebrow={`Total Bid Amount · ${rangeLabel}`}
            value={formatPeso(heroKPIs.totalBidAmount)}
            sub="Settled · Paid & Released"
            methodology={METHODOLOGY.totalBidAmount}
            onClick={() => setDrilldown("totalBidAmount")}
            extraDeltas={comparison ? [{ label: compareLabel, pct: comparison.total_bid_amount_pct }] : []}
          />
          <StatTile
            eyebrow="Auctions Concluded"
            value={heroKPIs.auctionsConcluded}
            methodology={METHODOLOGY.auctionsConcluded}
            onClick={() => setDrilldown("auctionsConcluded")}
            extraDeltas={comparison ? [{ label: compareLabel, pct: comparison.auctions_concluded_pct }] : []}
          />
        </div>
      </div>

      {/* BUSINESS / BIDDER EFFICIENCY */}
      <div>
        <div className="panel-title mb-2">Business / Bidder Efficiency · {rangeLabel}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          eyebrow="Lots Sold / Listed"
          value={`${heroKPIs.lotsSold} / ${heroKPIs.lotsListed}`}
          sub={`${sellThroughPct}% sell-through`}
          methodology={METHODOLOGY.lotsSoldListed}
          onClick={() => setDrilldown("lotsSoldListed")}
          extraDeltas={[
            ...(comparison ? [{ label: compareLabel, pct: comparison.lots_sold_pct }] : []),
            { label: `${unsoldLots.count} unsold · ${formatPeso(unsoldLots.value)} reserve value` },
          ]}
        />
        <div className="relative bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5 group/tip">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="kpi-label">Registration → Bidder</span>
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10.5px] font-bold shrink-0 leading-none">i</span>
          </div>
          <div className="font-display text-[36.5px] leading-none text-ink mb-2">
            {heroKPIs.registrationConversionPct != null ? `${heroKPIs.registrationConversionPct.toFixed(1)}%` : "—"}
          </div>
          <div className="text-[14.5px] text-ink">
            {heroKPIs.participatingRegisteredBidders} of {heroKPIs.registeredCustomers} registered
          </div>
          {comparison && comparison.registration_conversion_pct != null && (
            <div className="text-[13px] mt-1.5">
              <span className={comparison.registration_conversion_pct >= 0 ? "text-toneGreenText" : "text-toneRedText"}>
                {comparison.registration_conversion_pct >= 0 ? "▲" : "▼"} {Math.abs(comparison.registration_conversion_pct).toFixed(1)}%
              </span>
              <span className="text-muted ml-1">{compareLabel}</span>
            </div>
          )}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-3 right-3 top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
          >
            <div className="methodology px-3 py-2 text-[14px] leading-snug shadow-lg text-left">{METHODOLOGY.registration}</div>
          </div>
        </div>
        <StatTile
          eyebrow="Avg Bids / Unique Bidder"
          value={heroKPIs.avgBidsPerUniqueBidder != null ? heroKPIs.avgBidsPerUniqueBidder.toFixed(2) : "—"}
          sub={
            heroKPIs.uniqueParticipatingBidders > 0
              ? `${heroKPIs.totalBidEvents} bids · ${heroKPIs.uniqueParticipatingBidders} bidders`
              : "No bidder activity"
          }
          methodology={METHODOLOGY.avgBidsPerUniqueBidder}
          onClick={() => setDrilldown("avgBidsPerUniqueBidder")}
          extraDeltas={
            comparison && comparison.avg_bids_per_unique_bidder_pct != null
              ? [{ label: compareLabel, pct: comparison.avg_bids_per_unique_bidder_pct }]
              : []
          }
        />
        <StatTile
          eyebrow="Service Income"
          value={formatPeso(heroKPIs.serviceIncome)}
          sub="HMR revenue · Paid & Released"
          methodology={METHODOLOGY.serviceIncome}
          onClick={() => setDrilldown("serviceIncome")}
          extraDeltas={comparison ? [{ label: compareLabel, pct: comparison.service_income_pct }] : []}
        />
        </div>
      </div>

      {/* BIDDER ACTIVITY / ENGAGEMENT — activity-time (Today) metrics kept
          separate from the historical-reporting cards above, per this
          task's own PART 28/31 grouping rule. */}
      <div>
        <div className="panel-title mb-2">Bidder Activity / Engagement · Today</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            eyebrow="Total Bids Today"
            value={heroKPIs.totalBidsToday.toLocaleString()}
            sub="Bidding actions today"
            methodology={METHODOLOGY.totalBidsToday}
          />
          <StatTile
            eyebrow="New Bidders Today"
            value={heroKPIs.newBiddersToday.toLocaleString()}
            sub="First-ever real bid today"
            methodology={METHODOLOGY.newBiddersToday}
          />
          <BiddersTodayPie newBidders={heroKPIs.newBiddersToday} returningBidders={heroKPIs.returningBiddersToday} />
          <StatTile
            eyebrow="Winning Bids via Max Bid"
            value={winningMaxBid.maxBidWinPct != null ? `${winningMaxBid.maxBidWinPct.toFixed(1)}%` : "—"}
            sub={`${winningMaxBid.maxBidWins.toLocaleString()} of ${(winningMaxBid.maxBidWins + winningMaxBid.normalBidWins).toLocaleString()} winning bids`}
            methodology={METHODOLOGY.winningMaxBid}
            onClick={() => setDrilldown("winningMaxBid")}
          />
        </div>
      </div>

      <ServiceIncomeModal
        open={drilldown === "serviceIncome"}
        onClose={() => setDrilldown(null)}
        rows={serviceIncomeLots}
        rangeLabel={rangeLabel}
      />

      <TotalBidAmountModal
        open={drilldown === "totalBidAmount"}
        onClose={() => setDrilldown(null)}
        rangeLabel={rangeLabel}
        compareLabel={compareLabel}
        heroKPIs={heroKPIs}
        comparison={comparison}
        categoryBreakdown={categoryBreakdown}
        branchBreakdown={branchBreakdown}
        globalCategory={globalCategory}
      />
      <AuctionSummaryModal
        open={drilldown === "auctionsConcluded"}
        onClose={() => setDrilldown(null)}
        title="Auctions Concluded"
        subtitle={`${rangeLabel} · ${settledAuctionSummary.length} auctions contributed settled value`}
        rows={settledAuctionSummary}
        lotsByAuction={lotsByAuction}
      />
      <AuctionSummaryModal
        open={drilldown === "lotsSoldListed"}
        onClose={() => setDrilldown(null)}
        title="Lots Sold / Listed · Contributing Auctions"
        subtitle={`${rangeLabel} · every listed lot regardless of settlement status`}
        rows={auctionSummary}
        lotsByAuction={lotsByAuction}
      />
      <BidderEngagementModal
        open={drilldown === "avgBidsPerUniqueBidder"}
        onClose={() => setDrilldown(null)}
        rows={bidderEngagement}
        rangeLabel={rangeLabel}
        totalBidEvents={heroKPIs.totalBidEvents}
        uniqueParticipatingBidders={heroKPIs.uniqueParticipatingBidders}
        avgBidsPerUniqueBidder={heroKPIs.avgBidsPerUniqueBidder}
      />
      <WinningMaxBidModal
        open={drilldown === "winningMaxBid"}
        onClose={() => setDrilldown(null)}
        summary={winningMaxBid}
        branchBreakdown={winningMaxBidByBranch}
        categoryBreakdown={winningMaxBidByCategory}
        rangeLabel={rangeLabel}
      />
    </div>
  );
}
