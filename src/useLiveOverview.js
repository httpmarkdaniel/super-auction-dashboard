import { useEffect, useState } from "react";
import { resolveDateRange, resolveComparisonRange } from "./utils/dateRange";
import { onTabVisible } from "./utils/visibility";
import {
  MOCK_OVERVIEW,
  MOCK_LEADERBOARDS,
  MOCK_RESERVE_PERFORMANCE,
  MOCK_CATEGORIES,
  MOCK_LOTS,
  MOCK_PAYABLES,
} from "./mockApiData";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    )
  )
    .toString()
    .replace(/\+/g, "%20");

  return fetch(`${path}?${qs}`).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${path} returned ${res.status}: ${text}`);
    }

    return res.json();
  });
}

// active: false pauses fetching AND the 30s poll entirely (no HTTP calls),
// leaving the last-fetched data in place — for callers whose current page
// doesn't need this data (see src/App.jsx: Overview/Auction Types/Export
// are the only consumers of the returned `overview`/`categories`/`lots`
// data; the Topbar search bar reads `operationsDetail`, itself derived
// from `lots`, on every page). Flipping back to true re-fetches
// immediately and resumes the interval — never a silent permanent stall.
export function useLiveOverview(dateRangeKey, store, category = "", refreshNonce = 0, active = true) {
  const [state, setState] = useState({
    data: {
      overview: MOCK_OVERVIEW,
      leaderboards: MOCK_LEADERBOARDS,
      reservePerformance: MOCK_RESERVE_PERFORMANCE,
      categories: MOCK_CATEGORIES,
      lots: MOCK_LOTS,
      payables: MOCK_PAYABLES,
      settledLots: [],
      activeAuctionRows: [],
      unsoldLotRows: [],
      serviceIncomeLots: [],
      forApprovalLots: [],
    },
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        // Comparable previous-period window for scorecard deltas — same
        // elapsed-window rule per preset (see resolveComparisonRange's own
        // comment). Passed through as additive query params: /api/overview
        // only computes the comparison block when both are present, so
        // this can never change any other Overview figure.
        const { from: compareFrom, to: compareTo } = resolveComparisonRange(dateRangeKey);

        // Drives Bid Trend's bucket grain (WTD/MTD daily, YTD monthly,
        // Custom span-based) — see api/overview.js's BID TREND comment and
        // api/_bucketing.js's pickBucketGrain.
        const preset = typeof dateRangeKey === "string" ? dateRangeKey : "custom";

        // Four of the six overview `type=` variants that used to fire here
        // every 30s (settled-lots, unsold-lots, active-auctions,
        // for-approval) fed row-level arrays that no live component reads —
        // verified by grepping every consumer of the returned
        // settledLots/unsoldLotRows/activeAuctionRows/forApprovalLots
        // fields (App.jsx just carries them through; nothing renders their
        // contents, only the SCALAR figures already present on
        // `liveOverview` itself — for_approval_lots, active_auctions,
        // unsold_lots/unsold_value, etc.). Removed outright rather than
        // left in "just in case": each was a full extra HTTP round-trip
        // rebuilding the same settled-lot population from scratch. Only
        // `type=lots` (Lots Sold/Listed drilldown + operationsDetail + the
        // Topbar search bar) and `type=service-income` (Service Income
        // drilldown) are actually consumed, so those two remain.
        const [liveOverview, liveLeaderboards, lotsResult, serviceIncomeResult] = await Promise.all([
          fetchJson("/api/overview", { from, to, store, category, compareFrom, compareTo, preset }),
          fetchJson("/api/leaderboards", { from, to, store, category }),

          // LOTS SOLD / LISTED DRILLDOWN + operationsDetail/search
          fetchJson("/api/overview", { from, to, store, category, type: "lots" }),

          // SERVICE INCOME DRILLDOWN — the exact settled lots behind
          // Service Income, same population as Total Bid Amount.
          fetchJson("/api/overview", { from, to, store, category, type: "service-income" }),
        ]);

        if (cancelled) return;

        setState({
          data: {
            overview: {
              ...MOCK_OVERVIEW,

              // LIVE TOTAL BID AMOUNT — settled (Paid/Released) only. Do
              // NOT add any live_bid_correction_delta / current-bid-value
              // figure here; that's a separate metric (current_bid_value).
              total_bid_amount: liveOverview.total_bid_amount,

              todays_bid_amount: liveOverview.todays_bid_amount ?? 0,

              // LIVE SERVICE INCOME — real warehouse revenue (Buyer's
              // Premium Income + Commission Income) from the SAME settled
              // Paid/Released population as Total Bid Amount. Replaces the
              // mock service_income_buyers_premium/service_income_service_fee
              // spread above.
              service_income_buyers_premium: liveOverview.service_income_buyers_premium ?? 0,
              service_income_commission: liveOverview.service_income_commission ?? 0,
              service_income_total: liveOverview.service_income_total ?? 0,

              // LIVE FOR APPROVAL — lots resolved for_approval_status =
              // 'For Approval', independent of lifecycle status. Replaces
              // the mock pending_payment_count/pending_payment_value.
              for_approval_lots: liveOverview.for_approval_lots ?? 0,
              for_approval_bid_amount: liveOverview.for_approval_bid_amount ?? 0,

              // LIVE BRANCH BREAKDOWN
              branches: liveOverview.branches ?? [],

              // LIVE ACTIVE AUCTIONS — key must be active_auctions, matching
              // what App.jsx's heroKPIs.activeAuctionsNow actually reads
              // (kpis.active_auctions). This used to write to total_auctions
              // instead, a field nothing in the pipeline consumes, so the
              // real live count from the API was silently discarded and
              // Active Auctions always rendered its `|| 0` fallback.
              active_auctions: liveOverview.active_auctions ?? 0,

              // LIVE LOTS SOLD / LISTED
              ended_lots_listed: liveOverview.listed_lots ?? 0,
              ended_lots_sold: liveOverview.sold_lots ?? 0,

              // LIVE UNSOLD LOTS
              unsold_count: liveOverview.unsold_lots ?? 0,
              unsold_value: liveOverview.unsold_value ?? 0,

              // LIVE WITH RESERVE PRICE
              unsold_with_reserve_count: liveOverview.unsold_with_reserve_count ?? 0,
              unsold_with_reserve_value: liveOverview.unsold_with_reserve_value ?? 0,

              // Used as denominator for unsold calculations
              total_inventory: liveOverview.listed_lots ?? 0,

              // Sum of every bid EVENT per hour (regardless of settlement
              // status) — feeds only HeroKPIs' Total Bid Amount sparkline
              // now. The full "Bidding Activity by Hour" chart/tooltip
              // section (and the extra /api/bidding-pace fetch that fed its
              // hover tooltip) was removed from Overview; CategoryView
              // still fetches this same field via its own separate
              // /api/overview call.
              hourly: liveOverview.hourly ?? [],

              // AUCTIONS CONCLUDED / AVG BID PER AUCTION / AVG BID PER SOLD
              // LOT — same settled population as total_bid_amount, see
              // api/overview.js's settledTotalResult query.
              auctions_concluded: liveOverview.auctions_concluded ?? 0,
              settled_lot_count: liveOverview.settled_lot_count ?? 0,

              // Auction-grain drilldown data + the daily Bid Trend — see
              // api/overview.js's AUCTION-LEVEL SUMMARY / BID TREND query
              // comments.
              auction_summary: liveOverview.auction_summary ?? [],
              bid_trend: liveOverview.bid_trend ?? [],
              bid_trend_bucket_label: liveOverview.bid_trend_bucket_label ?? "day",

              // Registration -> Bidder Conversion — see api/overview.js's
              // REGISTRATION -> BIDDER CONVERSION query comment.
              registered_customers: liveOverview.registered_customers ?? 0,
              participating_registered_bidders: liveOverview.participating_registered_bidders ?? 0,

              // Avg Bids / Unique Bidder — bidder engagement/intensity, see
              // api/overview.js's AVG BIDS / UNIQUE BIDDER query comment.
              // null avg (never a fabricated 0) when nobody participated.
              total_bid_events: liveOverview.total_bid_events ?? 0,
              unique_participating_bidders: liveOverview.unique_participating_bidders ?? 0,
              avg_bids_per_unique_bidder: liveOverview.avg_bids_per_unique_bidder ?? null,
              bidder_engagement: liveOverview.bidder_engagement ?? [],

              // TOTAL BIDS TODAY / NEW & RETURNING BIDDERS TODAY — see
              // api/overview.js's todayActivityResultPromise comment.
              total_bids_today: liveOverview.total_bids_today ?? 0,
              new_bidders_today: liveOverview.new_bidders_today ?? 0,
              returning_bidders_today: liveOverview.returning_bidders_today ?? 0,

              // WINNING BIDS VIA MAX BID — see api/overview.js's
              // winningMaxBidQuery comment.
              winning_max_bid: liveOverview.winning_max_bid ?? null,
              winning_max_bid_by_branch: liveOverview.winning_max_bid_by_branch ?? [],
              winning_max_bid_by_category: liveOverview.winning_max_bid_by_category ?? [],

              // Dynamic period-over-period comparison — null when not
              // computed (see api/overview.js's DYNAMIC COMPARISON PERIOD
              // query comment), never a fabricated delta.
              comparison: liveOverview.comparison ?? null,
            },

            leaderboards: {
              ...MOCK_LEADERBOARDS,
              composition: liveLeaderboards.composition,
              perAuctionComposition:
                liveLeaderboards.perAuctionComposition ?? [],

              // Per-auction Participating breakdown — same
              // bidding_activity_composition definition, grouped by
              // auction instead of collapsed to one number. Reused (not
              // refetched) for the Auctions Concluded drilldown's
              // per-auction bidder composition.
              perAuctionBiddingActivity: liveLeaderboards.perAuctionBiddingActivity ?? [],

              // Bid-activity ("Participating") composition — sum of every
              // bid EVENT per bidder, not settled winning value. See
              // api/leaderboards.js's bidding_activity_composition comment.
              participatingComposition: liveLeaderboards.bidding_activity_composition ?? {},

              // LIVE TOP VENDORS / TOP BIDDERS (settled, Paid/Released) —
              // real data, replaces the mock spread above.
              vendors: liveLeaderboards.vendors ?? [],
              bidders: liveLeaderboards.bidders ?? [],
            },

            categories: {
              ...MOCK_CATEGORIES,

              // LIVE FROM CLICKHOUSE
              categories: liveOverview.categories ?? [],
            },

            reservePerformance: MOCK_RESERVE_PERFORMANCE,

            // LIVE LOTS SOLD/LISTED drilldown rows, replacing MOCK_LOTS
            // for this section. type=lots' own disposition (Sold/Unsold)
            // already covers every listed lot — NOT merged with the
            // separate strict unsold-lots fetch below, since that would
            // double-count lots appearing in both (type=lots' disposition
            // bucket is a superset of strict status='Unsold' — see
            // implementation report re Refunded/Returned lots).
            //
            // status vs disposition: `status` is the REAL resolved
            // warehouse lifecycle status (Paid/Released/Outstanding/
            // Unpaid/Unsold/Refunded/Returned) — shown as-is, never
            // relabeled. `disposition` is the separate Sold/Unsold tab
            // bucket OperationsTable uses for its Sold/Unsold tab
            // filtering/counts — kept distinct so the real status is never
            // overwritten by that binary bucket (see 545O-N lot 10
            // investigation: status='Unpaid' was previously displayed as
            // "Sold" because both concepts shared one field).
            lots: {
              lots: (lotsResult.rows ?? []).map((row) => ({
                lotNumber: row.lot_number,
                item: row.name,
                vendor: row.vendor ?? "—",
                category: row.category ?? "—",
                status: row.status,
                disposition: row.disposition,
                soldPrice: Number(row.sold_price ?? 0),
                approval: row.for_approval_status ?? null,
                totalBidAmount: Number(row.bid_amount ?? 0),
                buyersPremium: 0,
                serviceFee: 0,
                reservedPrice: Number(row.reserved_price ?? 0),
                branch: row.store_name ?? "—",
                auctionNumber: row.auction_number,
              })),
            },

            payables: MOCK_PAYABLES,

            // unsoldLotRows/settledLots/forApprovalLots/activeAuctionRows
            // used to come from four separate /api/overview requests
            // (type=unsold-lots/settled-lots/for-approval/active-auctions)
            // that nothing in the current UI reads — see the removed-fetch
            // comment above. Kept as empty arrays (not removed from the
            // shape entirely) so anything still destructuring them keeps
            // working; the corresponding SCALAR figures (unsold_lots,
            // for_approval_lots, active_auctions, etc.) still come from
            // `liveOverview` above, unaffected.
            unsoldLotRows: [],
            settledLots: [],
            forApprovalLots: [],
            activeAuctionRows: [],

            // LIVE SERVICE INCOME DRILLDOWN — the settled lots summing
            // exactly to service_income_total (and each component summing
            // exactly to its own KPI).
            serviceIncomeLots: (serviceIncomeResult.rows ?? []).map((row) => ({
              auctionNumber: row.auction_number,
              lotNumber: row.lot_number,
              branch: row.store_name,
              category: row.category,
              vendor: row.vendor,
              status: row.status,
              approval: row.for_approval_status ?? null,
              bidAmount: Number(row.bid_amount ?? 0),
              buyersPremiumPct: Number(row.buyers_premium_pct ?? 0),
              buyersPremiumIncome: Number(row.buyers_premium_income ?? 0),
              commissionPct: Number(row.commission_pct ?? 0),
              commissionIncome: Number(row.commission_income ?? 0),
              totalServiceIncome: Number(row.total_service_income ?? 0),
            })),
          },

          loading: false,
          error: null,
        });

      } catch (err) {
        if (cancelled) return;

        console.error("Failed loading live dashboard data:", err);

        setState({
          data: {
            overview: MOCK_OVERVIEW,
            leaderboards: MOCK_LEADERBOARDS,
            reservePerformance: MOCK_RESERVE_PERFORMANCE,
            categories: MOCK_CATEGORIES,
            lots: MOCK_LOTS,
            payables: MOCK_PAYABLES,
            settledLots: [],
            activeAuctionRows: [],
            unsoldLotRows: [],
            serviceIncomeLots: [],
            forApprovalLots: [],
          },
          loading: false,
          error: err.message,
        });
      }
    }

    load();

    // Vercel P0 usage fix: skip the recurring fetch entirely while this
    // browser tab is backgrounded/minimized (the interval keeps its own
    // single clock running — nothing new to schedule), and catch up with
    // exactly one immediate load() the moment it's foregrounded again.
    const interval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 30_000);

    const unsubscribe = onTabVisible(load);

    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, [dateRangeKey, store, category, refreshNonce, active]);

  return state;
}