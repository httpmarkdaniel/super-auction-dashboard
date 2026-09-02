import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Same dynamic-bucket philosophy as api/bidder-analytics.js's pickBucket —
// never hardcoded to "month". Bucketed by the auction's own ending_time.
function pickBucket(fromStr, toStr) {
  const days = (Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86400000;
  if (days <= 9) return { fn: "toStartOfDay", label: "day" };
  if (days <= 60) return { fn: "toMonday", label: "week" };
  return { fn: "toStartOfMonth", label: "month" };
}

// VENDOR ANALYTICS — "Active & New Vendors by Period" time series only.
// Active Vendors/New Vendors/Top-5 Concentration/Stuck Inventory/Top 10
// Vendors totals all already come from api/leaderboards.js's
// vendor_analytics field (one bounded all-lots-per-vendor aggregate,
// reused rather than duplicated here) — this endpoint exists purely for
// the bucketed trend, which that flat aggregate can't produce. No
// identity bridge needed (vendor is a real field, not a resolved bidder
// identity), so this is a single light query.
export default async function handler(req, res) {
  try {
    const { from, to, store = "", category = "" } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: "Missing from/to date parameters" });
    }

    const queryParams = { from, to, store, category };
    const { fn: bucketFn, label: bucketLabel } = pickBucket(from, to);
    const bucketExpr = (col) => `${bucketFn}(${col}, 'Asia/Manila')`;

    const result = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name, ${bucketExpr("ending_time")} AS bucket
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),
        lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(s.bucket) AS bucket,
            any(ifNull(v.vendor, 'Unknown Vendor')) AS vendor,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
          FROM xv3.mart_auction_vendor_analysis v
          INNER JOIN selected_auctions s ON v.auction_number = s.auction_number
          WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),
        vendor_bucket AS (
          SELECT DISTINCT bucket, vendor FROM lots
        ),
        vendor_first_seen AS (
          SELECT ifNull(vendor, 'Unknown Vendor') AS vendor, min(date_created) AS first_seen
          FROM xv3.mart_auction_vendor_analysis
          WHERE vendor IS NOT NULL
          GROUP BY vendor
        )
        SELECT
          vb.bucket AS bucket,
          uniqExact(vb.vendor) AS total,
          uniqExactIf(vb.vendor, ${bucketExpr("vfs.first_seen")} = vb.bucket) AS new_vendors,
          uniqExactIf(vb.vendor, ${bucketExpr("vfs.first_seen")} != vb.bucket OR vfs.first_seen IS NULL) AS returning_vendors
        FROM vendor_bucket vb
        LEFT JOIN vendor_first_seen vfs ON vb.vendor = vfs.vendor
        GROUP BY vb.bucket
        ORDER BY bucket
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });
    const rows = await result.json();

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
    return res.status(200).json({
      bucket_label: bucketLabel,
      by_period: rows.map((row) => ({
        bucket: row.bucket,
        total: Number(row.total ?? 0),
        new_vendors: Number(row.new_vendors ?? 0),
        returning_vendors: Number(row.returning_vendors ?? 0),
      })),
    });
  } catch (err) {
    console.error("Vendor Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load vendor analytics",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
