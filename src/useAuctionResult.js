import { useEffect, useState } from "react";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    .toString()
    .replace(/\+/g, "%20");
  return fetch(`${path}?${qs}`).then(async (res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${await res.text()}`);
    return res.json();
  });
}

// Auction Result's own filter reference lists (Branch/Vendor/Status/BDM) —
// fetched ONCE per Auction Result mount, never on every filter change (see
// api/overview.js's type=auction-result-filters comment for why these are
// global/all-time rather than scoped to the selected End Date).
export function useAuctionResultFilters() {
  const [state, setState] = useState({ filters: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchJson("/api/overview", { type: "auction-result-filters" })
      .then((result) => {
        if (!cancelled) setState({ filters: result, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ filters: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// Auction Result's report data — one HTTP request to
// /api/overview?type=auction-result per filter change (which itself runs
// one grouped + one totals ClickHouse query — see that handler's own
// comment). Fetches only on mount, filter change, or manual refresh — no
// polling interval. No dependency on the dashboard's global from/to/
// store/category state any more; this tab owns its own filter set
// entirely (endDate/branch/vendor/auctionNumber/status/bdm).
export function useAuctionResult(filters, refreshNonce = 0) {
  const { endDate, branch, vendor, auctionNumber, status, bdm } = filters;
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const result = await fetchJson("/api/overview", {
          type: "auction-result",
          endDate,
          branch,
          vendor,
          auctionNumber,
          status,
          bdm,
        });
        if (cancelled) return;
        setState({ data: result, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err.message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [endDate, branch, vendor, auctionNumber, status, bdm, refreshNonce]);

  return state;
}

// On-demand detailed export dataset — NOT a hook, NOT fetched on normal
// page load or on any filter change. Called imperatively exactly once,
// only when the user clicks Export Excel/PDF (see AuctionResultView.jsx),
// against /api/overview?type=auction-result-export (same filters as the
// on-screen tables, via the SAME buildAuctionResultFilter() server-side —
// see that handler's own comment). One request per export click; the
// backend runs its own bounded grouped + totals ClickHouse queries inside
// it — never a request per row/column/vendor/auction.
export function fetchAuctionResultExportData(filters) {
  const { endDate, branch, vendor, auctionNumber, status, bdm } = filters;
  return fetchJson("/api/overview", {
    type: "auction-result-export",
    endDate,
    branch,
    vendor,
    auctionNumber,
    status,
    bdm,
  });
}
