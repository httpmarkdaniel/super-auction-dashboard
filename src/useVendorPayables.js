import { useEffect, useState } from "react";
import { ALL_STORES } from "./mockData";

// Vendor payables is a running balance (a stock, not a per-period flow), so
// this deliberately ignores the date-range picker — same reasoning as
// api/payables.js itself. Store filter still applies. No category param:
// category allocation isn't mathematically safe for this table (see
// api/payables.js and VendorPayablesBreakdown.jsx for the evidence).
export function useVendorPayables(store, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    const params = new URLSearchParams(store !== ALL_STORES ? { store } : {})
      .toString()
      .replace(/\+/g, "%20");
    fetch(`/api/payables${params ? `?${params}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error(`payables returned ${res.status}`);
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
