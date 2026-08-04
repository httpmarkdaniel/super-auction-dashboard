import StatTile from "./primitives/StatTile";
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
  percent: <Icon path={<><circle cx="7" cy="7" r="2.2" /><circle cx="17" cy="17" r="2.2" /><path d="M17 7 7 17" /></>} />,
  box: <Icon path={<><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>} />,
  alert: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></>} />,
  clock: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
  wallet: <Icon path={<><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M17 12h.01" /></>} />,
  backlog: <Icon path={<><path d="M4 19V5a1 1 0 0 1 1-1h8l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M13 4v6h6" /></>} />,
};

function sellThroughPill(rate) {
  if (rate < 65) return { label: "Critical", tone: "critical" };
  if (rate < 80) return { label: "Watch", tone: "warning" };
  return null;
}

export default function HeroKPIs({ overview, rangeLabel = "Today" }) {
  const { heroKPIs, unsoldLots, vendorPayablesBacklog, hourlyTrend } = overview;
  const trend = hourlyTrend.map((h) => h.bidAmount);
  const pendingApproval = heroKPIs.pendingApprovalCount ?? 0;
  const hasBidDelta = heroKPIs.totalBidAmountDeltaPct !== undefined;
  const hasSellDelta = heroKPIs.sellThroughDeltaPct !== undefined;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatTile
        icon={ICONS.sales}
        eyebrow={`Total Bid Amount · ${rangeLabel}`}
        value={formatPeso(heroKPIs.totalBidAmount)}
        delta={heroKPIs.totalBidAmountDeltaPct}
        sub={hasBidDelta ? "vs yesterday" : undefined}
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.gavel}
        eyebrow="Active Auctions"
        value={heroKPIs.activeAuctionsNow}
        live
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.percent}
        eyebrow="Sell-Through Rate"
        value={`${heroKPIs.sellThroughRate}%`}
        delta={heroKPIs.sellThroughDeltaPct}
        sub={hasSellDelta ? "vs last week" : undefined}
        pill={sellThroughPill(heroKPIs.sellThroughRate)}
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.box}
        eyebrow="Lots Sold / Listed"
        value={`${heroKPIs.lotsSold} / ${heroKPIs.lotsListed}`}
        sub={`${heroKPIs.lotsListed > 0 ? ((heroKPIs.lotsSold / heroKPIs.lotsListed) * 100).toFixed(0) : 0}% cleared`}
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.alert}
        eyebrow="Unsold Lots"
        value={unsoldLots.count}
        delta={unsoldLots.deltaPct}
        invert
        sub={formatPeso(unsoldLots.value)}
        pill={{ label: "Recover", tone: "critical" }}
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.clock}
        eyebrow="For Approval"
        value={pendingApproval}
        sub="lots pending sign-off"
        pill={pendingApproval > 0 ? { label: "Watch", tone: "warning" } : null}
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.wallet}
        eyebrow="Buyer's Premium + Fees"
        value={formatPeso(heroKPIs.buyersPremiumPlusFees)}
        delta={heroKPIs.buyersPremiumDeltaPct}
        sub="HMR revenue"
        sparkline={trend}
      />
      <StatTile
        icon={ICONS.backlog}
        eyebrow="Vendor Payables"
        value={formatPeso(vendorPayablesBacklog.totalBacklog)}
        sub="unremitted to vendors"
        pill={{ label: "Follow Up", tone: "critical" }}
        sparkline={trend}
      />
    </div>
  );
}
