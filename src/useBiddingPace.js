import { useEffect, useRef, useState } from "react";
import { ALL_STORES } from "./mockData";
import { resolveDateRange } from "./utils/dateRange";
import { mapHourlyRows } from "./utils/hourlyBidderDetail";

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

// Real, warehouse-backed Bidding Pace — hourly bid ACTIVITY plus a
// per-hour Participating/Winning bidder breakdown, both from the ONE
// authoritative /api/bidding-pace endpoint (src/utils/hourlyBidderDetail.js
// does the shared row->UI mapping, reused unmodified by Overview). The
// permanent Participating/Winning cards this tab used to show have been
// removed — that breakdown now lives entirely in the hourly chart's hover
// tooltip (see BiddingPaceView.jsx / HourlyTrend.jsx), so this hook no
// longer needs /api/leaderboards's global composition fields at all.
//
// No category filter (this tab isn't coupled to Overview's category
// selector — deliberately decoupled from the previous accidental coupling,
// where BiddingPaceView read the shared `overview` prop and so silently
// inherited whatever category Overview had selected).
export function useBiddingPace(store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null, unsupported: false });

  const inputsRef = useRef({ store, dateRangeKey });

  useEffect(() => {
    let cancelled = false;

    const inputsChanged =
      inputsRef.current.store !== store || inputsRef.current.dateRangeKey !== dateRangeKey;
    inputsRef.current = { store, dateRangeKey };

    async function load() {
      const resolved = resolveDateRange(dateRangeKey);
      // "All Time" -> from:null/to:null sentinel. Same honest, no-fetch
      // unsupported state already established for Full Auction Detail and
      // Revenue Breakdown, for the same reason: an unbounded scan of
      // cms.mart_cms_bid_history_report/xv3.mart_auction_vendor_analysis
      // isn't a fast query, and this tab has no need to be the first place
      // that finds out the hard way.
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

        const paceResult = await fetchJson("/api/bidding-pace", { from, to, store: storeParam });

        if (cancelled) return;

        const { hourlyTrend, hourlyDetail } = mapHourlyRows(paceResult.hourly);
        const unattributed = paceResult.winning_unattributed ?? { lots: 0, amount: 0 };

        setState({
          data: {
            hourlyTrend,
            hourlyDetail,
            winningUnattributed: {
              lots: Number(unattributed.lots) || 0,
              amount: Number(unattributed.amount) || 0,
            },
          },
          loading: false,
          error: null,
          unsupported: false,
        });
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
