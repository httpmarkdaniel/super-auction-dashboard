import { useEffect, useState } from "react";
import { resolveDateRange } from "./utils/dateRange";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    .toString()
    .replace(/\+/g, "%20");
  return fetch(`${path}?${qs}`).then(async (res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${await res.text()}`);
    return res.json();
  });
}

// Bidder Analytics tab — fully dynamic to the selected Date/Store/Category
// filters (PART 18 of this task), never hardcoded to YTD. Reuses the
// EXISTING /api/overview (categories -> Bidders by Category,
// bidder_engagement -> Most Active Bidder) and /api/leaderboards
// (bidding_activity_composition -> canonical Participating/New Bidders,
// bidders -> Top 10 by Winning Bid Amount) payloads — only the bucketed
// time series / Always Active / Went Quiet classification is genuinely
// new data, from /api/bidder-analytics. One-shot fetch on filter change,
// no polling interval (this tab has no "live" concept).
export function useBidderAnalytics(dateRangeKey, store, category, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        const params = { from, to, store, category };
        const [overview, leaderboards, bidderAnalytics] = await Promise.all([
          fetchJson("/api/overview", params),
          fetchJson("/api/leaderboards", params),
          fetchJson("/api/bidder-analytics", params),
        ]);
        if (cancelled) return;
        setState({ data: { overview, leaderboards, bidderAnalytics }, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err.message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateRangeKey, store, category, refreshNonce]);

  return state;
}
