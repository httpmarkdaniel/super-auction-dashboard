import { createClient } from "@clickhouse/client";
import { hmrApiGet } from "./_hmrApi.js";
import { resolveAuctionId } from "./_liveBids.js";

// Same ClickHouse client configuration as api/overview.js — the old
// api/_clickhouse.js (raw HTTP interface, CH_* env vars) was removed in
// 9f0b0c1 and is intentionally not restored.
const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// cms.hmr.ph's bid-amounts response has no product name/description field
// at all (confirmed against its actual payload, not just the docs) — but
// ClickHouse's vendor-analysis mart has name/description per lot_number,
// keyed by the same auction_number the dashboard already has. GROUP BY
// with any() because a lot can have more than one row over its lifecycle
// (status changes) and they all share the same name anyway.
async function fetchLotNames(auctionNumber) {
  try {
    const result = await client.query({
      query: `
        SELECT lot_number AS lotNumber, any(name) AS name, any(description) AS description
        FROM mart_auction_vendor_analysis
        WHERE auction_number = {auctionNumber:String}
        GROUP BY lot_number
      `,
      query_params: { auctionNumber },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    return Object.fromEntries(rows.map((r) => [r.lotNumber, r.name || r.description || null]));
  } catch {
    // Names are an enrichment, not the point of this endpoint — a
    // ClickHouse hiccup shouldn't take down real-time bid data with it.
    return {};
  }
}

// cms.hmr.ph's bid-amounts response has no starting-bid field at all (only
// current_bid, which is null pre-bid) — the closest real figure is
// `postings.starting_amount` in the raw warehouse tables, bridged via
// auctions.auction_id (the same ID space mart_auction_productivity_report
// already uses, confirmed directly). Risk: that raw table can lag behind
// edits made directly in cms.hmr.ph — confirmed on a real auction where 5
// of 15 lots had been swapped for different items after the last sync,
// while starting_amount still reflected the old item. So this is only
// trustworthy when postings' own item name still agrees with the name
// we're already showing (from mart_auction_vendor_analysis) — checked by
// word-overlap rather than exact match, since harmless wording/typo
// differences (e.g. "Pedestal" vs "Pedestal Cabinet") show up even on
// genuinely-current lots.
async function fetchStartingAmounts(auctionNumber) {
  try {
    const result = await client.query({
      query: `
        SELECT
          lot_number AS lotNumber,
          argMax(name, updated_at) AS name,
          argMax(starting_amount, updated_at) AS startingAmount
        FROM postings
        WHERE auction_id = (
          SELECT auction_id FROM auctions WHERE auction_number = {auctionNumber:String} LIMIT 1
        )
        GROUP BY lot_number
      `,
      query_params: { auctionNumber },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    return Object.fromEntries(rows.map((r) => [r.lotNumber, { name: r.name, startingAmount: r.startingAmount }]));
  } catch {
    return {};
  }
}

function wordSet(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

// Jaccard word-overlap — tolerant of minor wording/typo drift, but still
// rejects a genuinely different item (0% overlap) like "Chest Freezer" vs
// "Anko Citrus Juicer".
function namesLikelySameItem(a, b) {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let intersection = 0;
  for (const w of wa) if (wb.has(w)) intersection++;
  return intersection / (wa.size + wb.size - intersection) >= 0.5;
}

// Current highest bid per lot in one auction — cheap enough to poll
// frequently since it's one call covering every lot in that auction.
//
// The dashboard only ever knows ClickHouse's auction_number, not
// cms.hmr.ph's own internal auction_id — the two ID spaces are unrelated
// even when the number matches. So auction_number is the normal way to
// call this; it's resolved via the lookup endpoint first (cached in
// _liveBids.js, shared with overview.js's live-bid correction). `auction`
// is still accepted directly for callers that already have the internal id.
export default async function handler(req, res) {
  const { auction, auction_number, search } = req.query;
  if (!auction && !auction_number) {
    return res.status(400).json({ error: "auction or auction_number is required" });
  }

  try {
    let auctionId = auction;
    if (!auctionId) {
      auctionId = await resolveAuctionId(auction_number);
      if (!auctionId) {
        return res.status(404).json({ error: `No cms.hmr.ph auction found for auction_number ${auction_number}` });
      }
    }

    const [data, names, startingAmounts] = await Promise.all([
      hmrApiGet(`/auctions/${encodeURIComponent(auctionId)}/bid-amounts`, { search }),
      auction_number ? fetchLotNames(auction_number) : Promise.resolve({}),
      auction_number ? fetchStartingAmounts(auction_number) : Promise.resolve({}),
    ]);
    const lots = data.map((lot) => {
      const name = names[lot.lot_number] ?? null;
      const sa = startingAmounts[lot.lot_number];
      const startingAmount = sa && name && namesLikelySameItem(sa.name, name) ? Number(sa.startingAmount) : null;
      return { ...lot, name, starting_amount: startingAmount };
    });
    res.status(200).json({ auction_id: auctionId, lots });
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message });
  }
}
