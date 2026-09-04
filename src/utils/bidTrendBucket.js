import { manilaToEpochMs } from "./manilaTime";

function parseBucketDate(bucket) {
  return new Date(`${bucket}T00:00:00`);
}

// Full bucket date/range label — day: "Sep 1, 2026"; week: the full 7-day
// span "Aug 3 – Aug 9, 2026"; month: full month name "September 2026".
// Shared by BidTrendChart.jsx's hover tooltip and BidTrendDetailModal.jsx's
// click detail (kept here, not in either component, so neither imports the
// other — avoids a circular import between the chart and its own modal).
export function formatTooltipLabel(bucket, bucketLabel) {
  const d = parseBucketDate(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  if (bucketLabel === "month") {
    return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  }
  if (bucketLabel === "week") {
    const end = new Date(d.getTime() + 6 * 86400000);
    const startLabel = d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// Manila-fixed-UTC+8 epoch bounds [start, end) for one Bid Trend bucket's
// underlying calendar range — day: that single day; week: the same
// Monday-start 7-day span api/_bucketing.js's enumerateBuckets() already
// uses server-side; month: the full calendar month. Reused by
// BidTrendChart.jsx's hover tooltip and BidTrendDetailModal.jsx's click
// detail to filter the already-loaded per-auction `auctionSummary` array
// by ending_time — entirely client-side, never a new request per
// hover/click.
export function bucketRangeMs(bucket, bucketLabel) {
  const [y, mo, d] = bucket.split("-").map(Number);
  const startMs = Date.UTC(y, mo - 1, d) - 8 * 3600 * 1000;
  if (bucketLabel === "month") {
    return [startMs, Date.UTC(y, mo, 1) - 8 * 3600 * 1000];
  }
  const days = bucketLabel === "week" ? 7 : 1;
  return [startMs, startMs + days * 86400000];
}

// Buyer's Premium/Service Fee (commission) + per-branch Auction Events/Bid
// Amount for ONE bucket — derived from the already-loaded, SETTLED-only
// per-auction `auctionSummary` rows (see api/overview.js's AUCTION-LEVEL
// SUMMARY query, now carrying buyersPremiumIncome/commissionIncome per
// auction). Deliberately does NOT recompute Participating/Winning bidder
// counts or Lots Sold here — auctionSummary is per-AUCTION, so summing
// bidder counts across auctions in the same bucket would double-count a
// bidder active in more than one auction that day/week/month. Those
// figures come from the bucket's own already-correct, already-deduplicated
// bid_trend row instead (bid_amount/auctions_concluded/lots_sold/
// participating/winning) — see BidTrendChart.jsx/BidTrendDetailModal.jsx.
export function computeBucketFinancials(auctionSummary, bucket, bucketLabel) {
  const [startMs, endMs] = bucketRangeMs(bucket, bucketLabel);
  const settledInBucket = (auctionSummary || []).filter((a) => {
    if (!a.settledLotCount) return false;
    const endingMs = manilaToEpochMs(a.endingTime);
    return endingMs != null && endingMs >= startMs && endingMs < endMs;
  });

  const buyersPremium = settledInBucket.reduce((s, a) => s + (a.buyersPremiumIncome || 0), 0);
  const commission = settledInBucket.reduce((s, a) => s + (a.commissionIncome || 0), 0);

  const byBranch = new Map();
  for (const a of settledInBucket) {
    const key = a.storeName || "—";
    if (!byBranch.has(key)) {
      byBranch.set(key, { branch: key, auctions: new Set(), bidAmount: 0, lotsSold: 0, buyersPremium: 0, commission: 0 });
    }
    const b = byBranch.get(key);
    b.auctions.add(a.auctionNumber);
    b.bidAmount += a.settledBidAmount || 0;
    // Lots Sold is safe to sum per branch (an auction — and every lot in
    // it — belongs to exactly one branch, unlike bidder counts which can
    // repeat a person across auctions in the same branch).
    b.lotsSold += a.lotsSold || 0;
    b.buyersPremium += a.buyersPremiumIncome || 0;
    b.commission += a.commissionIncome || 0;
  }
  const branches = [...byBranch.values()]
    .map((b) => ({
      branch: b.branch,
      auctionEvents: b.auctions.size,
      bidAmount: b.bidAmount,
      lotsSold: b.lotsSold,
      buyersPremium: b.buyersPremium,
      commission: b.commission,
      serviceIncome: b.buyersPremium + b.commission,
    }))
    .sort((x, y) => y.bidAmount - x.bidAmount);

  return {
    buyersPremium,
    commission,
    serviceIncome: buyersPremium + commission,
    branches,
  };
}
