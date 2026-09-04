import { useMemo, useState } from "react";
import AuctionSummaryModal from "./primitives/AuctionSummaryModal";
import TotalBidAmountModal from "./primitives/TotalBidAmountModal";
import { formatPeso, formatCompactPeso } from "../utils/format";

const METHODOLOGY = {
  totalBidAmount:
    "Sum of every settled lot's bid amount (status Paid or Released only) across auctions in the selected date range, deduped by auction and lot number. Click to see the contributing auctions.",
  auctionsConcluded:
    "Distinct auction events contributing to the settled Total Bid Amount above — same population, same scope. Click to see them.",
  lotsSoldListed:
    "Lots sold ÷ lots listed, scoped to auctions that have already ended. \"Sold\" counts any lot past the Unsold stage — Outstanding (won, payment pending), Released, or Paid — not just fully paid lots. Click to see the contributing auctions.",
};

// Signed % delta, small and quiet — green for an increase, red for a
// decrease, "—" (never a fabricated 0%) when no comparison window was
// requested or the prior period had nothing to compare against.
function DeltaRow({ pct, label }) {
  if (pct == null) return <div className="text-[12.5px] text-muted">—</div>;
  const up = pct >= 0;
  return (
    <div className="text-[12.5px]">
      <span className={`font-semibold ${up ? "text-toneGreenText" : "text-toneRedText"}`}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </span>
      {label && <span className="text-muted ml-1">{label}</span>}
    </div>
  );
}

// Shared hover-methodology popover markup — same `group/tip` pattern as
// StatTile/HeadlineCard, extracted here since the Total Bid Amount hero
// card and the Registration→Bidder/Service Income cards below each build
// their own bespoke markup (rather than the generic HeadlineCard/StatTile
// shells) but still need the identical tooltip behavior.
function methodologyTip(text) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-3 right-3 top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
    >
      <div className="methodology px-3 py-2 text-[14px] leading-snug shadow-lg text-left">{text}</div>
    </div>
  );
}

// Restrained executive-BI card shell shared by all four Headline
// Performance cards — same shell (radius/shadow/padding/orange top
// accent) as StatTile, the KPI-card primitive used everywhere else in
// the dashboard, so every scorecard in this row (and the rest of the
// app) reads as one consistent family. Total Bid Amount stays the
// visual hero via its larger grid column and value font size (set by
// the caller), not via an accent color exclusive to it — no gradient/
// pill treatment either way.
function HeadlineCard({ eyebrow, onClick, methodology, children }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative text-left w-full h-full bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3 pb-3.5 group/tip ${
        onClick ? "cursor-pointer hover:border-navy/40 transition-colors" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">{eyebrow}</span>
        {methodology && (
          <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10px] font-bold shrink-0 leading-none">
            i
          </span>
        )}
      </div>
      {children}
      {methodology && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-3 right-3 top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        >
          <div className="methodology px-3 py-2 text-[14px] leading-snug shadow-lg text-left">{methodology}</div>
        </div>
      )}
    </Wrapper>
  );
}

