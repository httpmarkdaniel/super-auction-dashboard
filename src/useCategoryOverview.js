// MOCKED — real fetch disconnected, see src/mockApiData.js. Restore fetch() below to re-wire.
import { useState } from "react";
import { MOCK_OVERVIEW, MOCK_LEADERBOARDS, MOCK_PAYABLES, MOCK_LOTS } from "./mockApiData";

export function useCategoryOverview(category, store, dateRangeKey, refreshNonce = 0) {
  const [state] = useState({
    data: { overview: MOCK_OVERVIEW, leaderboards: MOCK_LEADERBOARDS, payables: MOCK_PAYABLES, lots: MOCK_LOTS },
    loading: false,
    error: null,
  });

  return state;
}

/* Original live implementation:
import { useEffect, useState } from "react";
import { ALL_STORES } from "./mockData";
import { resolveDateRange } from "./utils/dateRange";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString().replace(/\+/g, "%20");
  return fetch(`${path}?${qs}`).then((res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}`);
    return res.json();
  });
}

// Real category-scoped data for CategoryView — reuses /api/overview,
// /api/leaderboards, /api/payables, /api/lots with an added `category`
// param rather than a dedicated route (12-function cap).
export function useCategoryOverview(category, store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const { from, to } = resolveDateRange(dateRangeKey);
    const storeParam = store === ALL_STORES ? undefined : store;
    const params = { category, from, to, store: storeParam };

    Promise.all([
      fetchJson("/api/overview", params),
      fetchJson("/api/leaderboards", params),
      fetchJson("/api/payables", { category, store: storeParam }),
      fetchJson("/api/lots", params),
    ])
      .then(([overview, leaderboards, payables, lots]) => {
        if (cancelled) return;
        setState({ data: { overview, leaderboards, payables, lots }, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [category, store, dateRangeKey, refreshNonce]);

  return state;
}
*/
