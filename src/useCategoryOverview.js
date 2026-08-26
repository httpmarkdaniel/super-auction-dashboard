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

// Real category-scoped data for CategoryView — reuses /api/overview (same
// route the main Overview tab calls, see useLiveOverview.js) with an added
// `category` param. CategoryView now renders only the top summary (story +
// Sell-Through/Lots Sold/Avg Bid/Total Auctions), so this only needs the
// single summary call — no /api/leaderboards (Top Vendors/Bidders) or
// /api/overview?type=lots (Full Auction Detail) fetch, since neither backs
// anything CategoryView still renders.
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

        const overviewResult = await fetchJson("/api/overview", params);

        if (cancelled) return;

        setState({
          data: {
            // Real category-scoped KPIs. A few fields are renamed to match
            // what CategoryView.jsx's buildLiveCategoryData already reads —
            // the same remap useLiveOverview.js applies for the main
            // Overview tab (listed_lots -> ended_lots_listed, etc.).
            // total_bid_amount and total_auctions already match the raw
            // api/overview.js response field name directly.
            overview: {
              ...overviewResult,
              ended_lots_listed: overviewResult.listed_lots ?? 0,
              ended_lots_sold: overviewResult.sold_lots ?? 0,
              unsold_count: overviewResult.unsold_lots ?? 0,
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