// Auction Performance -> renamed HEADLINE PERFORMANCE (presentation only —
// see PART 1 of this task): auction-level KPIs only. Every historical
// BIDDER metric (Participating/Winning/New-Returning/Total Bids/Avg Bids
// per Unique Bidder/Winning via Max Bid/Registration → Bidder) lives under
// the Bidder Composition section instead (see App.jsx's OverviewTab) so
// bidder analytics aren't scattered across unrelated Overview sections.
// SIMPLIFIED (executive cleanup task): this component now renders ONLY
// Row 1 (Total Bid Amount / Auctions Concluded / Lots Sold-Listed) — the
// old Row 2 (Participating Bidders, Registration → Bidder, Service
// Income) was removed/relocated, not just visually hidden: Participating
// Bidders duplicated Bidder Composition's own Participating card;
// Registration → Bidder moved into Bidder Composition beside Winning
// Bidders; Service Income stays fully intact as Total Bid Amount's own
// breakdown row above and in Vendor/Category/Branch tables elsewhere —
// nothing computed for any of the three was deleted, only this row's
// redundant/relocated presentation of it. Today/live bidder activity
// (Total Bids Today, New Bidders Today) lives under Auction Events / Live
// Now (see App.jsx's LiveMiniCard footer) — a different scope entirely
// (bid_created_at today vs. this section's ending_time auction cohort).
export default function HeroKPIs({ overview, rangeLabel = "Today", compareLabel, globalCategory = "" }) {
  const { heroKPIs, operationsDetail, auctionSummary, categoryBreakdown, branchBreakdown, comparison } = overview;
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
      {/* HEADLINE PERFORMANCE (executive cleanup task) — Total Bid Amount
          is the dominant KPI: a 6-column row where it spans 4 (~2/3
          width), Auctions Concluded and Lots Sold/Listed each take 1. This
          is now the ONLY row here — Participating Bidders, Registration →
          Bidder, and Service Income were removed/relocated (see this
          file's top comment) rather than replaced with a second row, per
          this task's explicit "do not add another cluttered headline row
          just to fill space" instruction. No hardcoded period text —
          compareLabel is already the dashboard's own dynamic WTD/MTD/YTD/
          Custom comparison label. */}
      <div>
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="panel-title">Headline Performance</span>
          {comparison && <span className="text-[12.5px] text-muted font-medium normal-case tracking-normal">— {compareLabel}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          {/* TOTAL BID AMOUNT — the financial headline of the whole
              dashboard: largest type, strongest elevation/border, its own
              generous padding, and its own Buyer's Premium/Service Fee/
              Service Income breakdown underneath (reusing the SAME already-
              fetched figures Service Income's own card sums — no duplicate
              calculation). */}
          <button
            type="button"
            onClick={() => setDrilldown("totalBidAmount")}
            className="text-left lg:col-span-4 relative bg-surface1 border border-gridline rounded-xl shadow-lg border-t-4 border-t-series8 px-6 pt-5 pb-5 group/tip hover:border-navy/40 transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[12px] uppercase tracking-[0.1em] text-muted font-semibold">Total Bid Amount · {rangeLabel}</span>
              <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10px] font-bold shrink-0 leading-none">i</span>
            </div>
            <div className="font-display text-[56px] leading-none text-ink mb-3 tabular">{formatPeso(heroKPIs.totalBidAmount)}</div>
            <DeltaRow pct={comparison?.total_bid_amount_pct} label={compareLabel} />
            <div className="mt-4 pt-3.5 border-t border-gridline grid grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Buyer's Premium</div>
                <div className="text-[16px] tabular font-medium text-ink">{formatCompactPeso(heroKPIs.buyersPremium)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Service Fee</div>
                <div className="text-[16px] tabular font-medium text-ink">{formatCompactPeso(heroKPIs.serviceFee)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Service Income</div>
                <div className="text-[16px] tabular font-medium text-series1">{formatCompactPeso(heroKPIs.serviceIncome)}</div>
              </div>
            </div>
            <div className="mt-2 text-[12px] text-muted">Settled · Paid &amp; Released</div>
            {methodologyTip(METHODOLOGY.totalBidAmount)}
          </button>

          <div className="lg:col-span-1 h-full">
            <HeadlineCard eyebrow="Auctions Concluded" methodology={METHODOLOGY.auctionsConcluded} onClick={() => setDrilldown("auctionsConcluded")}>
              <div className="font-display text-[36.5px] leading-none text-ink mb-2">{heroKPIs.auctionsConcluded}</div>
              <DeltaRow pct={comparison?.auctions_concluded_pct} label={compareLabel} />
            </HeadlineCard>
          </div>

          <div className="lg:col-span-1 h-full">
            <HeadlineCard eyebrow="Lots Sold / Listed" methodology={METHODOLOGY.lotsSoldListed} onClick={() => setDrilldown("lotsSoldListed")}>
              <div className="font-display text-[28px] leading-none text-ink mb-1.5 tabular">
                {heroKPIs.lotsSold.toLocaleString()} <span className="text-muted text-[17px]">/ {heroKPIs.lotsListed.toLocaleString()}</span>
              </div>
              <div className="text-[12.5px] text-muted mb-1.5">{sellThroughPct}% sell-through</div>
              <DeltaRow pct={comparison?.lots_sold_pct} label={compareLabel} />
            </HeadlineCard>
          </div>
        </div>
      </div>

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
    </div>
  );
}
