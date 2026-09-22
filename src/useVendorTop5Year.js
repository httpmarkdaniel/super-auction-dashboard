import { useEffect, useState } from "react";

// TOP VENDORS — 5-YEAR BID VALUE — a rolling 5-calendar-year reference
// table, still independent of the dashboard's date-range/Store filters
// (see api/leaderboards.js's type=vendor-top-5-year comment). `categories`
// is an array — top-level categories (including "Trucks", its own
// top-level category as of 2026-09-22) and Vehicles-and-Automotive
// subcategories (Motorcycles/Cars) can be freely mixed, e.g. ["Trucks",
// "Equipment and Industrial"] — sent as a single comma-joined query
// param, matching the API's own parsing.
export function useVendorTop5Year(categories = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const categoriesKey = categories.join(",");

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const qs = new URLSearchParams({ type: "vendor-top-5-year", categories: categoriesKey });
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
  }, [categoriesKey]);

  return state;
}
