// MOCKED — real fetch disconnected, see src/mockApiData.js. Restore fetch() below to re-wire.
import { useState } from "react";
import { MOCK_LIVE_AUCTIONS, MOCK_LOT_DETAIL, MOCK_MARQUEE } from "./mockApiData";

export function useLiveBidding(store) {
  const [state] = useState({ auctions: MOCK_LIVE_AUCTIONS, loading: false, error: null });
  return state;
}

export function useLotDetail(postingId, enabled) {
  const [state] = useState(MOCK_LOT_DETAIL);
  return state;
}

export function useLiveBidCorrection(auctions, refreshNonce = 0) {
  return 0;
}

export function useMarqueeSummary(refreshNonce = 0) {
  const [state] = useState({ ...MOCK_MARQUEE, loading: false, error: null });
  return state;
}

/* Original live implementation:
import { useEffect, useRef, useState } from "react";
import { ALL_STORES } from "./mockData";

// Same +/%20 fix as useLiveOverview.js's fetchJson — URLSearchParams turns
// spaces into "+", which Vercel's query parser doesn't reliably decode back.
//
// timeoutMs matters here specifically: cms.hmr.ph hangs rather than
// fast-failing when an auction_number's lookup doesn't resolve cleanly, and
// with several live auctions fetched at once, one hung request must not
// stall every other auction's data from ever rendering.
function fetchJson(path, params = {}, timeoutMs = 8000) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString().replace(/\+/g, "%20");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(`${path}?${qs}`, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`${path} returned ${res.status}`);
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}

// ClickHouse gives "YYYY-MM-DD HH:MM:SS.mmm" with no timezone marker — this
// dashboard and cms.hmr.ph are both PH-based, so parsing it as the viewer's
// local time (no explicit UTC offset) is the closest match without a
// server-side timezone contract to lean on.
function parseChDateTime(s) {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Live auctions poll slowly (20s) because every auction refresh costs a
// real call to cms.hmr.ph, which caps at 60 requests/min — see the cache
// note in api/live-bid-amounts.js. Bid history and bidder rosters are
// fetched separately, per-lot, only when a card is actually expanded
// (see useLotDetail below), for the same reason.
const POLL_MS = 20000;

export function useLiveBidding(store) {
  const [state, setState] = useState({ auctions: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      try {
        const { auctions } = await fetchJson("/api/live-auctions", store === ALL_STORES ? {} : { store });

        const withLots = await Promise.all(
          auctions.map(async (a) => {
            const starting = parseChDateTime(a.starting_time);
            const ending = parseChDateTime(a.ending_time);
            const now = Date.now();
            const totalDurationSec = starting && ending ? Math.max(1, (ending - starting) / 1000) : null;
            const closesInSec = ending ? Math.max(0, (ending - now) / 1000) : null;

            let lots = [];
            try {
              const res = await fetchJson("/api/live-bid-amounts", { auction_number: a.auction_number });
              lots = (res.lots || []).map((l) => ({
                key: `${a.auction_number}::${l.posting_id}`,
                postingId: l.posting_id,
                lotNumber: l.lot_number,
                item: l.name || `Lot ${l.lot_number}`,
                currentBid: l.current_bid == null ? null : Number(l.current_bid),
                startingBid: l.starting_amount == null ? null : Number(l.starting_amount),
                closesInSec,
                totalDurationSec,
              }));
            } catch {
              // One auction's bid-amounts call failing (e.g. cms.hmr.ph rate
              // limit) shouldn't blank out every other live auction.
              lots = [];
            }

            return {
              auctionNumber: a.auction_number,
              store: a.store_name,
              auctionType: a.category,
              closesInSec,
              lots,
            };
          })
        );

        if (!cancelled) setState({ auctions: withLots, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [store]);

  return state;
}

// Bid history + bidder roster for one lot, fetched only while `enabled` is
// true — kept out of the main poll loop so viewing a card's detail doesn't
// multiply the cms.hmr.ph request count by every lot on screen.
export function useLotDetail(postingId, enabled) {
  const [state, setState] = useState({ bids: null, bidsError: null, bidders: null, biddersError: null, loading: false });
  const lastFetched = useRef(null);

  useEffect(() => {
    if (!enabled || !postingId || lastFetched.current === postingId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    // Independent, not Promise.all — bid-history and bidders are two
    // separate cms.hmr.ph endpoints with their own failure modes, so one
    // going down (as bid-history has) shouldn't hide the other's data.
    Promise.allSettled([
      fetchJson("/api/live-bid-history", { posting: postingId }),
      fetchJson("/api/live-bidders", { posting: postingId }),
    ]).then(([historyResult, biddersResult]) => {
      if (cancelled) return;
      lastFetched.current = postingId;
      setState({
        bids:
          historyResult.status === "fulfilled"
            ? (historyResult.value.bids || []).map((b) => ({
                bidderNumber: b.bidder_number,
                amount: Number(b.bid_amount),
                timestamp: new Date(b.created_at.replace(" ", "T")).getTime(),
              }))
            : null,
        bidsError: historyResult.status === "rejected" ? historyResult.reason.message : null,
        bidders:
          biddersResult.status === "fulfilled"
            ? (biddersResult.value.bidders || []).map((b) => ({
                bidderNumber: b.bidder_number,
                name: `${b.customer_firstname} ${b.customer_lastname}`.trim(),
              }))
            : null,
        biddersError: biddersResult.status === "rejected" ? biddersResult.reason.message : null,
        loading: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [postingId, enabled]);

  return state;
}

// Corrects ClickHouse's own total_bid_amount against cms.hmr.ph's real
// current_bid, for every auction in scope — not just ones ClickHouse still
// calls "live". ClickHouse's figure can be stale or simply never populated
// for a given auction regardless of whether it's still open (cms.hmr.ph
// answers for ended auctions too, confirmed directly), so every auction
// gets a shot at being corrected. Deliberately deferred to a second pass
// rather than done server-side (as overview.js and store-detail.js used
// to) — cms.hmr.ph hangs/500s often enough that waiting on it there held
// the *entire* page behind it, forcing a long fake-looking mock-data flash
// while it resolved. Returns a delta to add to the base total, 0 until
// every auction has resolved (or failed — a failed one just contributes 0,
// keeping the base ClickHouse figure for that auction rather than blocking
// the others).
export function useLiveBidCorrection(auctions, refreshNonce = 0) {
  const [delta, setDelta] = useState(0);
  const key = (auctions || []).map((a) => a.auction_number).join(",");

  useEffect(() => {
    if (!auctions || auctions.length === 0) {
      setDelta(0);
      return;
    }
    let cancelled = false;

    Promise.all(
      auctions.map(async (a) => {
        try {
          const res = await fetchJson("/api/live-bid-amounts", { auction_number: a.auction_number });
          const liveSum = (res.lots || []).reduce(
            (s, l) => s + (l.current_bid == null ? 0 : Number(l.current_bid)),
            0
          );
          return liveSum - Number(a.total_bid_amount || 0);
        } catch {
          return 0;
        }
      })
    ).then((deltas) => {
      if (!cancelled) setDelta(deltas.reduce((sum, d) => sum + d, 0));
    });

    return () => {
      cancelled = true;
    };
    // key alone would miss re-runs on refresh — the auction_number set barely
    // ever changes within a day, but current_bid does, every refresh cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshNonce]);

  return delta;
}

// Topbar marquee poll — deliberately ClickHouse-only (no cms.hmr.ph calls)
// so the always-on ticker never competes with the Online Bidding tab for
// cms.hmr.ph's 60 req/min cap. "Sold today" is fixed to the calendar day
// regardless of the Topbar's own date-range picker, since a live-status
// ticker showing "Last 30 Days" would be misleading. Always company-wide
// (no store param) per how this ticker is scoped.
const SUMMARY_POLL_MS = 30000;
const ENDING_SOON_THRESHOLD_SEC = 3600;

function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function useMarqueeSummary(refreshNonce = 0) {
  const [state, setState] = useState({
    baseSoldToday: 0,
    todaysAuctions: [],
    endingTodayCount: 0,
    endingSoon: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [overview, liveRes] = await Promise.all([
          fetchJson("/api/overview", { from: today, to: today }),
          fetchJson("/api/live-auctions", {}),
        ]);

        const now = new Date();
        const live = (liveRes.auctions || []).map((a) => {
          const ending = parseChDateTime(a.ending_time);
          return {
            auctionNumber: a.auction_number,
            store: a.store_name,
            ending,
            closesInSec: ending ? Math.max(0, (ending - now) / 1000) : null,
          };
        });

        const endingTodayCount = live.filter((a) => a.ending && isSameCalendarDay(a.ending, now)).length;
        const endingSoon = live
          .filter((a) => a.closesInSec != null && a.closesInSec <= ENDING_SOON_THRESHOLD_SEC)
          .sort((a, b) => a.closesInSec - b.closesInSec);

        if (!cancelled) {
          setState({
            baseSoldToday: Number(overview.total_bid_amount) || 0,
            todaysAuctions: overview.auctions || [],
            endingTodayCount,
            endingSoon,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
      if (!cancelled) timer = setTimeout(tick, SUMMARY_POLL_MS);
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshNonce]);

  // Same staleness problem as the main Overview page: ClickHouse's own
  // total_bid_amount snapshot can sit at 0 for an auction that already has
  // real bids in cms.hmr.ph (confirmed directly — auction 5411MS showed
  // ₱4,000+ in live current_bid values while ClickHouse still reported 0),
  // so "sold today" needs the same client-side correction useLiveOverview's
  // consumer already applies, not just the raw ClickHouse figure.
  const correctionDelta = useLiveBidCorrection(state.todaysAuctions, refreshNonce);

  return {
    soldToday: state.baseSoldToday + correctionDelta,
    endingTodayCount: state.endingTodayCount,
    endingSoon: state.endingSoon,
    loading: state.loading,
    error: state.error,
  };
}
*/
