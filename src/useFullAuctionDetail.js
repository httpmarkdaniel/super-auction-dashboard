import { useEffect, useRef, useState } from "react";
import { ALL_STORES } from "./mockData";
import { resolveDateRange } from "./utils/dateRange";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  )
    .toString()
    .replace(/\+/g, "%20");

  return fetch(`${path}?${qs}`).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${path} returned ${res.status}: ${text}`);
    }
    return res.json();
  });
}

// Real, warehouse-backed Full Auction Detail — one deduped row per
// (auction_number, lot_number) from api/auction-detail.js, covering every
// auction whose starting_time falls in the selected date range and store.
// No category filter (this tab isn't coupled to Overview's category
// selector — see api/auction-detail.js's header comment).
export function useFullAuctionDetail(store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  // Same inputs-changed pattern as useCategoryOverview.js/useVendorPayables.js:
  // only a real store/date-range change (or the very first load) blanks the
  // view into "Loading…"; a same-input background refresh (refreshNonce
  // alone ticking) keeps the current rows visible and swaps in fresh data.
  const inputsRef = useRef({ store, dateRangeKey });

  useEffect(() => {
    let cancelled = false;

    const inputsChanged =
      inputsRef.current.store !== store || inputsRef.current.dateRangeKey !== dateRangeKey;
    inputsRef.current = { store, dateRangeKey };

    async function load() {
      setState((s) =>
        inputsChanged || !s.data ? { ...s, loading: true, error: null } : { ...s, error: null }
      );

      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        const storeParam = store === ALL_STORES ? undefined : store;
        const result = await fetchJson("/api/auction-detail", { from, to, store: storeParam });

        if (cancelled) return;
        setState({ data: result.rows ?? [], loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ data: s.data, loading: false, error: err.message }));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [store, dateRangeKey, refreshNonce]);

  return state;
}
