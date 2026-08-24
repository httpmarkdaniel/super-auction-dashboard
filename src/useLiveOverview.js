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

export function useLiveOverview(dateRangeKey, store, refreshNonce = 0) {
  const [state, setState] = useState({
    data: {
      overview: MOCK_OVERVIEW,
      leaderboards: MOCK_LEADERBOARDS,
      reservePerformance: MOCK_RESERVE_PERFORMANCE,
      categories: MOCK_CATEGORIES,
      lots: MOCK_LOTS,
      payables: MOCK_PAYABLES,
    },
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRangeKey);

        const [liveOverview, liveLeaderboards] = await Promise.all([
          fetchJson("/api/overview", {
            from,
            to,
            store,
          }),

          fetchJson("/api/leaderboards", {
            from,
            to,
            store,
          }),
        ]);

        if (cancelled) return;

        setState({
          data: {
            overview: {
              ...MOCK_OVERVIEW,

              // LIVE TOTAL BID AMOUNT
              total_bid_amount: liveOverview.total_bid_amount,

              todays_bid_amount: liveOverview.todays_bid_amount ?? 0,

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

              // Used as denominator for unsold calculations
              total_inventory: liveOverview.listed_lots ?? 0,
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
            lots: MOCK_LOTS,
            payables: MOCK_PAYABLES,
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
  }, [dateRangeKey, store, refreshNonce]);

  return state;
}