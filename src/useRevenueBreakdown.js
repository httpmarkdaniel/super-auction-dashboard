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

// Real, warehouse-backed Revenue Breakdown — one deduped row per
// (auction_number, lot_number), settled (Paid/Released) only, from
// api/revenue-breakdown.js. No category filter (this tab isn't coupled to
// Overview's category selector — see api/revenue-breakdown.js's header
// comment). "All Time" is handled the same honest way as Full Auction
// Detail: no fetch, no stale data, an explicit unsupported state — the
// same unbounded-scan cost problem applies here since this also scans
// xv3.mart_auction_vendor_analysis without a bounded date range.
export function useRevenueBreakdown(store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null, unsupported: false });

  const inputsRef = useRef({ store, dateRangeKey });

  useEffect(() => {
    let cancelled = false;

    const inputsChanged =
      inputsRef.current.store !== store || inputsRef.current.dateRangeKey !== dateRangeKey;
    inputsRef.current = { store, dateRangeKey };

    async function load() {
      const resolved = resolveDateRange(dateRangeKey);
      if (resolved.from == null || resolved.to == null) {
        if (!cancelled) {
          setState({ data: null, loading: false, error: null, unsupported: true });
        }
        return;
      }

      setState((s) =>
        inputsChanged || !s.data
          ? { ...s, loading: true, error: null, unsupported: false }
          : { ...s, error: null, unsupported: false }
      );

      try {
        const { from, to } = resolved;
        const storeParam = store === ALL_STORES ? undefined : store;
        const result = await fetchJson("/api/revenue-breakdown", { from, to, store: storeParam });

        if (cancelled) return;
        setState({ data: result.rows ?? [], loading: false, error: null, unsupported: false });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ data: s.data, loading: false, error: err.message, unsupported: false }));
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
