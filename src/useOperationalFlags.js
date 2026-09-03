import { useEffect, useState } from "react";
import { resolveDateRange } from "./utils/dateRange";
import { computeOperationalFlags } from "./utils/operationalFlags";

function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    .toString()
    .replace(/\+/g, "%20");
  return fetch(`${path}?${qs}`).then(async (res) => {
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${await res.text()}`);
    return res.json();
  });
}

// OPERATIONAL FLAGS — reuses the SAME two summary payloads Bidder/Vendor
// Analytics already fetch (/api/overview, /api/leaderboards) plus one new
// lightweight aggregate (/api/overview?type=operational-flags — see that
// handler's comment). Three requests, all in parallel, one fetch per
// tab-activation/filter-change/explicit-refresh — NEVER on a timer (same
// fix already applied to Bidder/Vendor Analytics: `refreshNonce` here must
// be the analytics-only manual nonce from App.jsx, not the automatic
// 30s-tick one, or this tab will silently reload on its own again).
export function useOperationalFlags(dateRange, store, category, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const { from, to } = resolveDateRange(dateRange);
        const params = { from, to, store, category };
        const [overview, leaderboards, opsFlags] = await Promise.all([
          fetchJson("/api/overview", params),
          fetchJson("/api/leaderboards", params),
          fetchJson("/api/overview", { ...params, type: "operational-flags" }),
        ]);
        if (cancelled) return;
        const flags = computeOperationalFlags({ overview, leaderboards, opsFlags });
        setState({ data: { flags, opsFlags }, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err.message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateRange, store, category, refreshNonce]);

  return state;
}
