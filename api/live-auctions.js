import { createClient } from "@clickhouse/client";
import { getLiveLotsSafe } from "./_liveBids.js";

// Same ClickHouse client configuration as api/overview.js.
const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Online Bidding Level 1 — the auction-events list. Deliberately NOT scoped
// by Today/7d/30d/Custom: an auction's own [starting_time, ending_time]
// window is what matters here, not when bids happened to be placed (a real
// active auction can span 45+ days). Population is "currently active
// Online Bidding events" — same starting_time<=now<=ending_time predicate
// as the existing Active Auctions KPI, narrowed to category='Online
// Bidding' (verified: not every active auction is Online — 'Live Auction',
// 'Simulcast', and 'Buy Now' are real, distinct categories on the same
// table). Store filter still applies.
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

      let currentBidValue = 0;
      let source; // "live" | "mixed" | "warehouse_fallback"

      if (live && Array.isArray(live.lots)) {
        source = "live";
        const liveLotNumbers = new Set();
        for (const lot of live.lots) {
          const lotNumber = String(lot.lot_number);
          liveLotNumbers.add(lotNumber);
          const amount = lot.current_bid == null ? 0 : Number(lot.current_bid);
          currentBidValue += Number.isFinite(amount) ? amount : 0;
        }
        // A warehouse-known lot missing from the live response (mapping
        // gap) falls back individually rather than being dropped.
        for (const [lotNumber, amount] of warehouseLots) {
          if (!liveLotNumbers.has(lotNumber)) {
            currentBidValue += amount;
            source = "mixed";
          }
        }
      } else {
        source = "warehouse_fallback";
        for (const amount of warehouseLots.values()) currentBidValue += amount;
      }

      return {
        auction_number: row.auction_number,
        name: row.auction_name,
        store_name: row.auction_store_name,
        starting_time: row.auction_starting_time,
        ending_time: row.auction_ending_time,
        lot_count: Number(row.auction_lot_count ?? 0),
        lots_with_bids: warehouseLots.size,
        current_bid_value: currentBidValue,
        current_bid_source: source,
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
