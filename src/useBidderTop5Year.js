import { useEffect, useState } from "react";

// TOP BIDDERS — 5-YEAR BID VALUE — same rolling-5-calendar-year "hall of
// fame" concept as useVendorTop5Year, applied to bidders. Independent of
// the dashboard's date-range/Store filters; accepts only Category.
export function useBidderTop5Year(category = "") {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const qs = new URLSearchParams({ type: "bidder-top-5-year", category: category || "" });
    fetch(`/api/leaderboards?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`bidder-top-5-year returned ${res.status}: ${await res.text()}`);
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
