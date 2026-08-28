import { createClient } from "@clickhouse/client";
import { getLiveLotsSafe } from "./_liveBids.js";

// Per-lot bid-event cap for the timeline_lots field below — a defensive
// bound only (no currently-active auction sampled during implementation
// came close to it: the busiest real lot had well under 10 events). Always
// keeps that lot's own FIRST event (so an auction-wide "first bid" survives
// truncation even in a hypothetical extreme case) plus its most recent
// events up to the cap, so "current/latest leading bid" also always
// survives.
const MAX_TIMELINE_EVENTS_PER_LOT = 60;

// Same ClickHouse client configuration as api/overview.js.
const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// bidderKeyOf / classify() / the "leading bidder = event whose amount
// matches the authoritative warehouse-latest figure, preferring the most
// recent timestamp among matches" selection rule are the EXACT SAME
// methodology already validated in api/live-auction-detail.js (Level 2) —
// duplicated here (not imported) so Level 2 stays completely untouched,
// applied across every active auction's lots in ONE batched query instead
// of one auction at a time. This is NOT a new bidder identity definition.
function bidderKeyOf(row) {
  const email = (row.email ?? "").trim().toLowerCase();
  if (email) return { key: `email:${email}`, hasEmail: true, email };
  return { key: `bidder_number:${row.bidder_number}`, hasEmail: false, email: null };
}

