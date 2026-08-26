import { useEffect, useRef, useState } from "react";
import { ALL_STORES } from "./mockData";

// Vendor payables is a running balance (a stock, not a per-period flow), so
// this deliberately ignores the date-range picker — same reasoning as
// api/payables.js itself. Store filter still applies. No category param:
// category allocation isn't mathematically safe for this table (see
// api/payables.js and VendorPayablesBreakdown.jsx for the evidence).
export function useVendorPayables(store, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  // Tracks the user's actual selection so a background refresh (refreshNonce
  // alone ticking, from the app-wide 30s auto-refresh timer) can be told
  // apart from a real store change. Only a real change (or the very first
  // load, when there's no data yet) should blank the view into the
  // "Loading…" state; a same-store background refresh should keep the
  // current content visible and swap in fresh data once it arrives — same
  // pattern useCategoryOverview.js already uses for CategoryView.
  const inputsRef = useRef({ store });

  useEffect(() => {
    let cancelled = false;

    const inputsChanged = inputsRef.current.store !== store;
    inputsRef.current = { store };

    async function load() {
      setState((s) =>
        inputsChanged || !s.data ? { ...s, loading: true, error: null } : { ...s, error: null }
      );

      const params = new URLSearchParams(store !== ALL_STORES ? { store } : {})
        .toString()
        .replace(/\+/g, "%20");

      try {
        const res = await fetch(`/api/payables${params ? `?${params}` : ""}`);
        if (!res.ok) throw new Error(`payables returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (err) {
        // A failed background refresh keeps whatever data is already
        // loaded on screen instead of blanking it — only the error/loading
        // flags change. An initial-load failure has no prior data to keep,
        // so this naturally surfaces as data: null too.
        if (!cancelled) {
          setState((s) => ({ data: s.data, loading: false, error: err.message }));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [store, refreshNonce]);

  return state;
}
