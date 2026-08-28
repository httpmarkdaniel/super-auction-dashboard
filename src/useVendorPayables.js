import { useEffect, useRef, useState } from "react";
import { ALL_STORES } from "./mockData";

// Vendor payables is a running balance (a stock, not a per-period flow), so
// this deliberately ignores the date-range picker — same reasoning as
// api/payables.js itself. Store filter still applies. No category param:
// category allocation isn't mathematically safe for this table (see
// api/payables.js and VendorPayablesBreakdown.jsx for the evidence).
//
// detail: { q, sortKey, sortDir, page, pageSize } — the Full Detail
// table's search/sort/pagination state (Architecture Phase 2A). Only a
// real STORE change (or the very first load) blanks the view into the
// full "Loading…" state; a refreshNonce tick or a detail-table
// search/sort/page change is treated as a background refresh — current
// content stays visible until the new page arrives, same pattern as
// useCategoryOverview.js.
export function useVendorPayables(store, refreshNonce = 0, detail = {}) {
  const { q = "", sortKey = "amount", sortDir = "desc", page = 0, pageSize = 50 } = detail;
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const inputsRef = useRef({ store });

  useEffect(() => {
    let cancelled = false;

    const storeChanged = inputsRef.current.store !== store;
    inputsRef.current = { store };

    async function load() {
      setState((s) =>
        storeChanged || !s.data ? { ...s, loading: true, error: null } : { ...s, error: null }
      );

      const params = new URLSearchParams({
        ...(store !== ALL_STORES ? { store } : {}),
        ...(q ? { q } : {}),
        sortKey,
        sortDir,
        page: String(page),
        pageSize: String(pageSize),
      })
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
  }, [store, refreshNonce, q, sortKey, sortDir, page, pageSize]);

  return state;
}
