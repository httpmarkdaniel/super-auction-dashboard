import { useEffect, useState } from "react";
import { onTabVisible } from "./utils/visibility";

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

// 20s poll — reused from this codebase's own prior (unbuilt) design intent
// for this exact section (see the commented-out original POLL_MS in
// useLiveBidding.js): every refresh costs a real cms.hmr.ph call, which
// caps at 60 requests/min, so a tighter interval risks exhausting that
// budget once more than a couple of dashboard sessions are open. Only one
// of the two hooks below is ever active at a time in practice (the parent
// view unmounts whichever level isn't showing), so this never compounds
// into two simultaneous 20s loops.
const POLL_MS = 20000;

// Level 1 — auction events currently active under category='Online
// Bidding'. Deliberately takes no date-range param: an auction's own
// [starting_time, ending_time] window is what defines this population, not
// the Overview date picker (see api/live-auctions.js for the full
// reasoning). Store filter still applies.
export function useLiveAuctionEvents(store) {
  const [state, setState] = useState({ auctions: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer;

    // Vercel P0 usage fix: a backgrounded/minimized tab skips the fetch
    // and does NOT reschedule (timer stays null) — this is live
    // operational data, so onTabVisible below resumes it immediately
    // (not on the next 20s tick) the moment the tab is foregrounded again.
    async function tick() {
      if (document.hidden) {
        timer = null;
        return;
      }
      try {
        const { auctions } = await fetchJson("/api/live-auctions", { store });
        if (!cancelled) setState({ auctions: auctions ?? [], loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    tick();

    const unsubscribe = onTabVisible(() => {
      // Only resume here if tick() actually paused (no timer pending) —
      // otherwise the normal schedule is already running and this would
      // fire a duplicate fetch.
      if (!timer) tick();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [store]);

  return state;
}

// Level 2 — lots + bid timeline for ONE auction, only polls while an
// auction is actually selected (auctionNumber is null when Level 1 is
// showing, so this hook is idle then).
export function useAuctionLotDetail(auctionNumber) {
  const [state, setState] = useState({ auction: null, lots: [], loading: true, error: null });

  useEffect(() => {
    if (!auctionNumber) {
      setState({ auction: null, lots: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    let timer;

    // Vercel P0 usage fix: see useLiveAuctionEvents above for the
    // pause-while-hidden / resume-immediately-on-visible pattern.
    async function tick() {
      if (document.hidden) {
        timer = null;
        return;
      }
      try {
        const data = await fetchJson("/api/live-auction-detail", { auction_number: auctionNumber });
        if (!cancelled) setState({ auction: data.auction, lots: data.lots ?? [], loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    tick();

    const unsubscribe = onTabVisible(() => {
      if (!timer) tick();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [auctionNumber]);

  return state;
}
