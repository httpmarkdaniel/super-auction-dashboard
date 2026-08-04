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

// Same idea as the scope* helpers above, but for the date-range picker —
// every narrative sentence used to say "today" unconditionally, which read
// as wrong the moment someone picked "Last 7 Days"/"Last 30 Days"/etc.
function periodAdverb(rangeLabel) {
  if (rangeLabel === "Today") return "today";
  if (rangeLabel === "All Time") return "all-time";
  return `in the ${rangeLabel.toLowerCase()}`;
}
function periodPossessive(rangeLabel) {
  return rangeLabel === "Today" ? "today's" : "this period's";
}
function periodNoun(rangeLabel) {
  return rangeLabel === "Today" ? "the day" : "this period";
}

// Turns the raw store-scoped numbers into the sentences that carry the
// story — a PowerBI/Tableau-style narrative reads these findings aloud
// instead of leaving the viewer to reverse-engineer them from six charts.
export function buildStoryline(overview, storeName, rangeLabel = "Today") {
  const { heroKPIs, categoryBreakdown, topVendors, topBidders, hourlyTrend, unsoldLots, vendorPayablesBacklog } =
    overview;

  const topCategory = categoryBreakdown.length
    ? [...categoryBreakdown].sort((a, b) => b.bidAmount - a.bidAmount)[0]
    : null;
  const topVendor = topVendors[0];
  const topBidder = topBidders[0];
  const peakHour = hourlyTrend.length
    ? hourlyTrend.reduce((max, h) => (h.bidAmount > max.bidAmount ? h : max), hourlyTrend[0])
    : null;
  const hasDelta = heroKPIs.totalBidAmountDeltaPct !== undefined && heroKPIs.totalBidAmountDeltaPct !== null;
  const bidUp = heroKPIs.totalBidAmountDeltaPct >= 0;
  const deltaClause = hasDelta
    ? `, ${bidUp ? "up" : "down"} ${Math.abs(heroKPIs.totalBidAmountDeltaPct).toFixed(1)}% vs. yesterday`
    : "";
  const netVendorPayable = overview.moneyFlow[overview.moneyFlow.length - 1].value;

  return {
    headline: `Bid amount reached ${formatPeso(heroKPIs.totalBidAmount)} ${scopeAdverb(
      storeName
    )}${deltaClause}, with ${heroKPIs.sellThroughRate}% of listed lots clearing the block.`,

    categoryInsight: topCategory
      ? `${topCategory.category} leads ${periodNoun(rangeLabel)} at ${
          topCategory.share
        }% of bid value (${formatPeso(topCategory.bidAmount)}) — the category to watch for the next consignment mix.`
      : `No category activity recorded ${scopeAdverb(storeName)} ${periodNoun(rangeLabel)}.`,

    peopleInsight:
      topVendor && topBidder
        ? `${topVendor.vendor} is ${periodPossessive(rangeLabel)} top consignor (${formatPeso(
            topVendor.bidAmount
          )} across ${topVendor.lots} lots), while ${topBidder.bidder} leads buyers with ${formatPeso(
            topBidder.bidAmount
          )} in winning bids.`
        : `No vendor or bidder activity recorded ${scopeAdverb(storeName)} in this period.`,

    paceInsight: peakHour
      ? `Bidding peaked at ${peakHour.hour} (${formatPeso(
          peakHour.bidAmount
        )}) — the window worth staffing up for next time.`
      : `No bidding activity recorded ${scopeAdverb(storeName)} in this period.`,

    attentionInsight: `${unsoldLots.count} lots worth ${formatPeso(
      unsoldLots.value
    )} remain unsold, and ${formatPeso(
      vendorPayablesBacklog.totalBacklog
    )} in vendor payables is still outstanding — the two numbers ops should chase this week.`,

    moneyFlowInsight:
      heroKPIs.totalBidAmount > 0
        ? `After commission, buyer's premium, and service fees, the net vendor payable lands at ${formatPeso(
            netVendorPayable
          )} — roughly ${Math.round((netVendorPayable / heroKPIs.totalBidAmount) * 100)}% of gross bid amount.`
        : `No bid activity recorded ${scopeAdverb(storeName)} in this period, so there's nothing to net out yet.`,
  };
}

