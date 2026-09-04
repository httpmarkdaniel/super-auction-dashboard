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

// VENDOR SUMMARY — moved here from Auction Result (see api/leaderboards.js's
// type=vendor-financial-summary comment). Deliberately its OWN independent
// hook/fetch with its own Branch/Vendor/Auction Number/From/To/BDM filter
// state — never tied to the main Vendor Analytics tab's Store/Category/
// date-range state, and never refetched when THAT changes (or vice versa).
// One request per own filter change / manual refresh; no polling.
export function useVendorFinancialSummary(filters, refreshNonce = 0) {
  const { from, to, branch, vendor, auctionNumber, bdm } = filters;
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const result = await fetchJson("/api/leaderboards", {
          type: "vendor-financial-summary",
          from,
          to,
          branch,
          vendor,
          auctionNumber,
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
  }, [from, to, branch, vendor, auctionNumber, bdm, refreshNonce]);

  return state;
}
