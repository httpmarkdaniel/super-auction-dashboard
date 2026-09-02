import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";
import { BIDDER_IDENTITY_CTES } from "./_bidderIdentity.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Dynamic bucket granularity (PART 20/37 of the Bidder Analytics task) —
// never hardcoded to "month". Bucketed by the auction's own ending_time
// (the canonical historical-attribution unit dashboard-wide), never
// bid_created_at — a bidder's presence in a bucket means they had a real
// bid event or resolved win in an auction whose ending_time falls in that
// bucket, exactly mirroring the "select auction cohort by ending_time,
// then bidder engagement uses ALL real bid events belonging to those
// auctions" rule used everywhere else in this dashboard.
function pickBucket(fromStr, toStr) {
  const days = (Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86400000;
  if (days <= 9) return { fn: "toStartOfDay", label: "day" };
  if (days <= 60) return { fn: "toMonday", label: "week" };
  return { fn: "toStartOfMonth", label: "month" };
}

export default async function handler(req, res) {
  try {
    const { from, to, store = "", category = "" } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: "Missing from/to date parameters" });
    }

    const queryParams = { from, to, store, category };
    const { fn: bucketFn, label: bucketLabel } = pickBucket(from, to);
    const bucketExpr = (col) => `${bucketFn}(${col}, 'Asia/Manila')`;

    // ---------------------------------------------------------
    // Shared bucketed union population — every real bid-history bidder AND
    // every resolved winning bidder, each tagged with the bucket their
    // auction's ending_time falls into. Same canonical union technique as
    // leaderboards.js's compositionQuery, just bucketed instead of
    // collapsed to one row. Two consumers below (time series, always-
    // active/went-quiet) share this exact same WITH-clause text — kept as
    // a template function rather than one shared query so each can stay a
    // single bounded ClickHouse round trip returning only what it needs
    // (never raw per-bidder-bucket rows shipped to the client).
    // ---------------------------------------------------------
    function bucketedUnionCTEs() {
      return `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name, ${bucketExpr("ending_time")} AS bucket
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),
        lot_category AS (
          SELECT v.auction_number AS auction_number, v.lot_number AS lot_number,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
          FROM xv3.mart_auction_vendor_analysis v
          WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
        ),
        bid_history_bidder_bucket AS (
          SELECT DISTINCT s.bucket AS bucket, lowerUTF8(trim(b.email)) AS bidder_key
          FROM cms.mart_cms_bid_history_report b
          INNER JOIN selected_auctions s ON b.auction_number = s.auction_number
          LEFT JOIN lot_category lc ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number
          WHERE b.email IS NOT NULL AND trim(b.email) != ''
            AND ({category:String} = '' OR lc.lot_category = {category:String})
        ),
        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(s.bucket) AS bucket,
            any(v.or_number) AS or_number,
            any(v.date_time_paid) AS date_time_paid,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
          FROM xv3.mart_auction_vendor_analysis v
          INNER JOIN selected_auctions s ON v.auction_number = s.auction_number
          WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),
        ${BIDDER_IDENTITY_CTES},
        winning_bidder_bucket AS (
          SELECT DISTINCT sl.bucket AS bucket, rli.resolved_email AS bidder_key
          FROM settled_lots sl
          INNER JOIN resolved_lot_identity rli ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number
          WHERE rli.resolved_email IS NOT NULL
        ),
        union_bucket_bidder AS (
          SELECT bucket, bidder_key FROM bid_history_bidder_bucket
          UNION DISTINCT
          SELECT bucket, bidder_key FROM winning_bidder_bucket
        )
      `;
    }

    // TIME SERIES — one row per bucket. "new" = this bidder's ALL-TIME
    // first-ever real bid/win (bidder_first_ever, unscoped by this
    // period) falls in THIS SAME bucket — never re-derived from a
    // period-relative boundary, so it agrees with every other New/
    // Returning classification in this dashboard.
    const timeSeriesResult = await client.query({
      query: `
        ${bucketedUnionCTEs()}
        SELECT
          bucket,
          uniqExact(bidder_key) AS total,
          uniqExactIf(bidder_key, ${bucketExpr("fe.first_ever_at")} = bucket) AS new_bidders,
          uniqExactIf(bidder_key, ${bucketExpr("fe.first_ever_at")} != bucket OR fe.first_ever_at IS NULL) AS returning_bidders
        FROM union_bucket_bidder u
        LEFT JOIN bidder_first_ever fe ON u.bidder_key = fe.fe_key
        GROUP BY bucket
        ORDER BY bucket
      `,
      query_params: queryParams,
      format: "JSONEachRow",
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    });
    const timeSeriesRows = await timeSeriesResult.json();

    // ALWAYS ACTIVE / WENT QUIET — bidder-grain bucket presence, run
    // SEQUENTIALLY after the time series above (both touch
    // BIDDER_IDENTITY_CTES — see leaderboards.js's incident writeup on why
    // heavy identity-bridge queries never run concurrently with each
    // other in this codebase). Returns only per-bidder summary rows
    // (bucket COUNT + last bucket), never every raw (bucket, bidder) row —
    // classification itself happens in JS below, bounded by canonical
    // bidder-population size, not bid-event volume.
    const bidderBucketSummaryResult = await client.query({
      query: `
        ${bucketedUnionCTEs()}
        SELECT
          bidder_key,
          uniqExact(bucket) AS buckets_present,
          max(bucket) AS last_present_bucket
        FROM union_bucket_bidder
        GROUP BY bidder_key
      `,
      query_params: queryParams,
      format: "JSONEachRow",
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    });
    const bidderBucketSummaryRows = await bidderBucketSummaryResult.json();

    const totalBuckets = timeSeriesRows.length;
    const latestBucket = totalBuckets > 0 ? timeSeriesRows[timeSeriesRows.length - 1].bucket : null;

    // "Be careful with WTD/short Custom periods" (PART 19) — Always
    // Active/Went Quiet are only meaningful when there's more than one
    // bucket to be present-or-absent across; a single-bucket range (e.g.
    // WTD bucketed daily but only 1-2 days old) reports both as
    // unavailable rather than manufacturing a trivial 100%/0% split.
    const bucketedClassificationApplicable = totalBuckets > 1;
    const alwaysActiveCount = bucketedClassificationApplicable
      ? bidderBucketSummaryRows.filter((r) => Number(r.buckets_present) === totalBuckets).length
      : null;
    const wentQuietCount = bucketedClassificationApplicable
      ? bidderBucketSummaryRows.filter((r) => r.last_present_bucket !== latestBucket).length
      : null;

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
    return res.status(200).json({
      bucket_label: bucketLabel,
      bucket_count: totalBuckets,
      by_period: timeSeriesRows.map((row) => ({
        bucket: row.bucket,
        total: Number(row.total ?? 0),
        new_bidders: Number(row.new_bidders ?? 0),
        returning_bidders: Number(row.returning_bidders ?? 0),
      })),
      always_active: alwaysActiveCount,
      went_quiet: wentQuietCount,
      classification_applicable: bucketedClassificationApplicable,
    });
  } catch (err) {
    console.error("Bidder Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load bidder analytics",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
