import { manilaToEpochMs } from "./manilaTime";

// Never display a raw email as a bidder's identity (see the Active
// Auction Timeline activity-events task) — this endpoint's own
// bid_events.bidder already resolves a real display name when one
// exists, falling back to the bidder's email only when no name is on
// record. Treat that fallback as unresolved here rather than showing the
// email.
function displayBidderName(raw) {
  if (!raw || typeof raw !== "string") return "Unknown Bidder";
  return raw.includes("@") ? "Unknown Bidder" : raw;
}

function clampPct(v) {
  return Math.min(100, Math.max(0, v));
}

// Builds the auction-wide ACTIVITY-EVENT layer for the Active Auction
// Timeline from data ALREADY loaded via /api/live-auction-detail (Online
// Bidding's "Show Detailed Bidding Per Lot" fetch) — zero extra requests,
// zero new backend queries. Combines every lot's own bid_events into one
// chronological, auction-wide stream and classifies only what this data
// actually supports:
//   - FIRST BID: the earliest bid across the whole auction. Always exactly
//     one, always shown individually (`pinned`).
//   - NEW LEADER: a bid the server already flagged was_winning (its own
//     running-max walk per lot — never re-derived here) whose BIDDER
//     differs from whoever previously held that lot's lead. A lot where
//     the same person keeps raising their own standing bid is not a
//     leadership change and stays an ordinary bid.
//     Validated against real production Online Bidding auctions: in
//     several live lots, DIFFERENT bidders genuinely outbid each other on
//     nearly every single recorded bid, so "new leader" is often NOT rare
//     — one busy real auction produced ~200 leadership changes out of 208
//     bids. Marking every one as a permanently unclusterable "significant"
//     event would itself become the unreadable wall of markers section 3
//     forbids, so NEW LEADER events go into the same clusterable pool as
//     ordinary bids (see `clusterable` below) — a cluster is flagged
//     `hasLeaderChange` when it contains one, so genuine leadership
//     activity still reads differently from plain repeat-bidding, without
//     each individual change demanding its own marker on a dense lot.
//   - RESERVE MET: the first bid in a lot to reach that lot's own
//     reserved_price (only for lots that have one, i.e. reserved_price > 0).
//     Rare by construction (one-time per lot) — always `pinned`.
//   - CURRENT/LATEST LEADING BID: the single most recent bid across the
//     whole auction. Always exactly one, always `pinned`.
// Auction extension is NOT implemented — no field in this payload
// represents it (no extended_at/extension flag exists anywhere in the
// live-auction-detail or live-auctions responses), so it is never
// fabricated.
export function buildAuctionActivityEvents({ lots, timelineStart, endingTime }) {
  const startMs = manilaToEpochMs(timelineStart);
  const endMs = manilaToEpochMs(endingTime);
  const span = startMs != null && endMs != null && endMs > startMs ? endMs - startMs : null;
  if (!span || !Array.isArray(lots) || lots.length === 0) {
    return { pinned: [], clusterable: [] };
  }

  const all = [];
  for (const lot of lots) {
    const events = lot.bid_events || [];
    for (const e of events) {
      all.push({
        lotNumber: lot.lot_number,
        lotName: lot.name,
        reservedPrice: Number(lot.reserved_price) || 0,
        timestamp: e.timestamp,
        bidAmount: Number(e.bid_amount) || 0,
        bidder: displayBidderName(e.bidder),
        newOrReturning: e.new_or_returning,
        wasWinning: !!e.was_winning,
        types: [],
      });
    }
  }
  if (all.length === 0) return { pinned: [], clusterable: [] };

  all.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  const pointFor = (ts) => {
    const ms = manilaToEpochMs(ts);
    return ms == null ? 0 : clampPct(((ms - startMs) / span) * 100);
  };

  const lastLeaderByLot = new Map();
  const reserveMetLots = new Set();
  let firstBidMarked = false;

  all.forEach((e) => {
    e.pct = pointFor(e.timestamp);

    if (!firstBidMarked) {
      e.types.push("first-bid");
      firstBidMarked = true;
    }

    if (e.wasWinning) {
      const previousLeader = lastLeaderByLot.get(e.lotNumber) || null;
      const isLeadershipChange = !previousLeader || previousLeader.bidder !== e.bidder;
      if (isLeadershipChange) {
        e.previousLeader = previousLeader;
        e.types.push("new-leader");
      }
      lastLeaderByLot.set(e.lotNumber, { bidder: e.bidder, bidAmount: e.bidAmount, timestamp: e.timestamp });
    }

    if (e.reservedPrice > 0 && e.bidAmount >= e.reservedPrice && !reserveMetLots.has(e.lotNumber)) {
      e.types.push("reserve-met");
      reserveMetLots.add(e.lotNumber);
    }
  });

  // The single most recent bid across the whole auction is always
  // significant, whether or not it already qualified above.
  all[all.length - 1].types.push("current-leading");

  const ALWAYS_PINNED = new Set(["first-bid", "current-leading", "reserve-met"]);
  const pinned = all.filter((e) => e.types.some((t) => ALWAYS_PINNED.has(t)));
  const clusterable = all.filter((e) => !e.types.some((t) => ALWAYS_PINNED.has(t)));

  return { pinned, clusterable };
}

// Priority order for an event's PRIMARY classification when it qualifies
// for more than one (e.g. the very first bid can also be its lot's first
// was_winning bid) — matches the Active Auction Timeline's stated marker
// priority: First Bid > New Leader > Current/Latest Leading Bid > Reserve
// Met. The tooltip still surfaces every true fact, this only decides which
// one governs the marker's visual style.
const PRIMARY_ORDER = ["first-bid", "new-leader", "current-leading", "reserve-met"];
export function primaryEventType(event) {
  for (const t of PRIMARY_ORDER) {
    if (event.types.includes(t)) return t;
  }
  return "bid";
}

// Groups markers that land close together on the shared 0-100% track into
// compact cluster markers — RENDERING ONLY. The underlying events are
// untouched and still fully present on the cluster's own `events` array;
// nothing here mutates or discards data. Threshold is a percentage of the
// track's own span, not a measured pixel distance, so it scales with any
// card width without a DOM measurement. A cluster is flagged
// `hasLeaderChange` when at least one of its events is a genuine
// leadership change, so dense-but-meaningful activity still reads
// differently from dense ordinary repeat-bidding even once grouped.
export function clusterEvents(events, thresholdPct = 1.5) {
  if (!events || events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.pct - b.pct);
  const clusters = [];
  let current = null;

  for (const e of sorted) {
    if (current && e.pct - current.anchorPct <= thresholdPct) {
      current.events.push(e);
      current.anchorPct = current.events.reduce((sum, x) => sum + x.pct, 0) / current.events.length;
      current.hasLeaderChange = current.hasLeaderChange || e.types.includes("new-leader");
    } else {
      current = { anchorPct: e.pct, events: [e], hasLeaderChange: e.types.includes("new-leader") };
      clusters.push(current);
    }
  }
  return clusters;
}
