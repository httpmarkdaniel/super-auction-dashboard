import { useEffect, useState } from "react";
import { ALL_STORES } from "./mockData";

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

// Real auctions with starting_time in the future, from ClickHouse
// (api/upcoming-auctions.js) — the broader future auction calendar, all
// categories, independent of the Overview date range (an auction's own
// starting_time is what matters here, not when bids were placed — see
// that endpoint's comment for the full population reasoning).
//
// "All Stores" is a mock-only UI sentinel, not a real branch value — it
// must never be sent to the backend as a literal store filter (the same
// conversion every other store-scoped fetch in this codebase applies; see
// App.jsx's useLiveOverview call and the Online Bidding fix for the same
// bug class).
export function useUpcomingAuctions(store, refreshNonce = 0) {
  const [state, setState] = useState({ data: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { auctions } = await fetchJson("/api/upcoming-auctions", {
          store: store === ALL_STORES ? undefined : store,
        });
        if (!cancelled) setState({ data: auctions ?? [], loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ data: [], loading: false, error: err.message });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [store, refreshNonce]);

  return state;
}
