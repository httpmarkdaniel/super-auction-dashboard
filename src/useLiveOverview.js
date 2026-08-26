import { useEffect, useState } from "react";
import { resolveDateRange } from "./utils/dateRange";
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

export function useLiveOverview(dateRangeKey, store, category = "", refreshNonce = 0) {
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
    let cancelled = false;

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRangeKey);

        const [
          liveOverview,
          liveLeaderboards,
          settledLotsResult,
          lotsResult,
          unsoldLotsResult,
          activeAuctionsResult,
          serviceIncomeResult,
          forApprovalResult,
          biddingPaceResult,
        ] = await Promise.all([
          fetchJson("/api/overview", { from, to, store, category }),
          fetchJson("/api/leaderboards", { from, to, store, category }),

          // TOTAL BID AMOUNT DRILLDOWN — the exact settled lots behind
          // total_bid_amount, sum(bid_amount) reconciles to it exactly.
          fetchJson("/api/overview", { from, to, store, category, type: "settled-lots" }),

          // LOTS SOLD / LISTED DRILLDOWN
          fetchJson("/api/overview", { from, to, store, category, type: "lots" }),

          // UNSOLD LOTS + WITH RESERVE PRICE DRILLDOWN (same rows, the
          // With Reserve view filters client-side by reserved_price > 0)
          fetchJson("/api/overview", { from, to, store, category, type: "unsold-lots" }),

          // ACTIVE AUCTIONS DRILLDOWN — "right now", independent of the
          // selected date range AND deliberately independent of category —
          // an active auction can contain lots from multiple categories, so
          // "how many auctions contain at least one lot in category X" is a
          // different, not-yet-agreed metric from today's "auctions in
          // progress right now" count. See api/overview.js's ACTIVE
          // AUCTIONS comment for the same reasoning. Still store-scoped.
          fetchJson("/api/overview", { store, type: "active-auctions" }),

          // SERVICE INCOME DRILLDOWN — the exact settled lots behind
          // Service Income, same population as Total Bid Amount above.
          fetchJson("/api/overview", { from, to, store, category, type: "service-income" }),

          // FOR APPROVAL DRILLDOWN — lots resolved for_approval_status =
          // 'For Approval', independent of lifecycle status.
          fetchJson("/api/overview", { from, to, store, category, type: "for-approval" }),

          // HOURLY BIDDER BREAKDOWN — the ONE authoritative per-hour
          // Participating/Winning breakdown (src/utils/hourlyBidderDetail.js),
          // reused unmodified from the Bidding Pace tab's own endpoint, for
          // the "Bidding Activity by Hour" hover tooltip. Category-scoped
          // (unlike Bidding Pace's own call, which never passes one) so the
          // tooltip narrows exactly like every other Overview figure when a
          // category is selected. Does NOT replace liveOverview.hourly
          // above, which still drives the chart's own Bid Amount line.
          fetchJson("/api/bidding-pace", { from, to, store, category }),
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

              // LIVE ACTIVE AUCTIONS
              total_auctions: liveOverview.active_auctions ?? 0,

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

              // BIDDING ACTIVITY BY HOUR — same field/query CategoryView
              // already reads, now scoped by Overview's own category filter
              // too (via the `category` param above). Sum of every bid
              // EVENT within the selected date range + store + category,
              // regardless of settlement status — NOT the settled
              // total_bid_amount above. See api/overview.js's BIDDING
              // ACTIVITY BY HOUR query comment.
              hourly: liveOverview.hourly ?? [],

              // Per-hour Participating/Winning bidder breakdown for the
              // same "Bidding Activity by Hour" chart's hover tooltip —
              // see the fetchJson call above.
              hourlyBidderRows: biddingPaceResult.hourly ?? [],
            },

            leaderboards: {
              ...MOCK_LEADERBOARDS,
              composition: liveLeaderboards.composition,
              perAuctionComposition:
                liveLeaderboards.perAuctionComposition ?? [],

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

            // LIVE UNSOLD LOTS drilldown rows (strict status='Unsold') —
            // used for the Unsold Lots AND With Reserve Price KPIs, which
            // filters this same array client-side by reservedPrice > 0.
            // Deliberately separate from `lots.lots` above — see comment
            // there.
            unsoldLotRows: (unsoldLotsResult.rows ?? []).map((row) => ({
              lotNumber: row.lot_number,
              item: row.name,
              vendor: row.vendor ?? "—",
              category: "—",
              status: "Unsold",
              approval: row.for_approval_status ?? null,
              totalBidAmount: 0,
              reservedPrice: Number(row.reserved_price ?? 0),
              soldPrice: Number(row.sold_price ?? 0),
              branch: row.store_name ?? "—",
              auctionNumber: row.auction_number,
            })),

            // LIVE TOTAL BID AMOUNT DRILLDOWN — the settled lots summing
            // exactly to total_bid_amount.
            settledLots: (settledLotsResult.rows ?? []).map((row) => ({
              auctionNumber: row.auction_number,
              lotNumber: row.lot_number,
              item: row.name,
              branch: row.store_name,
              category: row.category,
              vendor: row.vendor,
              status: row.status,
              approval: row.for_approval_status ?? null,
              bidderName: row.bidder_name,
              bidAmount: Number(row.bid_amount ?? 0),
            })),

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

            // LIVE FOR APPROVAL DRILLDOWN — lots summing exactly to
            // for_approval_lots (count) / for_approval_bid_amount (sum).
            // Not restricted by lifecycle status — status is shown as-is.
            forApprovalLots: (forApprovalResult.rows ?? []).map((row) => ({
              auctionNumber: row.auction_number,
              lotNumber: row.lot_number,
              item: row.name,
              branch: row.store_name,
              vendor: row.vendor,
              status: row.status,
              approval: row.for_approval_status ?? null,
              bidAmount: Number(row.bid_amount ?? 0),
              reservedPrice: Number(row.reserved_price ?? 0),
            })),

            // LIVE ACTIVE AUCTIONS DRILLDOWN — auction-level, not lot-level.
            activeAuctionRows: (activeAuctionsResult.rows ?? []).map((row) => ({
              auctionNumber: row.auction_number,
              name: row.name,
              branch: row.store_name,
              startingTime: row.starting_time,
              endingTime: row.ending_time,
              lotCount: Number(row.lot_count ?? 0),
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

    const interval = setInterval(load, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dateRangeKey, store, category, refreshNonce]);

  return state;
}