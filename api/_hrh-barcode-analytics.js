import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions
// and is already exactly at that cap, so this can't be its own route.
// api/hrh-sales-analytics.js dispatches here on `?report=barcodeAnalytics`.
//
// A live INVENTORY/POSTING snapshot, not a sales-over-time report — every
// other api/hrh-*.js file takes a Date Range + Channel filter because it's
// summing sales transactions over a window; this one queries
// xv3.mart_level_of_inventory, which has no transaction date or
// sales_channel dimension at all (it's a current-state snapshot per
// item/store). So this endpoint deliberately ignores the page's Date
// Range/Channel filter and always answers "as of right now" for HRH
// Online specifically (hardcoded store_name, same as every other
// api/hrh-*.js file's locked contract).
const HRH_STORE = "HRH ONLINE";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}
// Same Asia/Manila "today" convention every other api/hrh-*.js file uses
// (never the server's own UTC date) — needed here specifically for
// "Barcoded Today", the one KPI on this otherwise dateless snapshot page
// that's actually scoped to a calendar day.
function manilaTodayISODate() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function handleBarcodeAnalytics(req, res) {
  try {
    // KPIs — "Barcoded Items" is every inventory record for this store
    // (verified: 100% of xv3.mart_level_of_inventory rows already carry a
    // barcode — this table doesn't track pre-barcode items at all, so
    // "barcoded" here really means "catalogued", the earliest state this
    // table can see). "Posted" = has a positive HMRPH CMS posting quantity
    // (same posted/not-posted signal Product Analytics' Dropped Products
    // panel already uses).
    // "Barcoded Today" uses created_time, the only genuine per-item
    // creation timestamp on this table — checked for a real posting-side
    // equivalent (items.barcoded_time, a dedicated postings table) but both
    // turned out to belong to the auction/consignment side of the business
    // (zero rows for HRH Online's store_id), so there's still no posted_at
    // signal here and "Items Posted Today" isn't computable.
    const today = manilaTodayISODate();
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            count() AS barcoded,
            countIf(cms_hmrph_posting_quantity > 0) AS posted,
            countIf(toDate(created_time) = {today:Date}) AS barcoded_today
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
        `,
        query_params: { store: HRH_STORE, today },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};
    const barcoded = toNum(k.barcoded);
    const posted = toNum(k.posted);
    const barcodedToday = toNum(k.barcoded_today);
    const postingRate = safeDivide(posted, barcoded) * 100;

    // Publishing Funnel — same canonical population as the KPIs above,
    // plus "Sold": distinct items (of this store's catalogued items) with
    // at least one positive-sale row in xv3.mart_net_sales, joined on the
    // same `ct.item_id` <-> product_id key Product Analytics already uses.
    const soldRows = await (
      await client.query({
        query: `
          SELECT count() AS sold
          FROM (SELECT DISTINCT product_id FROM xv3.mart_level_of_inventory WHERE store_name = {store:String} AND product_id IS NOT NULL) inv
          WHERE inv.product_id IN (
            SELECT DISTINCT \`ct.item_id\` FROM xv3.mart_net_sales
            WHERE store_name = {store:String} AND net_sales_amount > 0 AND \`ct.item_id\` IS NOT NULL
          )
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const sold = toNum(soldRows[0]?.sold);
    // Of the items actually posted (visible to buyers), what share have
    // sold at least once — the funnel's own second drop-off, expressed as
    // a rate to pair naturally with Posting Rate (the first drop-off).
    const soldRate = safeDivide(sold, posted) * 100;

    // Product table — capped at 500 (safety net, not a "top N"
    // truncation), same pattern as every other api/hrh-*.js detail table;
    // the frontend paginates the full list it receives. Sorted by SRP
    // value descending so the highest-value unposted/posted items surface
    // first rather than an arbitrary DB order.
    const productRows = await (
      await client.query({
        query: `
          SELECT
            product_name,
            category_name,
            item_qty,
            total_current_srp,
            cms_hmrph_posting_quantity,
            coalesce(nullIf(inventory_aging, ''), 'Unknown') AS aging_bucket
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
          ORDER BY total_current_srp DESC
          LIMIT 500
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const productTable = productRows.map((r) => ({
      product: r.product_name || "—",
      category: r.category_name || "Uncategorized",
      units: toNum(r.item_qty),
      stockValue: toNum(r.total_current_srp),
      postedQty: toNum(r.cms_hmrph_posting_quantity),
      aging: r.aging_bucket,
      status: toNum(r.cms_hmrph_posting_quantity) > 0 ? "Posted" : "Unposted",
    }));

    // Oldest Unposted Items — deliberately scoped to item_qty > 0. Verified
    // first: of the 7,179 "unposted" rows, only 704 actually have physical
    // stock on hand; the other 6,475 are zero-stock records (some dating
    // back to 2018) with nothing to post in the first place. Without this
    // filter, this list would be dominated by ancient dead records instead
    // of the genuinely actionable backlog a merchandiser could actually go
    // post today.
    const oldestUnpostedRows = await (
      await client.query({
        query: `
          SELECT product_name, category_name, supplier_name, item_qty, total_current_srp, date_received
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
            AND cms_hmrph_posting_quantity <= 0
            AND item_qty > 0
            AND date_received IS NOT NULL
          ORDER BY date_received ASC
          LIMIT 50
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const oldestUnposted = oldestUnpostedRows.map((r) => ({
      product: r.product_name || "—",
      category: r.category_name || "Uncategorized",
      supplier: r.supplier_name || "Unknown",
      units: toNum(r.item_qty),
      stockValue: toNum(r.total_current_srp),
      daysWaiting: r.date_received ? Math.round((Date.now() - new Date(r.date_received).getTime()) / 86400000) : null,
    }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        snapshotNote:
          "Live inventory/posting snapshot for HRH Online — not affected by the Date Range or Channel filter above, since xv3.mart_level_of_inventory has no transaction date or sales-channel dimension.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        barcodedItems: { value: barcoded },
        postedItems: { value: posted },
        postingRate: { value: postingRate },
        barcodedToday: { value: barcodedToday },
        soldRate: { value: soldRate },
      },
      publishingFunnel: [
        { label: "Barcoded", value: barcoded },
        { label: "Posted", value: posted },
        { label: "Sold", value: sold },
      ],
      productTable,
      oldestUnposted,
    });
  } catch (err) {
    console.error("HRH Barcode Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Barcode Analytics data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
