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

export async function handleBarcodeAnalytics(req, res) {
  try {
    // KPIs — "Barcoded Items" is every inventory record for this store
    // (verified: 100% of xv3.mart_level_of_inventory rows already carry a
    // barcode — this table doesn't track pre-barcode items at all, so
    // "barcoded" here really means "catalogued", the earliest state this
    // table can see). "Posted" = has a positive HMRPH CMS posting quantity
    // (same posted/not-posted signal Product Analytics' Dropped Products
    // panel already uses). There is no posted_at timestamp anywhere in
    // this table, so "Avg Barcode -> Post Time" (the original mock KPI)
    // isn't computable as a real duration — replaced with "Avg Days in
    // Backlog", the average age (via date_received) of items that are
    // barcoded but still NOT posted, which answers a closely related, real
    // question ("how stale is the current unposted backlog") instead of a
    // metric with no underlying data.
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            count() AS barcoded,
            countIf(cms_hmrph_posting_quantity > 0) AS posted,
            countIf(cms_hmrph_posting_quantity <= 0) AS unposted,
            avgIf(dateDiff('day', toDate(date_received), today()), cms_hmrph_posting_quantity <= 0 AND date_received IS NOT NULL) AS avg_backlog_days
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};
    const barcoded = toNum(k.barcoded);
    const posted = toNum(k.posted);
    const unposted = toNum(k.unposted);
    const postingRate = safeDivide(posted, barcoded) * 100;
    const avgBacklogDays = toNum(k.avg_backlog_days);

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

    // Posting Performance by Category — HRH Online is a single online
    // store with no physical-branch dimension in this table (unlike the
    // original mock's "by Branch" breakdown, which doesn't have a real
    // equivalent here), so this is grouped by category_name instead — a
    // real, populated dimension that answers the same underlying question
    // ("where is posting strongest/weakest").
    const categoryRows = await (
      await client.query({
        query: `
          SELECT
            coalesce(nullIf(category_name, ''), 'Uncategorized') AS category,
            countIf(cms_hmrph_posting_quantity > 0) AS posted
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String}
          GROUP BY category
          ORDER BY posted DESC
          LIMIT 8
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const postingPerformanceByCategory = categoryRows.map((r) => ({ label: r.category, posted: toNum(r.posted) }));

    // Unposted Backlog Aging — buckets the ALREADY-COMPUTED inventory_aging
    // field (not re-derived from date_received), same categorical buckets
    // Inventory Aging elsewhere in this app already uses, filtered to only
    // the unposted subset (matching this panel's "backlog" framing).
    const AGING_ORDER = ["1-30", "31-60", "61-90", "91-120", "121+", "Unknown"];
    const agingRows = await (
      await client.query({
        query: `
          SELECT coalesce(nullIf(inventory_aging, ''), 'Unknown') AS bucket, count() AS n
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND cms_hmrph_posting_quantity <= 0
          GROUP BY bucket
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const agingMap = new Map(agingRows.map((r) => [r.bucket, toNum(r.n)]));
    const unpostedBacklogAging = AGING_ORDER.map((label) => ({ label, value: agingMap.get(label) || 0 }));

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

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        snapshotNote:
          "Live inventory/posting snapshot for HRH Online — not affected by the Date Range or Channel filter above, since xv3.mart_level_of_inventory has no transaction date or sales-channel dimension.",
        avgBacklogDaysNote:
          "No posting timestamp exists in this data, so this is the average age (from date received) of items still awaiting posting today, not a historical barcode-to-post duration.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        barcodedItems: { value: barcoded },
        postedItems: { value: posted },
        postingRate: { value: postingRate },
        unpostedBacklog: { value: unposted },
        avgBacklogDays: { value: avgBacklogDays },
      },
      publishingFunnel: [
        { label: "Received / Barcoded", value: barcoded },
        { label: "Posted", value: posted },
        { label: "Sold", value: sold },
      ],
      postingPerformanceByCategory,
      unpostedBacklogAging,
      productTable,
    });
  } catch (err) {
    console.error("HRH Barcode Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Barcode Analytics data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
