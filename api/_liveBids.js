import { hmrApiGet } from "./_hmrApi.js";

// Shared between live-bid-amounts.js (the Online Bidding tab) and
// overview.js (correcting the stale ClickHouse snapshot for auctions still
// in progress) — both need "resolve auction_number, then fetch its lots'
// current bids" and both benefit from the same warm-instance cache.
const auctionIdCache = new Map();

export async function resolveAuctionId(auctionNumber, signal) {
  const cached = auctionIdCache.get(auctionNumber);
  if (cached) return cached;

  const matches = await hmrApiGet("/auctions/lookup", { auction_number: auctionNumber }, signal);
  if (!matches?.length) return null;

  const id = matches[0].auction_id;
  auctionIdCache.set(auctionNumber, id);
  return id;
}

// Current lots for one auction, resolving auction_number to cms's internal
// id first. Returns null (never throws) on any failure — cms.hmr.ph has
// shown intermittent hangs and 500s, and callers need to treat one bad
// auction as "skip it", not "the whole request failed".
export async function getLiveLotsSafe(auctionNumber, { search, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const auctionId = await resolveAuctionId(auctionNumber, controller.signal);
    if (!auctionId) return null;
    const lots = await hmrApiGet(`/auctions/${encodeURIComponent(auctionId)}/bid-amounts`, { search }, controller.signal);
    return { auctionId, lots };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
