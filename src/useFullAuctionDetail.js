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
  const [state, setState] = useState({ data: null, loading: true, error: null, unsupported: false });

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
      // resolveDateRange("all") deliberately returns from:null/to:null as an
      // "All Time" sentinel. Two real, confirmed problems with sending that
      // straight through: (1) neither api/auction-detail.js nor
      // api/leaderboards.js accept a missing/empty date range (the former
      // errors trying to parse an empty-string datetime in ClickHouse, the
      // latter explicitly 400s on a missing from/to); (2) substituting a
      // wide concrete fallback range instead doesn't actually help — tested
      // directly against the real warehouse, an unbounded scan across
      // xv3.mart_auction_vendor_analysis's 1M+ rows (joined against
      // postings/payments/customers/cms tables for identity resolution) did
      // not return within 5 minutes. Rather than trade a fast error for a
      // multi-minute hang, silently narrow "All Time" to some other bounded
      // range while still labeling it "All Time", or touch either backend
      // file's validation, this is treated as an explicit, honest,
      // Full-Auction-Detail-only limitation: neither fetch ever fires, and
      // any previously loaded rows from a real range are intentionally
      // cleared rather than left on screen mislabeled as "All Time". This is
      // a genuinely different state from an ordinary background-refresh
      // failure on a VALID range (handled in the catch block below), where
      // preserving the last good data is still correct — `unsupported` is
      // the flag that tells FullAuctionDetailView.jsx which case it is.
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

        setState({ data: { lots: auctionResult.rows ?? [], bidderActivity }, loading: false, error: null, unsupported: false });
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
