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
export function scopeNoun(store) {
  return store === ALL_STORES ? "company-wide" : `at ${store}`;
}

// Turns the raw store-scoped numbers into the sentences that carry the
// story — a PowerBI/Tableau-style narrative reads these findings aloud
// instead of leaving the viewer to reverse-engineer them from six charts.
export function buildStoryline(overview, storeName) {
  const { heroKPIs, categoryBreakdown, topVendors, topBidders, hourlyTrend, unsoldLots, vendorPayablesBacklog } =
    overview;

  const topCategory = [...categoryBreakdown].sort((a, b) => b.bidAmount - a.bidAmount)[0];
  const topVendor = topVendors[0];
  const topBidder = topBidders[0];
  const peakHour = hourlyTrend.reduce((max, h) => (h.bidAmount > max.bidAmount ? h : max), hourlyTrend[0]);
  const bidUp = heroKPIs.totalBidAmountDeltaPct >= 0;

  return {
    headline: `Bid amount reached ${formatPeso(heroKPIs.totalBidAmount)} today ${scopeAdverb(storeName)}, ${
      bidUp ? "up" : "down"
    } ${Math.abs(heroKPIs.totalBidAmountDeltaPct).toFixed(1)}% vs. yesterday, with ${
      heroKPIs.sellThroughRate
    }% of listed lots clearing the block.`,

    categoryInsight: `${topCategory.category} leads the day at ${topCategory.share}% of bid value (${formatPeso(
      topCategory.bidAmount
    )}) — the category to watch for tomorrow's consignment mix.`,

    peopleInsight: `${topVendor.vendor} is today's top consignor (${formatPeso(
      topVendor.bidAmount
    )} across ${topVendor.lots} lots), while ${topBidder.bidder} leads buyers with ${formatPeso(
      topBidder.bidAmount
    )} in winning bids.`,

    paceInsight: `Bidding peaked at ${peakHour.hour} (${formatPeso(
      peakHour.bidAmount
    )}) — the window worth staffing up for next time.`,

    attentionInsight: `${unsoldLots.count} lots worth ${formatPeso(
      unsoldLots.value
    )} remain unsold, and ${formatPeso(
      vendorPayablesBacklog.totalBacklog
    )} in vendor payables is still outstanding — the two numbers ops should chase this week.`,

    moneyFlowInsight: `After commission, buyer's premium, and service fees, the net vendor payable lands at ${formatPeso(
      overview.moneyFlow[overview.moneyFlow.length - 1].value
    )} — roughly ${Math.round(
      (overview.moneyFlow[overview.moneyFlow.length - 1].value / heroKPIs.totalBidAmount) * 100
    )}% of gross bid amount.`,
  };
}

export function buildCategoryStoryline(d, category, store) {
  const topVendor = d.topVendors[0];
  const topBidder = d.topBidders[0];
  const clearedAboveReserve = d.pctSoldAboveReserve;
  const premiumOverReserve = d.avgPremiumOverReservePct;

  return {
    headline: `${category} generated ${formatPeso(d.totalBidAmount)} ${scopeAdverb(store)} over ${
      d.totalAuctions
    } auctions, clearing ${d.sellThroughRate}% of ${d.lotsListed.toLocaleString(
      "en-PH"
    )} listed lots — averaging ${formatPeso(d.avgBidPerLot)} per lot.`,

    reserveInsight: `${clearedAboveReserve}% of sold lots cleared above reserve, ${
      premiumOverReserve >= 0 ? "beating" : "missing"
    } the vendor's floor price by an average of ${Math.abs(premiumOverReserve)}% — ${
      premiumOverReserve >= 0
        ? "reserves in this category are priced conservatively."
        : "reserves may be set too high for what buyers are willing to pay."
    }`,

    feeInsight: `HMR nets a ${d.avgCommissionPct}% commission plus a ${d.avgBuyersPremiumPct}% buyer's premium on ${category} — the combined take rate that funds the auction operation.`,

    peopleInsight: `${topVendor.vendor} leads consignors with ${formatPeso(topVendor.bidAmount)} across ${
      topVendor.lots
    } lots, while ${topBidder.bidder} leads buyers with ${formatPeso(topBidder.bidAmount)} in winning bids.`,
  };
}

