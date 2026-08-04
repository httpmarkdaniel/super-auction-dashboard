import { useEffect, useState } from "react";
import { ALL_STORES } from "./mockData";

// Real auctions with starting_time in the future, from ClickHouse (folded
// into /api/live-auctions via ?when=upcoming rather than its own route, to
// stay under Vercel's 12-function cap).
export function useUpcomingAuctions(store, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    const params = new URLSearchParams({ when: "upcoming", ...(store !== ALL_STORES ? { store } : {}) })
      .toString()
      .replace(/\+/g, "%20");
    fetch(`/api/live-auctions?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`live-auctions returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ data: data.auctions || [], loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [store, refreshNonce]);

  return state;
}
