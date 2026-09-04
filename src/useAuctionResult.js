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

// Auction Result tab — one HTTP request to /api/overview?type=auction-result
// (which itself runs one grouped + one totals ClickHouse query — see that
// handler's own comment). Fetches only on mount, filter change, or manual
// refresh — same pattern as useBidderAnalytics.js, no polling interval.
export function useAuctionResult(dateRangeKey, store, category, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        const params = { from, to, store, category, type: "auction-result" };
        const result = await fetchJson("/api/overview", params);
        if (cancelled) return;
        setState({ data: result, loading: false, error: null });
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
