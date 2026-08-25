import { createClient } from "@clickhouse/client";
import { getLiveLotsSafe } from "./_liveBids.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Online Bidding Level 2 — lots for ONE auction, with bid-timeline detail.
// Everything except current_bid comes from ClickHouse: bid history, bidder
// identity, and New/Returning are all things the live API simply does not
// provide (confirmed against real payloads — cms.hmr.ph's bid-amounts
// response carries lot_number + current_bid only, nothing about who bid).
// One batched live call for the whole auction (never per lot), one bid
// history query for the whole auction (never per lot) — no N+1.
export default async function handler(req, res) {
  try {
    const { auction_number } = req.query;
    if (!auction_number) {
      return res.status(400).json({ error: "auction_number is required" });
    }

    const auctionMetaResult = await client.query({
      query: `
        SELECT
          auction_number,
          any(name) AS auction_name,
          any(store_name) AS auction_store_name,
          any(category) AS auction_category,
          min(starting_time) AS auction_starting_time,
          max(ending_time) AS auction_ending_time,
          max(lot_count) AS auction_lot_count

        FROM xv3.mart_auction_productivity_report

        WHERE auction_number = {auctionNumber:String}

        GROUP BY auction_number
      `,
      query_params: { auctionNumber: auction_number },
      format: "JSONEachRow",
    });

    const auctionMetaRows = await auctionMetaResult.json();
    const meta = auctionMetaRows[0];

    // Scoped to the same population as the Level 1 list — a non-Online or
    // unknown auction_number is not a valid Online Bidding detail target,
    // regardless of how the request arrived.
    if (!meta || meta.auction_category !== "Online Bidding") {
      return res.status(404).json({ error: `No active Online Bidding auction found for ${auction_number}` });
    }

    // Every lot belonging to the auction, including ones with zero bids —
    // NOT scoped by status, same population style as the "lots" drilldown
    // elsewhere in this codebase, just for a single auction_number.
    const lotsResult = await client.query({
      query: `
        SELECT
          lot_number,
          any(name) AS name,
          max(ifNull(reserved_price, 0)) AS reserved_price

        FROM xv3.mart_auction_vendor_analysis

        WHERE auction_number = {auctionNumber:String}
          AND lot_number IS NOT NULL

        GROUP BY lot_number
      `,
      query_params: { auctionNumber: auction_number },
      format: "JSONEachRow",
    });
    const lotRows = await lotsResult.json();

    // Full per-event bid history for the ENTIRE auction in one query — bid
    // amount here is each event's STANDING bid value, not an increment
    // (confirmed against real data elsewhere in this codebase: summing
    // events overstates a lot's true value). bid_created_at is
    // DateTime64(3) but real values only ever carry whole-second precision
    // (verified: every sampled row ends in ".000") — several real ties
    // exist at the exact same second within one auction. There is no id/
    // sequence column on this table to break such ties deterministically,
    // so this endpoint does NOT claim a true sub-second order between
    // simultaneous events — see bid_events mapping below.
    const bidHistoryResult = await client.query({
      query: `
        SELECT
          lot_number,
          bid_amount,
          bid_created_at,
          email,
          customer_firstname,
          customer_lastname,
          bidder_number

        FROM cms.mart_cms_bid_history_report

        WHERE auction_number = {auctionNumber:String}
          AND lot_number IS NOT NULL
          AND bid_created_at IS NOT NULL

        ORDER BY lot_number, bid_created_at, bid_amount
      `,
      query_params: { auctionNumber: auction_number },
      format: "JSONEachRow",
    });
    const bidRows = await bidHistoryResult.json();

    // Authoritative "warehouse latest bid" per lot — the SAME
    // argMax(bid_amount, bid_created_at) convention used everywhere else in
    // this codebase (api/overview.js's lot_latest_bid, api/live-auctions.js).
    // Deliberately NOT re-derived by walking bidRows in JS: real same-
    // timestamp ties exist (confirmed — e.g. two different bidders at the
    // exact same second with different amounts), and picking "the higher
    // amount among tied timestamps" in JS can disagree with ClickHouse's
    // own argMax resolution for that tie. Using the identical SQL
    // aggregate here guarantees this endpoint's notion of "warehouse
    // latest" always matches the rest of the app, which is what the
    // live-vs-warehouse staleness comparison below depends on being
    // trustworthy.
    const lotLatestResult = await client.query({
      query: `
        SELECT
          lot_number,
          argMax(bid_amount, bid_created_at) AS latest_bid_amount

        FROM cms.mart_cms_bid_history_report

        WHERE auction_number = {auctionNumber:String}
          AND lot_number IS NOT NULL

        GROUP BY lot_number
      `,
      query_params: { auctionNumber: auction_number },
      format: "JSONEachRow",
    });
    const lotLatestRows = await lotLatestResult.json();
    const warehouseLatestByLot = new Map(
      lotLatestRows.map((r) => [String(r.lot_number), Number(r.latest_bid_amount ?? 0)]),
    );

    // bidder_key: lowerUTF8(trim(email)) when a real email exists — same
    // normalization Bidder Composition/Top Bidders already use. A bid event
    // with no email at all (not observed on any real active auction sampled
    // during implementation, but guarded against) falls back to its raw
    // bidder_number as an honest, non-fabricated identity token; such a
    // bidder is still counted as participating but is never classified
    // New/Returning, since there's no email to look up a global first-ever
    // bid for.
    function bidderKeyOf(row) {
      const email = (row.email ?? "").trim().toLowerCase();
      if (email) return { key: `email:${email}`, hasEmail: true, email };
      return { key: `bidder_number:${row.bidder_number}`, hasEmail: false, email: null };
    }

    const emailKeys = new Set();
    for (const row of bidRows) {
      const { hasEmail, email } = bidderKeyOf(row);
      if (hasEmail) emailKeys.add(email);
    }

    // Global first-ever-bid per email — EXACT same definition already
    // validated for Bidder Composition (api/leaderboards.js): New/Returning
    // is decided against a boundary. There, the boundary is the selected
    // analytics date range; here, it's this auction's own starting_time —
    // "has this person ever bid before THIS auction started", the same
    // underlying question, just a different boundary instant.
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

    const auctionStartingTime = meta.auction_starting_time;

    // Timeline start for the bid-activity VISUALIZATION only — never used
    // for New/Returning, bid calculations, or anything business-logic
    // related, all of which keep using the official auctionStartingTime
    // above. Real data confirms online bidding activity can begin before
    // an auction's official starting_time (verified: 5433MS alone had 31
    // of 94 bid events before its 13:00 official start) and no warehouse
    // field represents a distinct "pre-bidding opened" instant — checked
    // xv3.mart_auction_productivity_report's published_date (too early/
    // unrelated to actual bidding, and NULL on some real active auctions)
    // and cms.mart_cms_bid_history_report's own starting_time/ending_time
    // (identical to the auction-level values, not an earlier "opens" time).
    // So the timeline simply starts at whichever came first for real:
    // the official start, or the earliest bid actually recorded.
    const earliestBidAcrossAuction = bidRows.reduce(
      (min, row) => (min === null || row.bid_created_at < min ? row.bid_created_at : min),
      null,
    );
    const timelineStart =
      earliestBidAcrossAuction && earliestBidAcrossAuction < auctionStartingTime
        ? earliestBidAcrossAuction
        : auctionStartingTime;

    function classify(email) {
      const firstEver = firstEverByEmail.get(email);
      if (!firstEver) return "unclassified";
      // String comparison is safe here — both sides are ClickHouse
      // "YYYY-MM-DD HH:MM:SS.mmm" strings from the same column family, so
      // lexical order matches chronological order.
      return firstEver >= auctionStartingTime ? "new" : "returning";
    }

    // Live current_bid for every lot in this auction, ONE call.
    const live = await getLiveLotsSafe(auction_number);
    const liveByLot = new Map();
    if (live && Array.isArray(live.lots)) {
      for (const lot of live.lots) {
        liveByLot.set(String(lot.lot_number), lot.current_bid == null ? null : Number(lot.current_bid));
      }
    }

    // Group bid events by lot.
    const eventsByLot = new Map();
    for (const row of bidRows) {
      const lotNumber = String(row.lot_number);
      if (!eventsByLot.has(lotNumber)) eventsByLot.set(lotNumber, []);
      eventsByLot.get(lotNumber).push(row);
    }

    let auctionCurrentBidValue = 0;
    let anyLive = false;
    let anyFallback = false;

    const lots = lotRows.map((lotRow) => {
      const lotNumber = String(lotRow.lot_number);
      const events = eventsByLot.get(lotNumber) ?? [];

      // Warehouse "current/standing" bid for this lot comes from the
      // authoritative argMax query above, not a JS re-derivation — see that
      // query's comment for why. latestTimestamp (for last_bid_time and for
      // locating the leading bidder's identity below) is still the real
      // max(bid_created_at) among this lot's events, which ties don't
      // affect the VALUE of, only which row achieves it.
      const warehouseLatest = warehouseLatestByLot.get(lotNumber) ?? 0;
      let latestTimestamp = null;
      for (const e of events) {
        if (latestTimestamp === null || e.bid_created_at > latestTimestamp) {
          latestTimestamp = e.bid_created_at;
        }
      }

      const liveAmount = liveByLot.has(lotNumber) ? liveByLot.get(lotNumber) : undefined;
      let currentBid;
      let currentBidSource;
      if (liveAmount !== undefined) {
        currentBid = liveAmount ?? 0;
        currentBidSource = "live";
        anyLive = true;
      } else {
        currentBid = warehouseLatest;
        currentBidSource = "warehouse_fallback";
        anyFallback = true;
      }
      auctionCurrentBidValue += currentBid;

      // Leading bidder is always resolved from the WAREHOUSE'S latest event
      // (it's the only source with any identity at all). If the live
      // current_bid doesn't match the warehouse's own latest amount, a
      // newer live bid exists that ClickHouse hasn't ingested yet — the
      // identity below is then explicitly stale, never presented as the
      // definitive real-time leader.
      let leadingBidder = null;
      if (events.length > 0) {
        // Find the event whose amount matches the authoritative
        // warehouseLatest figure, preferring the most recent timestamp
        // among matches — this is the closest we can get to "whichever row
        // ClickHouse's own argMax effectively selected" without replicating
        // its internal (undocumented) tie-break exactly. In the rare case
        // of a true double-tie (same timestamp AND same amount from two
        // different bidders — not observed in any auction sampled during
        // implementation), this picks one of them arbitrarily; there is no
        // way to know which one ClickHouse's argMax would have picked.
        const matchingEvents = events.filter((e) => Number(e.bid_amount ?? 0) === warehouseLatest);
        const winnerRow =
          matchingEvents.length > 0
            ? matchingEvents.reduce((latest, e) => (e.bid_created_at > latest.bid_created_at ? e : latest))
            : events[events.length - 1];
        const { hasEmail, email } = bidderKeyOf(winnerRow);
        const name = [winnerRow.customer_firstname, winnerRow.customer_lastname]
          .filter(Boolean)
          .join(" ")
          .trim() || null;
        const isStale = currentBidSource === "live" && Math.abs(currentBid - warehouseLatest) > 0.01;
        leadingBidder = {
          name: name || (hasEmail ? email : null),
          type: hasEmail ? classify(email) : "unclassified",
          as_of: isStale ? "warehouse_sync" : "current",
          amount: warehouseLatest,
        };
      }

      // Distinct participating bidders + New/Returning classification.
      const distinct = new Map();
      for (const e of events) {
        const { key, hasEmail, email } = bidderKeyOf(e);
        if (!distinct.has(key)) {
          distinct.set(key, hasEmail ? classify(email) : "unclassified");
        }
      }
      let newCount = 0;
      let returningCount = 0;
      let unclassifiedCount = 0;
      for (const type of distinct.values()) {
        if (type === "new") newCount++;
        else if (type === "returning") returningCount++;
        else unclassifiedCount++;
      }

      // Bid activity timeline — chronological (ties preserved in query
      // order, not a claimed sub-second sequence), each point flagged with
      // whether it was the standing/winning bid AT THAT POINT (recomputed
      // as a running max walk, not assumed from final state).
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

      return {
        lot_number: lotRow.lot_number,
        name: lotRow.name,
        reserved_price: Number(lotRow.reserved_price ?? 0),
        current_bid: currentBid,
        current_bid_source: currentBidSource,
        last_bid_time: latestTimestamp,
        participating_bidders: distinct.size,
        new_bidders: newCount,
        returning_bidders: returningCount,
        unclassified_bidders: unclassifiedCount,
        leading_bidder: leadingBidder,
        bid_events: bidEvents,
      };
    });

    return res.status(200).json({
      auction: {
        auction_number: meta.auction_number,
        name: meta.auction_name,
        store_name: meta.auction_store_name,
        starting_time: meta.auction_starting_time,
        ending_time: meta.auction_ending_time,
        // Visualization-only bid-activity timeline start (see comment
        // above) — LEAST(official starting_time, earliest recorded bid).
        // Equal to starting_time whenever there was no pre-bidding.
        // starting_time itself is untouched and still the official value.
        timeline_start: timelineStart,
        lot_count: Number(meta.auction_lot_count ?? 0),
        current_bid_value: auctionCurrentBidValue,
        current_bid_source: anyLive && anyFallback ? "mixed" : anyLive ? "live" : "warehouse_fallback",
      },
      lots,
    });
  } catch (err) {
    console.error("live-auction-detail API error:", err);
    return res.status(500).json({
      error: "Failed to load auction detail",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
