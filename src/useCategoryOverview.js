import { useEffect, useRef, useState } from "react";
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
// useLiveOverview.js) with an added `category` param. CategoryView renders
// the top summary (story + Sell-Through/Lots Sold/Avg Bid/Total Auctions,
// including hourly activity, all from /api/overview) plus Top
// Vendors/Bidders (from /api/leaderboards). No /api/overview?type=lots
// fetch — Full Auction Detail stays removed, so nothing needs its rows.
export function useCategoryOverview(category, store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  // Tracks the user's actual selection so a background refresh (refreshNonce
  // alone ticking, from the auto-refresh timer or the manual Refresh
  // button — see App.jsx's triggerRefresh) can be told apart from a real
  // category/store/date-range change. Only a real change (or the very
  // first load, when there's no data yet) should blank the view into the
  // "Loading…" state; a same-selection background refresh should keep the
  // current content visible and swap in fresh data once it arrives — the
  // same pattern useLiveOverview.js already uses for the main Overview tab.
  const inputsRef = useRef({ category, store, dateRangeKey });

  useEffect(() => {
    let cancelled = false;

    const inputsChanged =
      inputsRef.current.category !== category ||
      inputsRef.current.store !== store ||
      inputsRef.current.dateRangeKey !== dateRangeKey;
    inputsRef.current = { category, store, dateRangeKey };

    async function load() {
      setState((s) =>
        inputsChanged || !s.data ? { ...s, loading: true, error: null } : { ...s, error: null }
      );

      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        const storeParam = store === ALL_STORES ? undefined : store;
        const params = { category, from, to, store: storeParam };

        const [overviewResult, leaderboardsResult] = await Promise.all([
          fetchJson("/api/overview", params),
          fetchJson("/api/leaderboards", params),
        ]);

        if (cancelled) return;

        setState({
          data: {
            // Real category-scoped KPIs. A few fields are renamed to match
            // what CategoryView.jsx's buildLiveCategoryData already reads —
            // the same remap useLiveOverview.js applies for the main
            // Overview tab (listed_lots -> ended_lots_listed, etc.).
            // total_bid_amount and total_auctions already match the raw
            // api/overview.js response field name directly. hourly passes
            // through as-is (already category/store/date-scoped server-side).
            overview: {
              ...overviewResult,
              ended_lots_listed: overviewResult.listed_lots ?? 0,
              ended_lots_sold: overviewResult.sold_lots ?? 0,
              unsold_count: overviewResult.unsold_lots ?? 0,
            },

            // api/leaderboards.js names these settled_bid_amount/
            // settled_lots/settled_wins (see App.jsx's identical remap for
            // the main Overview's Top Vendors/Bidders) — renamed here to
            // the bid_amount/lots/wins CategoryView.jsx reads. Bidder
            // identity/attribution logic itself is untouched — same
            // category-scoped settledVendorsResult/settledBiddersResult
            // queries the endpoint already ran before this section existed.
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
