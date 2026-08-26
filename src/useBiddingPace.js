import { useEffect, useRef, useState } from "react";
import { ALL_STORES } from "./mockData";
import { resolveDateRange } from "./utils/dateRange";

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
});

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

// Real, warehouse-backed Bidding Pace — hourly bid ACTIVITY from
// api/bidding-pace.js (an isolated, lighter duplicate of Overview's own
// hourly query — see that file's header comment), plus a global
// Participating/Winning bidder breakdown reused UNMODIFIED from
// /api/leaderboards's `bidding_activity_composition` (participating,
// bid-history activity) and `composition` (winning, settled Paid/Released)
// fields — no new bidder identity logic anywhere in this file.
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

        const [paceResult, leaderboardsResult] = await Promise.all([
          fetchJson("/api/bidding-pace", { from, to, store: storeParam }),
          fetchJson("/api/leaderboards", { from, to, store: storeParam }),
        ]);

        if (cancelled) return;

        const hourlyRows = (paceResult.hourly ?? []).filter((h) => h.hour != null);
        const hourlyTrend = hourlyRows.map((h) => ({ hour: HOUR_LABELS[h.hour], bidAmount: Number(h.bid_amount) || 0 }));

        const participatingRaw = leaderboardsResult.bidding_activity_composition ?? null;
        const participating = participatingRaw && {
          new: Number(participatingRaw.new_bidders) || 0,
          returning: Number(participatingRaw.returning_bidders) || 0,
          newAmount: Number(participatingRaw.new_bidders_bid_amount) || 0,
          returningAmount: Number(participatingRaw.returning_bidders_bid_amount) || 0,
        };
        const participatingData = participating && {
          ...participating,
          total: participating.new + participating.returning,
          totalAmount: participating.newAmount + participating.returningAmount,
        };
        // "No data for this population" only when there's genuinely no
        // bid-EVENT data in this scope at all (e.g. a scope containing only
        // Negotiated auctions, which never post through the online bidding
        // system) — signaled by the independent hourly query itself
        // returning zero rows, not by participating.total happening to be
        // 0 (which could also legitimately be true for other reasons,
        // e.g. every bid event in scope missing an email). Never a
        // fabricated zero-looking card.
        const participatingFinal = hourlyTrend.length > 0 ? participatingData : null;

        const winningRaw = leaderboardsResult.composition ?? null;
        const winning = winningRaw && {
          new: Number(winningRaw.new_bidders) || 0,
          returning: Number(winningRaw.returning_bidders) || 0,
          newAmount: Number(winningRaw.new_bidders_bid_amount) || 0,
          returningAmount: Number(winningRaw.returning_bidders_bid_amount) || 0,
          unresolvedAmount: Number(winningRaw.unclassified_bid_amount) || 0,
        };
        const winningFinal = winning && {
          ...winning,
          total: winning.new + winning.returning,
          totalAmount: winning.newAmount + winning.returningAmount,
        };

        setState({
          data: { hourlyTrend, participating: participatingFinal, winning: winningFinal },
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
