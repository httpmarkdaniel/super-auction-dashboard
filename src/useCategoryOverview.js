import { useEffect, useState } from "react";
import { ALL_STORES } from "./mockData";
import { resolveDateRange } from "./utils/dateRange";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
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

// Real category-scoped data for CategoryView — reuses /api/overview and
// /api/leaderboards (same routes the main Overview tab calls, see
// useLiveOverview.js) with an added `category` param, plus
// /api/overview?type=lots for the Full Auction Detail drilldown. No
// /api/payables call: that endpoint doesn't exist, so Vendor Payables is
// surfaced as `payables: null` — see CategoryView.jsx's explicit
// unavailable/deferred rendering for that field, never a mock fallback.
export function useCategoryOverview(category, store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        const storeParam = store === ALL_STORES ? undefined : store;
        const params = { category, from, to, store: storeParam };

        const [overviewResult, leaderboardsResult, lotsResult] = await Promise.all([
          fetchJson("/api/overview", params),
          fetchJson("/api/leaderboards", params),
          fetchJson("/api/overview", { ...params, type: "lots" }),
        ]);

        if (cancelled) return;

        setState({
          data: {
            // Real category-scoped KPIs. A few fields are renamed to match
            // what CategoryView.jsx's buildLiveCategoryData already reads —
            // the same remap useLiveOverview.js applies for the main
            // Overview tab (listed_lots -> ended_lots_listed, etc.). Every
            // other field (total_bid_amount, buyers_premium_amount,
            // service_fee_amount, avg_buyers_premium_pct, avg_commission_pct,
            // sold_at_or_below, sold_above, avg_premium_over_reserve_pct,
            // total_auctions, unsold_value) already matches the raw
            // api/overview.js response field name directly.
            overview: {
              ...overviewResult,
              ended_lots_listed: overviewResult.listed_lots ?? 0,
              ended_lots_sold: overviewResult.sold_lots ?? 0,
              unsold_count: overviewResult.unsold_lots ?? 0,
            },

            // api/leaderboards.js names these settled_bid_amount/
            // settled_lots/settled_wins (see App.jsx's identical remap for
            // the main Overview's Top Vendors/Bidders) — renamed here to
            // the bid_amount/lots/wins CategoryView.jsx already reads.
            leaderboards: {
              vendors: (leaderboardsResult.vendors ?? []).map((v) => ({
                vendor: v.vendor,
                bid_amount: Number(v.settled_bid_amount) || 0,
                lots: Number(v.settled_lots) || 0,
              })),
              bidders: (leaderboardsResult.bidders ?? []).map((b) => ({
                bidder_name: b.bidder_name,
                bid_amount: Number(b.settled_bid_amount) || 0,
                wins: Number(b.settled_wins) || 0,
              })),
            },

            // No real Vendor Payables source exists (/api/payables doesn't
            // exist) — explicitly null, never mock data standing in as if
            // real. See CategoryView.jsx's deferred/unavailable rendering.
            payables: null,

            // Same row shape useLiveOverview.js builds from the identical
            // /api/overview?type=lots endpoint, so AuctionSummaryTable
            // (fed via CategoryView's operationsDetail) sees the fields it
            // expects (auctionNumber, branch, category, totalBidAmount,
            // reservedPrice, etc.).
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
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err.message });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [category, store, dateRangeKey, refreshNonce]);

  return state;
}
