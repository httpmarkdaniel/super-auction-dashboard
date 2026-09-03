import { formatPeso, formatCompactPeso } from "./format";

// OPERATIONAL FLAGS — every rule below is a deterministic, threshold-based
// check over data the dashboard ALREADY fetches (Overview/Leaderboards'
// existing summary payloads) plus the one new lightweight aggregate served
// by /api/overview?type=operational-flags (see that handler's own comment
// for exactly what it computes and why). Nothing here is AI-generated or
// judgment-based — every threshold is a literal number, calibrated against
// real production data at implementation time (see the PR/commit notes for
// the specific reconciled examples). This file is the single source of
// truth for what a flag means; the UI only renders what this returns.

const DEPT = {
  OPERATIONS: "Operations",
  CASHIER: "Cashier / Finance",
  MARKETING: "Marketing",
  DEV_IT: "Developers / IT",
  BARCODERS: "Barcoders / Cataloging",
  AUCTION_TEAM: "Auction Team",
  BRANCH_OPS: "Branch / Store Operations",
  VENDOR_MGMT: "Vendor Management",
  DATA_BI: "Data / BI",
};

export const ALL_DEPARTMENTS = Object.values(DEPT);

function pct(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function fmtPct(n) {
  return `${n.toFixed(1)}%`;
}

// ---------------------------------------------------------------
// 1. BID HISTORY FRESHNESS (LIVE) — Developers / IT + Data / BI
//
// Rule: minutes since the warehouse's latest recorded bid
// (cms.mart_cms_bid_history_report), evaluated ONLY when at least one
// auction is currently active (starting_time <= now <= ending_time) —
// with zero active auctions, a gap in bidding is expected, not a data
// problem, so this never fires.
// Thresholds: CRITICAL >=24h, HIGH >=6h, MEDIUM >=2h (the "> 6h while
// active auctions exist" example given in this feature's own spec).
// ---------------------------------------------------------------
function bidHistoryFreshnessFlags(opsFlags) {
  if (!opsFlags || opsFlags.active_auctions_count <= 0) return [];
  if (opsFlags.minutes_since_latest_bid == null) return [];

  const hours = opsFlags.minutes_since_latest_bid / 60;
  let severity = null;
  if (hours >= 24) severity = "CRITICAL";
  else if (hours >= 6) severity = "HIGH";
  else if (hours >= 2) severity = "MEDIUM";
  if (!severity) return [];

  return [
    {
      id: "bid_history_freshness",
      type: "bid_history_freshness",
      severity,
      departments: [DEPT.DEV_IT, DEPT.DATA_BI],
      primaryDepartment: DEPT.DEV_IT,
      title: "Bid-history data may be stale",
      evidence: `Latest recorded bid was ${hours.toFixed(1)}h ago while ${opsFlags.active_auctions_count} auction${opsFlags.active_auctions_count === 1 ? " is" : "s are"} currently active.`,
      entity: null,
      entityLabel: null,
      branch: null,
      metricLabel: "Hours since latest bid",
      metricValue: hours.toFixed(1),
      thresholdLabel: "> 6h while active auctions exist",
      scope: "live",
      rule: "Bid History Freshness",
      ruleDetail: {
        current: `${hours.toFixed(1)}h since latest recorded bid (${opsFlags.latest_bid_at})`,
        threshold: "CRITICAL >= 24h, HIGH >= 6h, MEDIUM >= 2h, only while active auctions exist",
      },
      relevantDate: opsFlags.latest_bid_at,
    },
  ];
}

// ---------------------------------------------------------------
// 2. VERY LOW SELL-THROUGH — auction-level — Operations
//
// Rule: auctions with at least 20 lots listed (same minimum-sample
// convention Vendor Analytics already uses for "Stuck Inventory") and
// sell-through below 30%.
// ---------------------------------------------------------------
function lowSellThroughFlags(opsFlags) {
  const flags = [];
  for (const a of opsFlags?.auctions ?? []) {
    if (a.lots_listed < 20) continue;
    const sellThrough = pct(a.lots_sold, a.lots_listed);
    if (sellThrough == null || sellThrough >= 30) continue;
    const severity = sellThrough < 15 ? "HIGH" : "MEDIUM";
    flags.push({
      id: `low_sell_through:${a.auction_number}`,
      type: "low_sell_through",
      severity,
      departments: [DEPT.OPERATIONS],
      primaryDepartment: DEPT.OPERATIONS,
      title: "Auction ended with unusually low sell-through",
      evidence: `${a.lots_sold} sold / ${a.lots_listed} listed · ${fmtPct(sellThrough)}`,
      entity: a.auction_number,
      entityLabel: `${a.auction_number}${a.name ? " · " + a.name : ""}`,
      branch: a.store_name,
      metricLabel: "Sell-through",
      metricValue: fmtPct(sellThrough),
      thresholdLabel: "< 30% with >= 20 lots listed",
      scope: "period",
      rule: "Very Low Sell-Through",
      ruleDetail: {
        current: `${fmtPct(sellThrough)} (${a.lots_sold}/${a.lots_listed} lots)`,
        threshold: "HIGH < 15%, MEDIUM < 30%, minimum 20 lots listed",
      },
      relevantDate: a.ending_time,
    });
  }
  return flags;
}

// ---------------------------------------------------------------
// 3. HIGH UNSOLD RESERVE VALUE — auction-level — Operations
//
// Rule: sum of reserved_price across this auction's Unsold lots (the
// same "reserve" field/definition the Overview Reserve Price Performance
// card already uses).
// ---------------------------------------------------------------
function highUnsoldReserveValueFlags(opsFlags) {
  const flags = [];
  for (const a of opsFlags?.auctions ?? []) {
    if (a.unsold_reserve_value < 150000) continue;
    const severity = a.unsold_reserve_value >= 300000 ? "HIGH" : "MEDIUM";
    flags.push({
      id: `high_unsold_reserve_value:${a.auction_number}`,
      type: "high_unsold_reserve_value",
      severity,
      departments: [DEPT.OPERATIONS],
      primaryDepartment: DEPT.OPERATIONS,
      title: "High unsold reserve value remaining",
      evidence: `${formatPeso(a.unsold_reserve_value)} in reserve price still unsold`,
      entity: a.auction_number,
      entityLabel: `${a.auction_number}${a.name ? " · " + a.name : ""}`,
      branch: a.store_name,
      metricLabel: "Unsold reserve value",
      metricValue: formatPeso(a.unsold_reserve_value),
      thresholdLabel: ">= ₱150,000",
      scope: "period",
      rule: "High Unsold Reserve Value",
      ruleDetail: {
        current: formatPeso(a.unsold_reserve_value),
        threshold: "HIGH >= ₱300,000, MEDIUM >= ₱150,000",
      },
      relevantDate: a.ending_time,
    });
  }
  return flags;
}

// ---------------------------------------------------------------
// 4. UNPAID / OUTSTANDING WINNING VALUE AGING — auction-level —
//    Cashier / Finance (primary) + Operations
//
// Rule: only auctions that ended at least 3 days ago (real processing
// time given first — never flags a just-concluded auction), with
// Outstanding/Unpaid winning value or count above threshold. "Sold"
// here follows the exact same STATUS_PRIORITY_SQL definition used
// dashboard-wide (Outstanding/Unpaid are sold-but-not-yet-paid, not the
// same population as Unsold).
// ---------------------------------------------------------------
function unpaidOutstandingAgingFlags(opsFlags) {
  const flags = [];
  for (const a of opsFlags?.auctions ?? []) {
    if (a.days_since_ended < 3) continue;
    // Value-gated only — a lot COUNT on its own says nothing about
    // materiality (validated against real data: 5 lots totaling ₱147 is
    // not a collections problem worth flagging, even though it would
    // have passed a naive "count >= 5" OR-branch tried during
    // calibration).
    if (a.unpaid_outstanding_value < 50000) continue;
    const severity = a.unpaid_outstanding_value >= 200000 ? "HIGH" : "MEDIUM";
    flags.push({
      id: `unpaid_outstanding_aging:${a.auction_number}`,
      type: "unpaid_outstanding_aging",
      severity,
      departments: [DEPT.CASHIER, DEPT.OPERATIONS],
      primaryDepartment: DEPT.CASHIER,
      title: "Unpaid/Outstanding winning lots aging after auction end",
      evidence: `${a.unpaid_outstanding_count} lot(s) · ${formatPeso(a.unpaid_outstanding_value)} · auction ended ${a.days_since_ended}d ago`,
      entity: a.auction_number,
      entityLabel: `${a.auction_number}${a.name ? " · " + a.name : ""}`,
      branch: a.store_name,
      metricLabel: "Unpaid/Outstanding value",
      metricValue: formatPeso(a.unpaid_outstanding_value),
      thresholdLabel: ">= ₱50,000, ended >= 3 days ago",
      scope: "period",
      rule: "Unpaid/Outstanding Settlement Aging",
      ruleDetail: {
        current: `${formatPeso(a.unpaid_outstanding_value)} across ${a.unpaid_outstanding_count} lot(s), ${a.days_since_ended} days since auction end`,
        threshold: "HIGH >= ₱200,000, MEDIUM >= ₱50,000, both require the auction to have ended >= 3 days ago",
      },
      relevantDate: a.ending_time,
    });
  }
  return flags;
}

// ---------------------------------------------------------------
// 5. MISSING ITEM NAME / DESCRIPTION — auction-level — Barcoders /
//    Cataloging
//
// Rule: lots with a NULL/blank item name. Category is deliberately NOT
// checked here — CATEGORY_CLASSIFICATION_SQL always resolves to a real
// value (General Merchandise as its catch-all), so "missing category"
// is not a condition this warehouse can ever produce.
// ---------------------------------------------------------------
function missingItemNameFlags(opsFlags) {
  const flags = [];
  for (const a of opsFlags?.auctions ?? []) {
    const ratio = pct(a.missing_name_count, a.lots_listed);
    const meetsBase = a.missing_name_count >= 5 || (a.lots_listed >= 10 && ratio != null && ratio >= 10);
    if (!meetsBase) continue;
    const severity = a.missing_name_count >= 10 || (ratio != null && ratio >= 20) ? "MEDIUM" : "LOW";
    flags.push({
      id: `missing_item_name:${a.auction_number}`,
      type: "missing_item_name",
      severity,
      departments: [DEPT.BARCODERS],
      primaryDepartment: DEPT.BARCODERS,
      title: "Lots with missing item name/description",
      evidence: `${a.missing_name_count} of ${a.lots_listed} lots have no item name recorded`,
      entity: a.auction_number,
      entityLabel: `${a.auction_number}${a.name ? " · " + a.name : ""}`,
      branch: a.store_name,
      metricLabel: "Lots missing item name",
      metricValue: `${a.missing_name_count}`,
      thresholdLabel: ">= 5 lots, or >= 10% of listed lots",
      scope: "period",
      rule: "Missing Item Name/Description",
      ruleDetail: {
        current: `${a.missing_name_count} of ${a.lots_listed} lots (${ratio != null ? fmtPct(ratio) : "n/a"})`,
        threshold: "Flag: >= 5 lots or >= 10% of listed. MEDIUM: >= 10 lots or >= 20%, else LOW",
      },
      relevantDate: a.ending_time,
    });
  }
  return flags;
}

// ---------------------------------------------------------------
// 6. UNRESOLVED WINNING BIDS (NO ELECTRONIC MATCH) — Data / BI
//    (primary) + Developers / IT
//
// Reuses Overview's existing winning_max_bid aggregate — NO new query.
// unresolved_winning_amount is a settled lot's winning value with no
// matching bid-history row at all (see api/overview.js's
// winningMaxBidQuery comment) — real, expected for Negotiated-channel
// sales (no electronic bidding), so the threshold is deliberately high
// (calibrated against real ~30-58% observed periods) and the evidence
// text says so explicitly rather than implying every unresolved lot is
// an error.
// ---------------------------------------------------------------
function unresolvedWinningBidsFlags(overview) {
  const wmb = overview?.winning_max_bid;
  if (!wmb || wmb.winning_bid_amount < 200000) return [];
  const ratio = pct(wmb.unresolved_winning_amount, wmb.winning_bid_amount);
  if (ratio == null || ratio < 30) return [];
  const severity = ratio >= 55 ? "HIGH" : "MEDIUM";
  return [
    {
      id: "unresolved_winning_bids",
      type: "unresolved_winning_bids",
      severity,
      departments: [DEPT.DATA_BI, DEPT.DEV_IT],
      primaryDepartment: DEPT.DATA_BI,
      title: "Unresolved winning bids (no electronic bid-history match)",
      evidence: `${formatPeso(wmb.unresolved_winning_amount)} of ${formatPeso(wmb.winning_bid_amount)} winning value (${fmtPct(ratio)}) has no matching bid-history event. Some of this is expected for Negotiated-channel sales with no electronic bidding — worth a spot check, not automatically an error.`,
      entity: null,
      entityLabel: null,
      branch: null,
      metricLabel: "Unresolved share of winning value",
      metricValue: fmtPct(ratio),
      thresholdLabel: ">= 30% of winning value (min. ₱200,000 winning value in scope)",
      scope: "period",
      rule: "Unresolved Winning Bids",
      ruleDetail: {
        current: `${fmtPct(ratio)} (${formatPeso(wmb.unresolved_winning_amount)} of ${formatPeso(wmb.winning_bid_amount)})`,
        threshold: "HIGH >= 55%, MEDIUM >= 30%",
      },
      relevantDate: null,
    },
  ];
}

// ---------------------------------------------------------------
// 7. LOW REGISTRATION -> BIDDER CONVERSION — Marketing
//
// Reuses Overview's existing registered_customers/
// participating_registered_bidders — NO new query. Calibrated against
// real ~36-43% observed conversion (comfortably above threshold, so the
// rule stays quiet under normal conditions).
// ---------------------------------------------------------------
function lowRegistrationConversionFlags(overview) {
  const registered = Number(overview?.registered_customers ?? 0);
  const participating = Number(overview?.participating_registered_bidders ?? 0);
  if (registered < 50) return [];
  const conversion = pct(participating, registered);
  if (conversion == null || conversion >= 15) return [];
  const severity = conversion < 8 ? "HIGH" : "MEDIUM";
  return [
    {
      id: "low_registration_conversion",
      type: "low_registration_conversion",
      severity,
      departments: [DEPT.MARKETING],
      primaryDepartment: DEPT.MARKETING,
      title: "Low registration-to-bidder conversion",
      evidence: `${participating} of ${registered} registered customers actually bid (${fmtPct(conversion)})`,
      entity: null,
      entityLabel: null,
      branch: null,
      metricLabel: "Registration -> Bidder conversion",
      metricValue: fmtPct(conversion),
      thresholdLabel: "< 15% (minimum 50 registered customers)",
      scope: "period",
      rule: "Low Registration Conversion",
      ruleDetail: {
        current: `${fmtPct(conversion)} (${participating}/${registered})`,
        threshold: "HIGH < 8%, MEDIUM < 15%, minimum 50 registered customers",
      },
      relevantDate: null,
    },
  ];
}

// ---------------------------------------------------------------
// 8. VENDOR STUCK INVENTORY / POOR SELL-THROUGH — Vendor Management
//
// Reuses Leaderboards' existing vendor_analytics.all_lots — the EXACT
// same population/threshold-sample-size convention (>=20 lots listed)
// as the Vendor Analytics tab's own "Stuck Inventory" ranking. This does
// not redefine that metric, only flags the worst of it. Capped to the 5
// worst per period so a broad slowdown doesn't flood the flag list.
// ---------------------------------------------------------------
function vendorStuckInventoryFlags(leaderboards) {
  const allLots = leaderboards?.vendor_analytics?.all_lots ?? [];
  const candidates = allLots
    .filter((v) => v.lots_listed >= 20)
    .map((v) => ({ ...v, sellThrough: pct(v.lots_sold, v.lots_listed) }))
    .filter((v) => v.sellThrough != null && v.sellThrough < 35)
    .sort((a, b) => a.sellThrough - b.sellThrough)
    .slice(0, 5);

  return candidates.map((v) => ({
    id: `vendor_stuck_inventory:${v.vendor}`,
    type: "vendor_stuck_inventory",
    severity: v.sellThrough < 20 ? "HIGH" : "MEDIUM",
    departments: [DEPT.VENDOR_MGMT],
    primaryDepartment: DEPT.VENDOR_MGMT,
    title: "Vendor with poor sell-through / stuck inventory",
    evidence: `${v.lots_sold} sold / ${v.lots_listed} listed · ${fmtPct(v.sellThrough)}`,
    entity: v.vendor,
    entityLabel: v.vendor,
    branch: null,
    metricLabel: "Sell-through",
    metricValue: fmtPct(v.sellThrough),
    thresholdLabel: "< 35% with >= 20 lots listed",
    scope: "period",
    rule: "Vendor Stuck Inventory",
    ruleDetail: {
      current: `${fmtPct(v.sellThrough)} (${v.lots_sold}/${v.lots_listed} lots)`,
      threshold: "HIGH < 20%, MEDIUM < 35%, minimum 20 lots listed (same as Vendor Analytics' Stuck Inventory ranking)",
    },
    relevantDate: null,
  }));
}

// ---------------------------------------------------------------
// 9. VENDOR CONCENTRATION RISK — Vendor Management
//
// Reuses Leaderboards' existing top5_vendor_concentration_pct — NO new
// query, same figure already shown on the Vendor Analytics tab.
// ---------------------------------------------------------------
function vendorConcentrationRiskFlags(leaderboards) {
  const va = leaderboards?.vendor_analytics;
  if (!va || (va.active_vendors ?? 0) < 10 || va.top5_vendor_concentration_pct == null) return [];
  if (va.top5_vendor_concentration_pct < 60) return [];
  const severity = va.top5_vendor_concentration_pct >= 75 ? "HIGH" : "MEDIUM";
  return [
    {
      id: "vendor_concentration_risk",
      type: "vendor_concentration_risk",
      severity,
      departments: [DEPT.VENDOR_MGMT],
      primaryDepartment: DEPT.VENDOR_MGMT,
      title: "High vendor concentration",
      evidence: `Top 5 of ${va.active_vendors} active vendors account for ${fmtPct(va.top5_vendor_concentration_pct)} of settled Bid Amount`,
      entity: null,
      entityLabel: null,
      branch: null,
      metricLabel: "Top-5 vendor concentration",
      metricValue: fmtPct(va.top5_vendor_concentration_pct),
      thresholdLabel: ">= 60% (minimum 10 active vendors)",
      scope: "period",
      rule: "Vendor Concentration Risk",
      ruleDetail: {
        current: `${fmtPct(va.top5_vendor_concentration_pct)} across ${va.active_vendors} active vendors`,
        threshold: "HIGH >= 75%, MEDIUM >= 60%, minimum 10 active vendors",
      },
      relevantDate: null,
    },
  ];
}

// ---------------------------------------------------------------
// 10. BRANCH SELL-THROUGH BELOW BASELINE — Branch / Store Operations
//
// Computed from the SAME per-auction rows the new operational-flags
// aggregate already returns, grouped by store_name — no new query.
// Compares each branch's sell-through to the GLOBAL average across all
// branches in the current scope (not a hardcoded number), so the
// baseline always reflects the selected Date/Store/Category filters.
// ---------------------------------------------------------------
function branchSellThroughFlags(opsFlags) {
  const auctions = opsFlags?.auctions ?? [];
  if (auctions.length === 0) return [];

  const byBranch = new Map();
  let totalListed = 0;
  let totalSold = 0;
  for (const a of auctions) {
    if (!a.store_name) continue;
    if (!byBranch.has(a.store_name)) byBranch.set(a.store_name, { listed: 0, sold: 0 });
    const b = byBranch.get(a.store_name);
    b.listed += a.lots_listed;
    b.sold += a.lots_sold;
    totalListed += a.lots_listed;
    totalSold += a.lots_sold;
  }
  const globalPct = pct(totalSold, totalListed);
  if (globalPct == null) return [];

  const flags = [];
  for (const [branch, b] of byBranch) {
    if (b.listed < 30) continue;
    const branchPct = pct(b.sold, b.listed);
    if (branchPct == null) continue;
    const gap = globalPct - branchPct;
    if (gap < 15) continue;
    const severity = gap >= 25 ? "HIGH" : "MEDIUM";
    flags.push({
      id: `branch_sell_through_below_baseline:${branch}`,
      type: "branch_sell_through_below_baseline",
      severity,
      departments: [DEPT.BRANCH_OPS],
      primaryDepartment: DEPT.BRANCH_OPS,
      title: "Branch sell-through materially below baseline",
      evidence: `${fmtPct(branchPct)} sell-through vs. ${fmtPct(globalPct)} overall (${b.sold}/${b.listed} lots) — ${gap.toFixed(1)}pp below baseline`,
      entity: branch,
      entityLabel: branch,
      branch,
      metricLabel: "Sell-through gap vs. baseline",
      metricValue: `-${gap.toFixed(1)}pp`,
      thresholdLabel: ">= 15pp below overall sell-through (minimum 30 lots listed)",
      scope: "period",
      rule: "Branch Sell-Through Below Baseline",
      ruleDetail: {
        current: `${fmtPct(branchPct)} (${b.sold}/${b.listed} lots) vs. ${fmtPct(globalPct)} overall`,
        threshold: "HIGH gap >= 25pp, MEDIUM gap >= 15pp, minimum 30 lots listed",
      },
      relevantDate: null,
    });
  }
  return flags;
}

// ---------------------------------------------------------------
// 11. BIDDER CONCENTRATION DOMINANCE — Auction Team
//
// Reuses Leaderboards' existing `bidders` (Top settled bidders) plus
// Overview's total_bid_amount — no new query. A watch-item observation,
// not a claim of wrongdoing.
// ---------------------------------------------------------------
function bidderConcentrationFlags(overview, leaderboards) {
  const totalBidAmount = Number(overview?.total_bid_amount ?? 0);
  if (totalBidAmount < 500000) return [];
  const bidders = leaderboards?.bidders ?? [];
  if (bidders.length === 0) return [];
  const top = bidders.reduce((max, b) => (b.settled_bid_amount > (max?.settled_bid_amount ?? -1) ? b : max), null);
  if (!top) return [];
  const share = pct(top.settled_bid_amount, totalBidAmount);
  if (share == null || share < 15) return [];
  const severity = share >= 25 ? "MEDIUM" : "LOW";
  return [
    {
      id: "bidder_concentration_dominance",
      type: "bidder_concentration_dominance",
      severity,
      departments: [DEPT.AUCTION_TEAM],
      primaryDepartment: DEPT.AUCTION_TEAM,
      title: "Single bidder dominates a large share of period winning value",
      evidence: `${top.bidder_name}: ${formatPeso(top.settled_bid_amount)} of ${formatPeso(totalBidAmount)} total (${fmtPct(share)})`,
      entity: top.bidder_name,
      entityLabel: top.bidder_name,
      branch: null,
      metricLabel: "Share of period winning value",
      metricValue: fmtPct(share),
      thresholdLabel: ">= 15% (minimum ₱500,000 period total)",
      scope: "period",
      rule: "Bidder Concentration Dominance",
      ruleDetail: {
        current: `${fmtPct(share)} (${formatCompactPeso(top.settled_bid_amount)} of ${formatCompactPeso(totalBidAmount)})`,
        threshold: "MEDIUM >= 25%, LOW >= 15%, minimum ₱500,000 period total",
      },
      relevantDate: null,
    },
  ];
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Main entry point — pure function, no side effects, no fetching. Takes
// the three already-fetched payloads and returns every flag currently
// applicable, sorted by severity (most urgent first).
export function computeOperationalFlags({ overview, leaderboards, opsFlags }) {
  const flags = [
    ...bidHistoryFreshnessFlags(opsFlags),
    ...lowSellThroughFlags(opsFlags),
    ...highUnsoldReserveValueFlags(opsFlags),
    ...unpaidOutstandingAgingFlags(opsFlags),
    ...missingItemNameFlags(opsFlags),
    ...unresolvedWinningBidsFlags(overview),
    ...lowRegistrationConversionFlags(overview),
    ...vendorStuckInventoryFlags(leaderboards),
    ...vendorConcentrationRiskFlags(leaderboards),
    ...branchSellThroughFlags(opsFlags),
    ...bidderConcentrationFlags(overview, leaderboards),
  ];

  return flags.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
