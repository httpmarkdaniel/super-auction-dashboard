import { useState } from "react";
import StatTile from "./primitives/StatTile";
import Modal from "./primitives/Modal";
import BranchTallyModal from "./primitives/BranchTallyModal";
import OperationsTable from "./OperationsTable";
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
  alert: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></>} />,
  tag: <Icon path={<><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.83z" /><circle cx="7.5" cy="7.5" r="1.5" /></>} />,
  clock: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
  wallet: <Icon path={<><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M17 12h.01" /></>} />
};

const METHODOLOGY = {
  totalBidAmount:
    "Sum of every lot's bid amount across auctions in the selected date range, corrected against cms.hmr.ph's live current-bid figures for any auction still in progress (ClickHouse's own snapshot can lag behind real-time bids). Click to see the tally by branch or category.",
  activeAuctions:
    "Count of distinct auctions that started within the selected date range, regardless of whether they've since ended. Click to see the lots in those auctions.",
  lotsSoldListed:
    "Lots sold ÷ lots listed, scoped to auctions that have already ended. \"Sold\" counts any lot past the Unsold stage — Outstanding (won, payment pending), Released, or Paid — not just fully paid lots. Click to see the sold lots.",
  forApproval:
    "Lots that won at auction but haven't cleared payment or vendor sign-off yet (status Unpaid or Outstanding), within the selected date range. Click to see them.",
  unsoldLots:
    "Lots created in the selected date range that are still sitting Unsold as of today. Value is the sum of reserve price across these lots. Click to see them.",
  withReservePrice:
    "Of the unsold lots above, how many have a reserve price set (and their combined reserve value) — lots with no reserve on file don't contribute a comparable value figure. Click to see them.",
  serviceIncome:
    "Buyer's premium plus service fee, scoped to lots with status Paid or Released only — HMR's realized revenue share on lots actually settled, not just won, within the selected date range."
};

function LotDrilldownModal({ open, onClose, title, subtitle, data, initialTab }) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <OperationsTable data={data} initialTab={initialTab} embedded />
    </Modal>
  );
}

