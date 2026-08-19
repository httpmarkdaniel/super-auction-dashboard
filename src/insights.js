import { formatPeso } from "./utils/format";

const ALL_STORES = "All Stores";

// Every headline used to interpolate the store name as a grammatical
// subject/possessive ("All Stores moved...", "All Stores's snapshot") which
// reads broken once "All Stores" became a selectable scope, not just a
// branch name. These three helpers give every headline a phrasing that's
// natural in both the single-branch and whole-company case.
export function scopeAdverb(store) {
  return store === ALL_STORES ? "across all branches" : `at ${store}`;
}
export function scopePossessive(store) {
  return store === ALL_STORES ? "the business's" : `${store}'s`;
}
export function scopeSubject(store) {
  return store === ALL_STORES ? "HMR" : store;
}

// Same idea as the scope* helpers above, but for the date-range picker —
// every narrative sentence used to say "today" unconditionally, which read
// as wrong the moment someone picked "Last 7 Days"/"Last 30 Days"/etc.
function periodAdverb(rangeLabel) {
  if (rangeLabel === "Today") return "today";
  if (rangeLabel === "All Time") return "all-time";
  return `in the ${rangeLabel.toLowerCase()}`;
}

// Turns the raw store-scoped numbers into the one headline sentence shown
// at the top of the Overview page.
export function buildStoryline(overview, storeName) {
  const { heroKPIs } = overview;

  const hasDelta = heroKPIs.totalBidAmountDeltaPct !== undefined && heroKPIs.totalBidAmountDeltaPct !== null;
  const bidUp = heroKPIs.totalBidAmountDeltaPct >= 0;
  const deltaClause = hasDelta
    ? `, ${bidUp ? "up" : "down"} ${Math.abs(heroKPIs.totalBidAmountDeltaPct).toFixed(1)}% vs. yesterday`
    : "";

  return {
    headline: `Bid amount reached ${formatPeso(heroKPIs.totalBidAmount)} ${scopeAdverb(
      storeName
    )}${deltaClause}, with ${heroKPIs.sellThroughRate}% of listed lots clearing the block.`,
  };
}

// Composite 0-100 "operational health" score — sell-through, reserve
// performance, and unsold exposure rolled into one number, the way BOPIS's
// own Health Score blends pick rate + cancellations + at-risk revenue.
export function computeHealthScore(overview) {
  const { heroKPIs, reservePerformance, unsoldLots } = overview;

  const sellThroughScore = heroKPIs.sellThroughRate;
  const reserveScore = reservePerformance.aboveReserve.pct + reservePerformance.atReserve.pct;
  // unsoldLots.count/totalInventory are both scoped to the same date-range
  // + store filter (see api/overview.js's vendorWhere) — dividing by the
  // wrong denominator made this ratio wrong or NaN before.
  const unsoldRatio = unsoldLots.totalInventory > 0 ? (unsoldLots.count / unsoldLots.totalInventory) * 100 : 0;
  const unsoldScore = Math.max(0, 100 - unsoldRatio * 2);

  const score = Math.round(sellThroughScore * 0.5 + reserveScore * 0.3 + unsoldScore * 0.2);

  let status, tone;
  if (score >= 80) {
    status = "On Track";
    tone = "good";
  } else if (score >= 60) {
    status = "Needs Attention";
    tone = "warning";
  } else {
    status = "Critical";
    tone = "critical";
  }

  const description = `${heroKPIs.sellThroughRate}% of listed lots cleared, ${reservePerformance.aboveReserve.pct}% sold above reserve, ${unsoldLots.count} lots still unsold.`;

  return { score, status, tone, description };
}

export function buildCategoryStoryline(d, category, store) {
  return {
    headline: `${category} generated ${formatPeso(d.totalBidAmount)} ${scopeAdverb(store)} over ${
      d.totalAuctions
    } auctions, clearing ${d.sellThroughRate}% of ${d.lotsListed.toLocaleString(
      "en-PH"
    )} listed lots — averaging ${formatPeso(d.avgBidPerLot)} per lot.`,
  };
}

export function buildStoreStoryline(d, store, rangeLabel = "Today") {
  return {
    headline: `Bid amount reached ${formatPeso(d.totalBidAmount)} ${periodAdverb(rangeLabel)} ${scopeAdverb(
      store
    )}, clearing ${d.sellThroughRate}% of ${d.lotsListed} listed lots, with ${d.activeAuctions} active auction${
      d.activeAuctions === 1 ? "" : "s"
    } running — averaging ${formatPeso(d.avgBidPerItem)} per item.`,
  };
}

export function buildLiveAuctionStoryline(lots) {
  if (lots.length === 0) {
    return { headline: "No lots are live right now." };
  }

  const totalBid = lots.reduce((s, l) => s + (l.currentBid || 0), 0);
  const closingSoon = lots.filter((l) => l.closesInSec != null && l.closesInSec <= 60);

  // Pooling every branch into one number loses the "which branch" texture —
  // name the busiest one instead of a flat aggregate when spanning stores.
  const stores = [...new Set(lots.map((l) => l.store))];
  const isMultiStore = stores.length > 1;
  let scopeClause = "";
  if (isMultiStore) {
    const lotsPerStore = {};
    lots.forEach((l) => {
      lotsPerStore[l.store] = (lotsPerStore[l.store] || 0) + 1;
    });
    const [busiestStore, busiestCount] = Object.entries(lotsPerStore).sort((a, b) => b[1] - a[1])[0];
    scopeClause = ` across ${stores.length} branches, led by ${busiestStore} with ${busiestCount} lot${busiestCount === 1 ? "" : "s"}`;
  }

  return {
    headline: `${lots.length} lot${lots.length === 1 ? " is" : "s are"} live right now${scopeClause}, worth ${formatPeso(
      totalBid
    )} in current bids — ${closingSoon.length} closing in the next minute.`,
  };
}

export function buildTrendsStoryline(yearlyTrends, store = ALL_STORES) {
  const { years, metrics } = yearlyTrends;
  const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const items = byKey.itemsPerAuction;
  const avgBid = byKey.avgBidPerItem;

  return {
    headline: `Between ${firstYear} and ${lastYear}, items per auction fell from ${items.values[0]} to ${
      items.values[items.values.length - 1]
    } while avg bid per item climbed from ${formatPeso(avgBid.values[0])} to ${formatPeso(
      avgBid.values[avgBid.values.length - 1]
    )} — ${scopeSubject(store)} is running fewer, higher-value auctions rather than high-volume ones.`,
  };
}