export function buildStoreStoryline(d, store) {
  const topVendor = d.topVendors[0];
  return {
    headline: `Bid amount reached ${formatPeso(d.totalBidAmount)} today ${scopeAdverb(store)}, clearing ${
      d.sellThroughRate
    }% of ${d.lotsListed} listed lots, with ${d.activeAuctions} active auction${
      d.activeAuctions === 1 ? "" : "s"
    } running — averaging ${formatPeso(d.avgBidPerItem)} per item.`,

    peopleInsight: `${topVendor.vendor} is today's top consignor ${scopeNoun(store)}, bringing in ${formatPeso(
      topVendor.bidAmount
    )} across ${topVendor.lots} lots.`,
  };
}

function peakYear(metric, years) {
  let best = 0;
  metric.values.forEach((v, i) => {
    if (v > metric.values[best]) best = i;
  });
  return { year: years[best], value: metric.values[best] };
}

function troughYear(metric, years) {
  let worst = 0;
  metric.values.forEach((v, i) => {
    if (v < metric.values[worst]) worst = i;
  });
  return { year: years[worst], value: metric.values[worst] };
}

export function buildLiveAuctionStoryline(lots) {
  if (lots.length === 0) {
    return { headline: "No lots are live right now.", hotLotInsight: "" };
  }

  const totalBid = lots.reduce((s, l) => s + l.currentBid, 0);
  const closingSoon = lots.filter((l) => l.closesInSec <= 60);
  const hottest = lots.reduce((max, l) => (l.bidders > max.bidders ? l : max), lots[0]);

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

    hotLotInsight: `${hottest.item} (${hottest.lotNumber}) is drawing the most interest with ${
      hottest.bidders
    } active bidders at ${formatPeso(hottest.currentBid)}${
      isMultiStore ? ` at ${hottest.store}` : ""
    } — the one to watch for a last-minute run-up.`,
  };
}

export function buildTrendsStoryline(yearlyTrends, store = ALL_STORES) {
  const { years, metrics } = yearlyTrends;
  const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const items = byKey.itemsPerAuction;
  const avgBid = byKey.avgBidPerItem;
  const branches = byKey.avgAuctionsPerBranch;
  const ratio = byKey.bidderToAuctionRatio;
  const margin = byKey.serviceIncomeMargin;

  const branchPeak = peakYear(branches, years);
  const ratioTrough = troughYear(ratio, years);
  const marginTrough = troughYear(margin, years);

  return {
    headline: `Between ${firstYear} and ${lastYear}, items per auction fell from ${items.values[0]} to ${
      items.values[items.values.length - 1]
    } while avg bid per item climbed from ${formatPeso(avgBid.values[0])} to ${formatPeso(
      avgBid.values[avgBid.values.length - 1]
    )} — ${scopeSubject(store)} is running fewer, higher-value auctions rather than high-volume ones.`,

    volumeInsight: `Auctions per branch peaked at ${branchPeak.value} in ${branchPeak.year} before easing to ${
      branches.values[branches.values.length - 1]
    } in ${lastYear} — branch-level activity is consolidating rather than expanding, in step with the shift to fewer, larger auctions.`,

    demandInsight: `Bidder-to-auction ratio bottomed at ${ratioTrough.value.toFixed(2)} in ${
      ratioTrough.year
    } and has since recovered to ${ratio.values[ratio.values.length - 1].toFixed(
      2
    )} — demand per auction is strengthening again after the post-2020 dip.`,

    marginInsight: `Service income margin sits at ${margin.values[margin.values.length - 1]}% today, down from ${
      margin.values[0]
    }% in ${firstYear} but recovering from a ${marginTrough.value}% low in ${marginTrough.year}.`,
  };
}