// Online Bidding Level 1 — the auction-events list. Deliberately NOT scoped
// by Today/7d/30d/Custom: an auction's own [starting_time, ending_time]
// window is what matters here, not when bids happened to be placed (a real
// active auction can span 45+ days). Population is "currently active
// Online Bidding events" — same starting_time<=now<=ending_time predicate
// as the existing Active Auctions KPI, narrowed to category='Online
// Bidding' (verified: not every active auction is Online — 'Live Auction',
// 'Simulcast', and 'Buy Now' are real, distinct categories on the same
// table). Store filter still applies.
//
// Each auction also carries `timeline_lots` — real per-lot bid_events
// (see the TIMELINE_LOTS block below), which the frontend's Active
// Auction Timeline (AuctionProgressBar + src/utils/auctionActivityEvents.js)
// uses to show First Bid / New Leader / Current Leading Bid markers on
// the ALWAYS-VISIBLE card progress bar, not just the expanded per-lot
// detail view — built from bid rows this handler already fetches for
// Participating/Leading, never a second query or a per-auction request.
export default async function handler(req, res) {
  try {
    const { store = "" } = req.query;

    const auctionResult = await client.query({
      query: `
        SELECT
          auction_number,
          any(name) AS auction_name,
          any(store_name) AS auction_store_name,
          min(starting_time) AS auction_starting_time,
          max(ending_time) AS auction_ending_time,
          max(lot_count) AS auction_lot_count

        FROM xv3.mart_auction_productivity_report

        WHERE category = 'Online Bidding'
          AND starting_time <= now()
          AND ending_time >= now()
          AND (
            {store:String} = ''
            OR store_name = {store:String}
          )

        GROUP BY auction_number
        ORDER BY auction_ending_time ASC
      `,
      query_params: { store },
      format: "JSONEachRow",
    });

    const auctionRows = await auctionResult.json();

    if (auctionRows.length === 0) {
      return res.status(200).json({ auctions: [] });
    }

    const auctionNumbers = auctionRows.map((r) => r.auction_number);

    // Warehouse baseline: latest bid per lot (argMax by time) across every
    // lot in these auctions — same "current/standing bid per lot" concept
    // used everywhere else in this codebase (api/overview.js's
    // lot_latest_bid CTE), not a naive sum of bid events.
    const lotLatestResult = await client.query({
      query: `
        SELECT
          auction_number,
          lot_number,
          argMax(bid_amount, bid_created_at) AS latest_bid_amount

        FROM cms.mart_cms_bid_history_report

        WHERE auction_number IN {auctionNumbers:Array(String)}

        GROUP BY auction_number, lot_number
      `,
      query_params: { auctionNumbers },
      format: "JSONEachRow",
    });

    const lotLatestRows = await lotLatestResult.json();
    const lotLatestByAuction = new Map();
    for (const row of lotLatestRows) {
      if (!lotLatestByAuction.has(row.auction_number)) {
        lotLatestByAuction.set(row.auction_number, new Map());
      }
      lotLatestByAuction
        .get(row.auction_number)
        .set(String(row.lot_number), Number(row.latest_bid_amount ?? 0));
    }

    // Full per-event bid history for every lot across every active auction
    // shown, in ONE query (never per lot, never per auction) — the same
    // Participating/Leading source Level 2 uses for a single auction,
    // batched here across the whole list. Ordering matches Level 2's own
    // query for the same tie-break reasoning documented there.
    const bidHistoryResult = await client.query({
      query: `
        SELECT
          auction_number,
          lot_number,
          bid_amount,
          bid_created_at,
          email,
          customer_firstname,
          customer_lastname,
          bidder_number

        FROM cms.mart_cms_bid_history_report

        WHERE auction_number IN {auctionNumbers:Array(String)}
          AND lot_number IS NOT NULL
          AND bid_created_at IS NOT NULL

        ORDER BY auction_number, lot_number, bid_created_at, bid_amount
      `,
      query_params: { auctionNumbers },
      format: "JSONEachRow",
    });
    const bidRows = await bidHistoryResult.json();

    // Global first-ever-bid per email — EXACT same definition already
    // validated for Bidder Composition and Level 2: New/Returning is
    // decided against a boundary, here each auction's own starting_time
    // ("has this person ever bid before THIS auction started").
    const emailKeys = new Set();
    for (const row of bidRows) {
      const { hasEmail, email } = bidderKeyOf(row);
      if (hasEmail) emailKeys.add(email);
    }
    let firstEverByEmail = new Map();
    if (emailKeys.size > 0) {
      const firstEverResult = await client.query({
        query: `
          SELECT
            lowerUTF8(trim(email)) AS bidder_key,
            min(bid_created_at) AS first_ever_bid_at

          FROM cms.mart_cms_bid_history_report

          WHERE email IS NOT NULL
            AND trim(email) != ''
            AND lowerUTF8(trim(email)) IN {emailKeys:Array(String)}

          GROUP BY bidder_key
        `,
        query_params: { emailKeys: [...emailKeys] },
        format: "JSONEachRow",
      });
      const rows = await firstEverResult.json();
      firstEverByEmail = new Map(rows.map((r) => [r.bidder_key, r.first_ever_bid_at]));
    }

    // Group bid rows by auction, then by lot within each auction.
    const rowsByAuction = new Map();
    for (const row of bidRows) {
      if (!rowsByAuction.has(row.auction_number)) rowsByAuction.set(row.auction_number, []);
      rowsByAuction.get(row.auction_number).push(row);
    }

    // Live current_bid, one batched call PER AUCTION (never per lot) — the
    // same call api/live-bid-amounts.js already makes, run in parallel
    // across every auction shown in this list, matching the "one
    // auction-level request, not N+1" requirement. getLiveLotsSafe never
    // throws — a failed auction just falls back to its warehouse figure.
    const liveResults = await Promise.all(
      auctionNumbers.map((auctionNumber) => getLiveLotsSafe(auctionNumber)),
    );

    const auctions = auctionRows.map((row, i) => {
      const live = liveResults[i];
      const warehouseLots = lotLatestByAuction.get(row.auction_number) ?? new Map();
      const auctionStartingTime = row.auction_starting_time;

      function classify(email) {
        const firstEver = firstEverByEmail.get(email);
        if (!firstEver) return "unclassified";
        return firstEver >= auctionStartingTime ? "new" : "returning";
      }

      // Per-lot current bid (live when available, warehouse fallback
      // otherwise) — identical merge logic to before, just also retained
      // per-lot (not just summed) so Leading Bidders can attribute the
      // correct value to each lot's resolved identity.
      let currentBidValue = 0;
      let source; // "live" | "mixed" | "warehouse_fallback"
      const currentBidByLot = new Map();

      if (live && Array.isArray(live.lots)) {
        source = "live";
        const liveLotNumbers = new Set();
        for (const lot of live.lots) {
          const lotNumber = String(lot.lot_number);
          liveLotNumbers.add(lotNumber);
          const amount = lot.current_bid == null ? 0 : Number(lot.current_bid);
          const safeAmount = Number.isFinite(amount) ? amount : 0;
          currentBidValue += safeAmount;
          currentBidByLot.set(lotNumber, safeAmount);
        }
        for (const [lotNumber, amount] of warehouseLots) {
          if (!liveLotNumbers.has(lotNumber)) {
            currentBidValue += amount;
            currentBidByLot.set(lotNumber, amount);
            source = "mixed";
          }
        }
      } else {
        source = "warehouse_fallback";
        for (const [lotNumber, amount] of warehouseLots) {
          currentBidValue += amount;
          currentBidByLot.set(lotNumber, amount);
        }
      }

      // ---------------------------------------------------------
      // PARTICIPATING — every real bid event across every lot in this
      // auction. A bidder with several bids (same or different lots)
      // counts once as a bidder; every event's amount still contributes to
      // activity. Same rule as Level 2's per-lot version, just unioned
      // across the whole auction instead of one lot at a time.
      // ---------------------------------------------------------
      const auctionBidRows = rowsByAuction.get(row.auction_number) ?? [];
      const participatingMap = new Map(); // key -> { type, activity }
      let participatingTotalActivity = 0;
      for (const e of auctionBidRows) {
        const { key, hasEmail, email } = bidderKeyOf(e);
        const type = hasEmail ? classify(email) : "unclassified";
        if (!participatingMap.has(key)) participatingMap.set(key, { type, activity: 0 });
        const amount = Number(e.bid_amount ?? 0);
        participatingMap.get(key).activity += amount;
        participatingTotalActivity += amount;
      }
      let pNew = 0, pReturning = 0, pUnclassified = 0, pNewAmt = 0, pReturningAmt = 0, pUnclassifiedAmt = 0;
      for (const v of participatingMap.values()) {
        if (v.type === "new") { pNew++; pNewAmt += v.activity; }
        else if (v.type === "returning") { pReturning++; pReturningAmt += v.activity; }
        else { pUnclassified++; pUnclassifiedAmt += v.activity; }
      }

      // ---------------------------------------------------------
      // LEADING — CURRENT leaders, not settled winners (this auction is
      // still open). For each lot with bid history, the leading identity
      // is resolved from the warehouse's own latest recorded event
      // (matching Level 2's rule exactly: the event whose amount equals
      // the authoritative warehouseLatest figure, preferring the latest
      // timestamp among matches — never re-derived from bid_amount MAX
      // alone, for the same same-timestamp-tie reasoning documented in
      // Level 2). The VALUE attributed to that identity is the lot's
      // actual CURRENT bid (live when available), so a stale identity
      // (flagged separately, matching Level 2's as_of convention) still
      // carries the real current value rather than the older warehouse
      // amount — this is what keeps New+Returning+Unresolved Leading Value
      // reconciling exactly to Current Bid Value.
      // ---------------------------------------------------------
      const eventsByLot = new Map();
      for (const e of auctionBidRows) {
        const lotNumber = String(e.lot_number);
        if (!eventsByLot.has(lotNumber)) eventsByLot.set(lotNumber, []);
        eventsByLot.get(lotNumber).push(e);
      }

      const leadingMap = new Map(); // key -> { type, value }
      let unresolvedLeadingValue = 0;
      for (const [lotNumber, currentBid] of currentBidByLot) {
        const events = eventsByLot.get(lotNumber) ?? [];
        if (events.length === 0) {
          // A lot with a nonzero current bid but literally no bid-history
          // row at all (e.g. a very recent live bid not yet ingested into
          // the warehouse) has no identity to attribute it to — never
          // guessed, always disclosed here instead.
          if (currentBid > 0) unresolvedLeadingValue += currentBid;
          continue;
        }
        const warehouseLatest = warehouseLots.get(lotNumber) ?? 0;
        const matchingEvents = events.filter((e) => Number(e.bid_amount ?? 0) === warehouseLatest);
        const winnerRow =
          matchingEvents.length > 0
            ? matchingEvents.reduce((latest, e) => (e.bid_created_at > latest.bid_created_at ? e : latest))
            : events[events.length - 1];
        const { key, hasEmail, email } = bidderKeyOf(winnerRow);
        const type = hasEmail ? classify(email) : "unclassified";
        if (!leadingMap.has(key)) leadingMap.set(key, { type, value: 0 });
        leadingMap.get(key).value += currentBid;
      }
      let lNew = 0, lReturning = 0, lUnclassified = 0, lNewValue = 0, lReturningValue = 0, lUnclassifiedValue = 0;
      for (const v of leadingMap.values()) {
        if (v.type === "new") { lNew++; lNewValue += v.value; }
        else if (v.type === "returning") { lReturning++; lReturningValue += v.value; }
        else { lUnclassified++; lUnclassifiedValue += v.value; }
      }
      // "unclassified" (no email) bidders leading a lot are counted as
      // leaders and their value is real, but — same as Participating — an
      // identity we can't classify New/Returning is folded into the
      // disclosed unresolved bucket rather than guessed, matching the
      // house rule of never forcing an unresolved identity into New or
      // Returning.
      const leadingUnresolvedValue = unresolvedLeadingValue + lUnclassifiedValue;

      // Timeline start for the AUCTION-LEVEL progress bar — identical
      // LEAST(official start, earliest recorded bid) semantics already
      // validated for Level 2's bid-activity visualization, computed here
      // from the same batched bid rows instead of a second per-auction
      // query.
      const earliestBidThisAuction = auctionBidRows.reduce(
        (min, r) => (min === null || r.bid_created_at < min ? r.bid_created_at : min),
        null,
      );
      const timelineStart =
        earliestBidThisAuction && earliestBidThisAuction < auctionStartingTime
          ? earliestBidThisAuction
          : auctionStartingTime;

      // ---------------------------------------------------------
      // TIMELINE_LOTS — real bid-event data for the Auction Events card's
      // own progress-bar timeline (see src/utils/auctionActivityEvents.js
      // on the frontend, which this feeds unchanged — same shape as Level
      // 2's per-lot bid_events, just built here from data already fetched
      // above in this ONE batched query, never a new ClickHouse call and
      // never per-auction/per-lot/per-bid). was_winning is the exact same
      // per-lot running-max walk Level 2 computes (never re-derived
      // differently). reserved_price is not available at this list level
      // (no vendor_analysis join here) so it's always 0 — Reserve Met
      // simply never fires on this list-level timeline; it still works on
      // Level 2's own richer per-lot detail view. Capped per lot (see
      // MAX_TIMELINE_EVENTS_PER_LOT) to keep this list-wide response
      // bounded regardless of how much real activity a single lot has.
      // ---------------------------------------------------------
      const timelineLots = [];
      for (const [lotNumber, events] of eventsByLot) {
        let runningMax = -Infinity;
        const bidEvents = events.map((e) => {
          const amount = Number(e.bid_amount ?? 0);
          const wasWinning = amount >= runningMax;
          if (amount > runningMax) runningMax = amount;
          const { hasEmail, email } = bidderKeyOf(e);
          const name = [e.customer_firstname, e.customer_lastname].filter(Boolean).join(" ").trim() || null;
          return {
            timestamp: e.bid_created_at,
            bid_amount: amount,
            bidder: name || (hasEmail ? email : null),
            new_or_returning: hasEmail ? classify(email) : "unclassified",
            was_winning: wasWinning,
          };
        });
        const cappedBidEvents =
          bidEvents.length > MAX_TIMELINE_EVENTS_PER_LOT
            ? [bidEvents[0], ...bidEvents.slice(-(MAX_TIMELINE_EVENTS_PER_LOT - 1))]
            : bidEvents;
        timelineLots.push({ lot_number: lotNumber, name: null, reserved_price: 0, bid_events: cappedBidEvents });
      }

      return {
        auction_number: row.auction_number,
        name: row.auction_name,
        store_name: row.auction_store_name,
        starting_time: row.auction_starting_time,
        ending_time: row.auction_ending_time,
        timeline_start: timelineStart,
        lot_count: Number(row.auction_lot_count ?? 0),
        lots_with_bids: warehouseLots.size,
        current_bid_value: currentBidValue,
        current_bid_source: source,
        timeline_lots: timelineLots,
        participating: {
          total: participatingMap.size,
          new: pNew,
          returning: pReturning,
          unclassified: pUnclassified,
          total_activity: participatingTotalActivity,
          new_activity: pNewAmt,
          returning_activity: pReturningAmt,
          unclassified_activity: pUnclassifiedAmt,
        },
        leading: {
          total: leadingMap.size,
          new: lNew,
          returning: lReturning,
          new_value: lNewValue,
          returning_value: lReturningValue,
          unresolved_value: leadingUnresolvedValue,
        },
      };
    });

    return res.status(200).json({ auctions });
  } catch (err) {
    console.error("live-auctions API error:", err);
    return res.status(500).json({
      error: "Failed to load live auctions",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
