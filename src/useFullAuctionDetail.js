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
//
// Bidder activity per auction is NOT computed here — it's fetched from
// /api/leaderboards, which already has both pieces, live and unmodified:
//   - perAuctionBiddingActivity: PARTICIPATING bidders (every real bid
//     event from cms.mart_cms_bid_history_report, not just winners),
//     already split New/Returning with both counts and bid_amount.
//   - perAuctionComposition: WINNING bidders (settled Paid/Released lots,
//     via the canonical BIDDER_IDENTITY_CTES bridge), already split
//     New/Returning with both counts and bid_amount, plus an
//     "unclassified" (unresolved identity) bucket.
// Reusing these avoids building a second identity bridge or duplicating
// leaderboards.js's already-validated bidder logic. auction_number is the
// join key back to api/auction-detail.js's rows.
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

        const [auctionResult, leaderboardsResult] = await Promise.all([
          fetchJson("/api/auction-detail", { from, to, store: storeParam }),
          fetchJson("/api/leaderboards", { from, to, store: storeParam }),
        ]);

        if (cancelled) return;

        const bidderActivity = {};
        for (const row of leaderboardsResult.perAuctionBiddingActivity ?? []) {
          bidderActivity[row.auction_number] = {
            ...(bidderActivity[row.auction_number] ?? {}),
            participating: {
              total: row.participating_bidders,
              new: row.participating_new_bidders,
              returning: row.participating_returning_bidders,
              totalAmount: row.participating_bid_amount,
              newAmount: row.participating_new_bid_amount,
              returningAmount: row.participating_returning_bid_amount,
            },
          };
        }
        for (const row of leaderboardsResult.perAuctionComposition ?? []) {
          const newAmount = Number(row.new_bidders_bid_amount) || 0;
          const returningAmount = Number(row.returning_bidders_bid_amount) || 0;
          bidderActivity[row.auction_number] = {
            ...(bidderActivity[row.auction_number] ?? {}),
            winning: {
              total: (Number(row.new_bidders) || 0) + (Number(row.returning_bidders) || 0),
              new: row.new_bidders,
              returning: row.returning_bidders,
              // new + returning, not the raw settled_bid_amount — that
              // total also includes the unclassified bucket below, which
              // must never be silently folded into either group.
              totalAmount: newAmount + returningAmount,
              newAmount,
              returningAmount,
              unresolvedLots: row.unclassified_lots,
              unresolvedAmount: row.unclassified_bid_amount,
            },
          };
        }

        setState({ data: { lots: auctionResult.rows ?? [], bidderActivity }, loading: false, error: null });
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
