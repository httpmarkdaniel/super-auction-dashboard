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

// Category-scoped Bidder Composition for Overview's local category filter.
// Deliberately a SEPARATE fetch from useLiveOverview.js's own
// /api/leaderboards call — that call also feeds Top Vendors/Bidders, which
// must stay global regardless of this filter, so it can't be reused here
// without leaking the category filter into sections that must not change.
//
// Fetches nothing when category is "" (All Categories) — the caller should
// fall back to the already-fetched global bidderComposition in that case,
// so the default Overview state makes zero additional requests.
//
// Uses the exact same /api/leaderboards route and settled bidder-identity
// resolution (api/_bidderIdentity.js via BIDDER_IDENTITY_CTES) as every
// other Bidder Composition consumer — no separate classifier.
export function useBidderCompositionCategory(category, store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const inputsRef = useRef({ category, store, dateRangeKey });

  useEffect(() => {
    if (!category) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;

    // Same background-refresh-without-flicker pattern as
    // useCategoryOverview.js: only blank into a loading state on a real
    // category/store/date change or the very first load for this
    // category, never on a same-selection refresh (refreshNonce alone).
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
        const result = await fetchJson("/api/leaderboards", { category, from, to, store: storeParam });

        if (cancelled) return;

        const c = result.composition ?? {};
        setState({
          data: {
            newBidders: Number(c.new_bidders) || 0,
            returningBidders: Number(c.returning_bidders) || 0,
            newBiddersBidAmount: Number(c.new_bidders_bid_amount) || 0,
            returningBiddersBidAmount: Number(c.returning_bidders_bid_amount) || 0,
            // No per-week trend source exists for composition (the global
            // path's own newBidderTrend is already always empty today —
            // api/leaderboards.js has no such field — so this matches
            // existing behavior exactly, not a regression).
            newBidderTrend: [],
            byAuction: (result.perAuctionComposition || []).map((a) => ({
              auctionNumber: a.auction_number,
              newBidders: Number(a.new_bidders) || 0,
              returningBidders: Number(a.returning_bidders) || 0,
              newBiddersBidAmount: Number(a.new_bidders_bid_amount) || 0,
              returningBiddersBidAmount: Number(a.returning_bidders_bid_amount) || 0,
            })),
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
