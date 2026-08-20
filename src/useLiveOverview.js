import { useEffect, useState } from "react";
import { resolveDateRange } from "./utils/dateRange";
import {
  MOCK_LEADERBOARDS,
  MOCK_RESERVE_PERFORMANCE,
  MOCK_CATEGORIES,
  MOCK_LOTS,
  MOCK_PAYABLES,
} from "./mockApiData";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v)
  )
    .toString()
    .replace(/\+/g, "%20");

  return fetch(`${path}?${qs}`).then((res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}`);
    return res.json();
  });
}

export function useLiveOverview(dateRangeKey, store, refreshNonce = 0) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({
      ...s,
      loading: true,
      error: null,
    }));

    const { from, to } = resolveDateRange(dateRangeKey);

    fetchJson("/api/overview", {
      from,
      to,
      store,
    })
      .then((overview) => {
        if (cancelled) return;

        setState({
          data: {
            overview,
            leaderboards: MOCK_LEADERBOARDS,
            reservePerformance: MOCK_RESERVE_PERFORMANCE,
            categories: MOCK_CATEGORIES,
            lots: MOCK_LOTS,
            payables: MOCK_PAYABLES,
          },
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;

        setState({
          data: null,
          loading: false,
          error: err.message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [dateRangeKey, store, refreshNonce]);

  return state;
}