import { useEffect, useState } from "react";
import { resolveDateRange } from "./utils/dateRange";

// URLSearchParams.toString() encodes spaces as "+", which is only a space
// by form-urlencoded convention — some server-side query parsers (Vercel's
// included) don't reliably decode it back, so a store like "MEGA AUCTION
// SHOWROOM" silently matches zero rows. %20 is unambiguous everywhere.
function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString().replace(/\+/g, "%20");
  return fetch(`${path}?${qs}`).then((res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}`);
    return res.json();
  });
}

// Fetches every ClickHouse-backed endpoint for the current date-range +
// store selection in parallel. Vendor payables ignores date (it's a
// running balance, not a per-period flow — see api/payables.js) but still
// respects the store filter. Returns { data: null, loading, error } until
// everything resolves, so callers can show a real loading/error state
// instead of a partially-loaded mix of real and placeholder data.
export function useLiveOverview(dateRangeKey, store, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const { from, to } = resolveDateRange(dateRangeKey);
    const rangeParams = { from, to, store };

    Promise.all([
      fetchJson("/api/overview", rangeParams),
      fetchJson("/api/leaderboards", rangeParams),
      fetchJson("/api/reserve-performance", rangeParams),
      fetchJson("/api/categories", rangeParams),
      fetchJson("/api/lots", rangeParams),
      fetchJson("/api/payables", { store }),
    ])
      .then(([overview, leaderboards, reservePerformance, categories, lots, payables]) => {
        if (cancelled) return;
        setState({
          data: { overview, leaderboards, reservePerformance, categories, lots, payables },
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [dateRangeKey, store, refreshNonce]);

  return state;
}
