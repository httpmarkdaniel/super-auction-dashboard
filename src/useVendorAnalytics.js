import { useEffect, useState } from "react";
import { resolveDateRange } from "./utils/dateRange";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    .toString()
    .replace(/\+/g, "%20");
  return fetch(`${path}?${qs}`).then(async (res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${await res.text()}`);
    return res.json();
  });
}

// Vendor Analytics tab — fully dynamic to the selected Date/Store/Category
// filters (PART 25 of this task). Reuses /api/leaderboards' vendor_analytics
// field (one bounded all-lots-per-vendor aggregate — Active/New Vendors,
// Top-5 Concentration, Stuck Inventory, Top 10 Vendors all derive from it
// client-side); only the bucketed time series is genuinely new data,
// served via /api/leaderboards?type=vendor-time-series (folded into the
// existing endpoint, not a new serverless function, to stay within the
// Vercel Hobby-plan function-count limit). One-shot fetch, no polling.
export function useVendorAnalytics(dateRangeKey, store, category, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRangeKey);
        const params = { from, to, store, category };
        const preset = typeof dateRangeKey === "string" ? dateRangeKey : "custom";
        const [leaderboards, vendorAnalytics] = await Promise.all([
          // P1 request architecture cleanup: Vendor Analytics only reads
          // `leaderboards.vendor_analytics` (see VendorAnalyticsView.jsx) —
          // type=vendor-summary runs ONLY the vendor-scoped queries,
          // skipping the entire heavy bidder-identity-bridge chain the
          // default (no-type) response computes for other consumers
          // (Overview/CategoryView/Bidder Analytics) that this tab never
          // uses. Same params/shape otherwise.
          fetchJson("/api/leaderboards", { ...params, type: "vendor-summary" }),
          fetchJson("/api/leaderboards", { ...params, type: "vendor-time-series", preset }),
        ]);
        if (cancelled) return;
        setState({ data: { leaderboards, vendorAnalytics }, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err.message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateRangeKey, store, category, refreshNonce]);

  return state;
}