// Composite 0-100 "operational health" score — sell-through, reserve
// performance, and unsold exposure rolled into one number, the way BOPIS's
// own Health Score blends pick rate + cancellations + at-risk revenue.
export function computeHealthScore(overview) {
  const { heroKPIs, reservePerformance, unsoldLots } = overview;

  const sellThroughScore = heroKPIs.sellThroughRate;
  const reserveScore = reservePerformance.aboveReserve.pct + reservePerformance.atReserve.pct;
  // unsoldLots.count/totalInventory are both current-stock snapshots (see
  // api/overview.js), unlike heroKPIs.lotsListed which is scoped to the
  // date-range picker — dividing by the wrong one made this ratio wrong or
  // NaN depending on the selected range.
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
  const topVendor = d.topVendors[0];
  const topBidder = d.topBidders[0];
  const clearedAboveReserve = d.pctSoldAboveReserve;
  const premiumOverReserve = d.avgPremiumOverReservePct;
  const peakHour = d.hourlyTrend.length
    ? d.hourlyTrend.reduce((max, h) => (h.bidAmount > max.bidAmount ? h : max), d.hourlyTrend[0])
    : null;
  const netVendorPayable = d.moneyFlow[d.moneyFlow.length - 1].value;

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

    peopleInsight:
      topVendor && topBidder
        ? `${topVendor.vendor} leads consignors with ${formatPeso(topVendor.bidAmount)} across ${
            topVendor.lots
          } lots, while ${topBidder.bidder} leads buyers with ${formatPeso(topBidder.bidAmount)} in winning bids.`
        : `No vendor or bidder activity recorded for ${category} ${scopeNoun(store)} in this period.`,

    paceInsight: !peakHour
      ? `No bidding activity recorded for ${category} in this period.`
      : `Bidding on ${category} peaked at ${peakHour.hour} (${formatPeso(
          peakHour.bidAmount
        )}) — the window worth staffing up for next time.`,

    attentionInsight: `${d.unsoldLots.count} ${category} lots worth ${formatPeso(
      d.unsoldLots.value
    )} remain unsold, and ${formatPeso(
      d.vendorPayablesBacklog.totalBacklog
    )} in vendor payables is still outstanding — the two numbers ops should chase this week.`,

    moneyFlowInsight: `After commission, buyer's premium, and service fees, ${category}'s net vendor payable lands at ${formatPeso(
      netVendorPayable
    )} — roughly ${Math.round((netVendorPayable / d.totalBidAmount) * 100)}% of gross bid amount.`,
  };
}

export function buildStoreStoryline(d, store, rangeLabel = "Today") {
  const topVendor = d.topVendors[0];
  return {
    headline: `Bid amount reached ${formatPeso(d.totalBidAmount)} ${periodAdverb(rangeLabel)} ${scopeAdverb(
      store
    )}, clearing ${d.sellThroughRate}% of ${d.lotsListed} listed lots, with ${d.activeAuctions} active auction${
      d.activeAuctions === 1 ? "" : "s"
    } running — averaging ${formatPeso(d.avgBidPerItem)} per item.`,

    peopleInsight: topVendor
      ? `${topVendor.vendor} is ${periodPossessive(rangeLabel)} top consignor ${scopeNoun(store)}, bringing in ${formatPeso(
          topVendor.bidAmount
        )} across ${topVendor.lots} lots.`
      : `No consignor activity recorded ${scopeNoun(store)} for this period.`,
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

  const totalBid = lots.reduce((s, l) => s + (l.currentBid || 0), 0);
  const closingSoon = lots.filter((l) => l.closesInSec != null && l.closesInSec <= 60);
  // Bidder counts aren't known until a card's detail is actually fetched
  // (see useLotDetail — kept out of the poll loop to respect cms.hmr.ph's
  // rate limit), so "hottest" is the highest current bid instead.
  const hottest = lots.reduce((max, l) => ((l.currentBid || 0) > (max.currentBid || 0) ? l : max), lots[0]);

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

    hotLotInsight: `${hottest.item} (${hottest.lotNumber}) is drawing the most interest at ${formatPeso(
      hottest.currentBid || 0
    )}${isMultiStore ? ` at ${hottest.store}` : ""} — the one to watch for a last-minute run-up.`,
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
