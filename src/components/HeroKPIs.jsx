import { useMemo, useState } from "react";
import StatTile from "./primitives/StatTile";
import AvgBidCategoryCard from "./primitives/AvgBidCategoryCard";
import AuctionSummaryModal from "./primitives/AuctionSummaryModal";
import AvgBidDrilldownModal from "./primitives/AvgBidDrilldownModal";
import TotalBidAmountModal from "./primitives/TotalBidAmountModal";
import ServiceIncomeModal from "./primitives/ServiceIncomeModal";
import { formatPeso } from "../utils/format";

function Icon({ path }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const ICONS = {
  sales: <Icon path={<path d="M3 17l6-6 4 4 8-8M21 3h-6v6" />} />,
  gavel: <Icon path={<path d="M14 6l4 4M5 15l4 4M9.5 3.5l6 6-6.5 6.5-6-6zM13.5 14l6 6M2 22l5-5" />} />,
  box: <Icon path={<><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>} />,
  chart: <Icon path={<><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>} />,
  target: <Icon path={<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>} />,
  clock: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
  wallet: <Icon path={<><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M17 12h.01" /></>} />,
  users: <Icon path={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
};

const METHODOLOGY = {
  totalBidAmount:
    "Sum of every settled lot's bid amount (status Paid or Released only) across auctions in the selected date range, deduped by auction and lot number. Click to see the contributing auctions.",
  auctionsConcluded:
    "Distinct auction events contributing to the settled Total Bid Amount above — same population, same scope. Click to see them.",
  avgBidPerAuction:
    "Total Bid Amount ÷ Auctions Concluded. Click to compare auctions against this average.",
  avgBidPerSoldLot:
    "Total Bid Amount ÷ settled sold-lot count (SUM of settled value ÷ COUNT of settled lots, not an average of per-auction averages). Click to compare auctions.",
  lotsSoldListed:
    "Lots sold ÷ lots listed, scoped to auctions that have already ended. \"Sold\" counts any lot past the Unsold stage — Outstanding (won, payment pending), Released, or Paid — not just fully paid lots. Click to see the contributing auctions.",
  serviceIncome:
    "Revenue generated from settled Paid/Released auction lots, consisting of buyer's premium plus vendor commission, within the selected date range. Click to see the underlying settled lots.",
  registration:
    "Of customers registered for an auction starting in the selected period, the share who actually placed at least one bid (cms.mart_cms_bidder_registrations' own is_participating_bidder flag) — a period cohort, not lifetime registrations vs. current activity.",
};

export default function HeroKPIs({ overview, rangeLabel = "Today", compareLabel }) {
  const {
    heroKPIs,
    unsoldLots,
    operationsDetail,
    auctionSummary,
    avgBidCategoryBreakdown,
    avgBidCategoryAuctions,
    serviceIncomeLots,
    categoryBreakdown,
    branchBreakdown,
    comparison,
  } = overview;
  const [drilldown, setDrilldown] = useState(null);
  const [avgBidCategory, setAvgBidCategory] = useState("");
  const [drilldownCategory, setDrilldownCategory] = useState("");

  function openAvgBidDrilldown(metric, category) {
    setDrilldownCategory(category);
    setDrilldown(metric);
  }

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

  // Avg Bid drilldowns' contributing-auction rows: scoped to the LOCAL
  // category selector when a specific category was clicked (from either
  // card's dropdown or one of the All-Categories breakdown rows), else the
  // same broad settledAuctionSummary as before (now Category-labeled — see
  // App.jsx's dominantCategoryByAuction).
  const avgBidDrilldownRows = useMemo(
    () => (drilldownCategory ? avgBidCategoryAuctions.filter((a) => a.category === drilldownCategory) : settledAuctionSummary),
    [drilldownCategory, avgBidCategoryAuctions, settledAuctionSummary],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* AUCTION PERFORMANCE */}
      <div>
        <div className="eyebrow mb-2">Auction Performance · {rangeLabel}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            icon={ICONS.sales}
            eyebrow={`Total Bid Amount · ${rangeLabel}`}
            value={formatPeso(heroKPIs.totalBidAmount)}
            sub="Settled · Paid & Released"
            methodology={METHODOLOGY.totalBidAmount}
            onClick={() => setDrilldown("totalBidAmount")}
            extraDeltas={comparison ? [{ label: compareLabel, pct: comparison.total_bid_amount_pct }] : []}
          />
          <StatTile
            icon={ICONS.gavel}
            eyebrow="Auctions Concluded"
            value={heroKPIs.auctionsConcluded}
            methodology={METHODOLOGY.auctionsConcluded}
            onClick={() => setDrilldown("auctionsConcluded")}
            extraDeltas={comparison ? [{ label: compareLabel, pct: comparison.auctions_concluded_pct }] : []}
          />
          <AvgBidCategoryCard
            icon={ICONS.chart}
            eyebrow="Avg Bid / Auction"
            metric="auction"
            methodology={METHODOLOGY.avgBidPerAuction}
            rangeLabel={rangeLabel}
            compareLabel={compareLabel}
            categoryBreakdown={avgBidCategoryBreakdown}
            category={avgBidCategory}
            onCategoryChange={setAvgBidCategory}
            onClickCategory={(category) => openAvgBidDrilldown("avgBidPerAuction", category)}
          />
          <AvgBidCategoryCard
            icon={ICONS.target}
            eyebrow="Avg Bid / Sold Lot"
            metric="soldLot"
            methodology={METHODOLOGY.avgBidPerSoldLot}
            rangeLabel={rangeLabel}
            compareLabel={compareLabel}
            categoryBreakdown={avgBidCategoryBreakdown}
            category={avgBidCategory}
            onCategoryChange={setAvgBidCategory}
            onClickCategory={(category) => openAvgBidDrilldown("avgBidPerSoldLot", category)}
          />
        </div>
      </div>

      {/* BUSINESS HEALTH */}
      <div>
        <div className="eyebrow mb-2">Business Health · {rangeLabel}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile
          icon={ICONS.box}
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
        <div className="relative bg-surface1 border border-gridline rounded-lg shadow-card px-4 py-3.5 group/tip">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-navySoft text-navy shrink-0">{ICONS.users}</span>
            <span className="eyebrow">Registration → Bidder</span>
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
          icon={ICONS.wallet}
          eyebrow="Service Income"
          value={formatPeso(heroKPIs.serviceIncome)}
          sub="HMR revenue · Paid & Released"
          methodology={METHODOLOGY.serviceIncome}
          onClick={() => setDrilldown("serviceIncome")}
          extraDeltas={comparison ? [{ label: compareLabel, pct: comparison.service_income_pct }] : []}
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
      />
      <AuctionSummaryModal
        open={drilldown === "auctionsConcluded"}
        onClose={() => setDrilldown(null)}
        title="Auctions Concluded"
        subtitle={`${rangeLabel} · ${settledAuctionSummary.length} auctions contributed settled value`}
        rows={settledAuctionSummary}
        lotsByAuction={lotsByAuction}
      />
      <AvgBidDrilldownModal
        open={drilldown === "avgBidPerAuction"}
        onClose={() => setDrilldown(null)}
        metric="auction"
        category={drilldownCategory}
        rangeLabel={rangeLabel}
        rows={avgBidDrilldownRows}
        lotsByAuction={lotsByAuction}
      />
      <AvgBidDrilldownModal
        open={drilldown === "avgBidPerSoldLot"}
        onClose={() => setDrilldown(null)}
        metric="soldLot"
        category={drilldownCategory}
        rangeLabel={rangeLabel}
        rows={avgBidDrilldownRows}
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
    </div>
  );
}