export default function HeroKPIs({ overview, rangeLabel = "Today" }) {
  const {
    heroKPIs,
    unsoldLots,
    hourlyTrend,
    operationsDetail,
    branchTally,
    categoryTally,
    auctionNumbersInRange,
  } = overview;
  const trend = hourlyTrend.map((h) => h.bidAmount);
  const pendingApproval = heroKPIs.pendingApprovalCount ?? 0;
  const hasBidDelta = heroKPIs.totalBidAmountDeltaPct !== undefined;
  const [drilldown, setDrilldown] = useState(null);

  const activeAuctionLots = operationsDetail.filter((r) => auctionNumbersInRange.has(r.auctionNumber));
  const unsoldWithReserveLots = operationsDetail.filter((r) => r.status === "Unsold" && r.reservedPrice > 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatTile
        icon={ICONS.sales}
        eyebrow={`Total Bid Amount · ${rangeLabel}`}
        value={formatPeso(heroKPIs.totalBidAmount)}
        delta={heroKPIs.totalBidAmountDeltaPct}
        sub={hasBidDelta ? "vs yesterday" : undefined}
        sparkline={trend}
        methodology={METHODOLOGY.totalBidAmount}
        onClick={() => setDrilldown("totalBidAmount")}
        extraDeltas={[
          heroKPIs.totalBidAmountWeekDeltaPct !== undefined && { label: "vs last week", pct: heroKPIs.totalBidAmountWeekDeltaPct },
          heroKPIs.totalBidAmountMonthDeltaPct !== undefined && { label: "vs last month", pct: heroKPIs.totalBidAmountMonthDeltaPct },
        ].filter(Boolean)}
      />
      <StatTile
        icon={ICONS.gavel}
        eyebrow="Active Auctions"
        value={heroKPIs.activeAuctionsNow}
        live
        sparkline={trend}
        methodology={METHODOLOGY.activeAuctions}
        onClick={() => setDrilldown("activeAuctions")}
      />
      <StatTile
        icon={ICONS.box}
        eyebrow="Lots Sold / Listed"
        value={`${heroKPIs.lotsSold} / ${heroKPIs.lotsListed}`}
        sub={`${heroKPIs.lotsListed > 0 ? ((heroKPIs.lotsSold / heroKPIs.lotsListed) * 100).toFixed(0) : 0}% cleared`}
        sparkline={trend}
        methodology={METHODOLOGY.lotsSoldListed}
        onClick={() => setDrilldown("lotsSoldListed")}
      />
      <StatTile
        icon={ICONS.alert}
        eyebrow="Unsold Lots"
        value={unsoldLots.count}
        sub={formatPeso(unsoldLots.value)}
        pill={{ label: "Recover", tone: "critical" }}
        sparkline={trend}
        methodology={METHODOLOGY.unsoldLots}
        onClick={() => setDrilldown("unsoldLots")}
      />
      <StatTile
        icon={ICONS.tag}
        eyebrow="With Reserve Price"
        value={unsoldLots.withReserveCount}
        sub={formatPeso(unsoldLots.withReserveValue)}
        sparkline={trend}
        methodology={METHODOLOGY.withReservePrice}
        onClick={() => setDrilldown("withReserve")}
      />
      <StatTile
        icon={ICONS.clock}
        eyebrow="For Approval"
        value={pendingApproval}
        sub={formatPeso(heroKPIs.pendingApprovalValue)}
        pill={pendingApproval > 0 ? { label: "Watch", tone: "warning" } : null}
        sparkline={trend}
        methodology={METHODOLOGY.forApproval}
        onClick={() => setDrilldown("forApproval")}
      />
      <StatTile
        icon={ICONS.wallet}
        eyebrow="Service Income"
        value={formatPeso(heroKPIs.serviceIncome)}
        delta={heroKPIs.serviceIncomeDeltaPct}
        sub="HMR revenue · Paid & Released"
        sparkline={trend}
        methodology={METHODOLOGY.serviceIncome}
      />
      <BranchTallyModal
        open={drilldown === "totalBidAmount"}
        onClose={() => setDrilldown(null)}
        branchTally={branchTally}
        categoryTally={categoryTally}
        rangeLabel={rangeLabel}
      />
      <LotDrilldownModal
        open={drilldown === "activeAuctions"}
        onClose={() => setDrilldown(null)}
        title="Active Auctions · Lot Detail"
        subtitle={`${auctionNumbersInRange.size} auction${auctionNumbersInRange.size === 1 ? "" : "s"} started in ${rangeLabel.toLowerCase()} · up to 200 most recent lot rows`}
        data={activeAuctionLots}
        initialTab="All"
      />
      <LotDrilldownModal
        open={drilldown === "lotsSoldListed"}
        onClose={() => setDrilldown(null)}
        title="Lots Sold · Lot Detail"
        subtitle={`${rangeLabel} · up to 200 most recent lot rows`}
        data={operationsDetail}
        initialTab="Sold"
      />
      <LotDrilldownModal
        open={drilldown === "unsoldLots"}
        onClose={() => setDrilldown(null)}
        title="Unsold Lots · Lot Detail"
        subtitle={`${rangeLabel} · up to 200 most recent unsold lot rows`}
        data={operationsDetail}
        initialTab="Unsold"
      />
      <LotDrilldownModal
        open={drilldown === "withReserve"}
        onClose={() => setDrilldown(null)}
        title="Unsold Lots With Reserve Price · Lot Detail"
        subtitle={`${rangeLabel} · unsold lots with a reserve price set, out of up to 200 most recent unsold lot rows`}
        data={unsoldWithReserveLots}
        initialTab="All"
      />
      <LotDrilldownModal
        open={drilldown === "forApproval"}
        onClose={() => setDrilldown(null)}
        title="For Approval · Lot Detail"
        subtitle={`${rangeLabel} · up to 200 most recent lot rows`}
        data={operationsDetail}
        initialTab="For Approval"
      />
    </div>
  );
}
