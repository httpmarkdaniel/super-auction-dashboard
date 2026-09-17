import { useEffect, useState } from "react";

// TOP VENDORS — 5-YEAR BID VALUE — a rolling 5-calendar-year reference
// table, still independent of the dashboard's date-range/Store filters
// (see api/leaderboards.js's type=vendor-top-5-year comment), but now
// DOES accept the Category filter — refetches when `category` changes,
// unlike the old always-empty-dependency-array version.
export function useVendorTop5Year(category = "") {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const qs = new URLSearchParams({ type: "vendor-top-5-year", category: category || "" });
    fetch(`/api/leaderboards?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`vendor-top-5-year returned ${res.status}: ${await res.text()}`);
        return res.json();
      })
      .then((result) => {
        if (!cancelled) setState({ data: result, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  return state;
}
