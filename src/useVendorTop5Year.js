import { useEffect, useState } from "react";

// TOP VENDORS — 5-YEAR BID VALUE (executive cleanup task) — a fixed,
// unfiltered reference table, fetched ONCE per Vendor Analytics mount
// (empty dependency array), never on every Store/Category/date-range
// filter change — it's a standing "hall of fame" view, not a filtered one
// (see api/leaderboards.js's type=vendor-top-5-year comment for why).
export function useVendorTop5Year() {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboards?type=vendor-top-5-year")
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
  }, []);

  return state;
}
