import { useEffect, useState } from "react";
import { ALL_STORES } from "./mockData";

// Real year-over-year metrics from ClickHouse (folded into /api/stores via
// ?mode=trends rather than its own route, to stay under Vercel's
// 12-function cap).
export function useTrends(store, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    const params = new URLSearchParams({ mode: "trends", ...(store !== ALL_STORES ? { store } : {}) })
      .toString()
      .replace(/\+/g, "%20");
    fetch(`/api/stores?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`stores trends returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
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
