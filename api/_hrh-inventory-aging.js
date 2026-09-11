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
// api/hrh-sales-analytics.js dispatches here on `?report=inventoryAging`.
//
// A live INVENTORY snapshot, not a sales-over-time report — same
// xv3.mart_level_of_inventory contract as api/_hrh-barcode-analytics.js, so
// this also ignores the page's Date Range/Channel filter (no transaction
// date or sales_channel dimension in this table) and always answers "as of
// right now" for HRH Online. Unlike Barcode Analytics, this is NOT scoped
// to posted/unposted — aging is a broader "how long has this stock sat
// here" question independent of whether it's been posted for sale yet.
const HRH_STORE = "HRH ONLINE";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function handleInventoryAging(req, res) {
  try {
    // Scoped to item_qty > 0 throughout this endpoint — same "genuinely on
    // hand" population api/_hrh-barcode-analytics.js's Oldest Unposted Items
    // uses, for the same reason: xv3.mart_level_of_inventory carries
    // thousands of zero-stock ghost records (some dating back to 2019),
    // and an aging metric over those would just measure how long dead
    // records have existed in the table, not real inventory risk.
    //
    // Slow-Moving vs Non-Moving — real thresholds, replacing the mock's
    // "Threshold definition pending" placeholder. Population: item_qty > 0
    // AND inventory_aging in (61-90, 91-120, 121+) — 61+ days old, past the
    // point where "hasn't sold yet" is still just normal turnover time.
    // Within that: Non-Moving = total_qty_sold = 0 (zero sales ever, despite
    // sitting 61+ days) — genuinely dead stock. Slow-Moving = total_qty_sold
    // > 0 — it has sold before, just not fast enough to clear a 61+ day-old
    // batch. Verified real, meaningful split: 4,787 non-moving SKUs (₱17.2M)
    // vs 751 slow-moving SKUs (₱3.7M) for HRH Online.
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            countIf(total_qty_sold = 0) AS non_moving_skus,
            sumIf(total_current_srp, total_qty_sold = 0) AS non_moving_value,
            countIf(total_qty_sold > 0) AS slow_moving_skus,
            sumIf(total_current_srp, total_qty_sold > 0) AS slow_moving_value
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0 AND inventory_aging IN ('61-90','91-120','121+')
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};

    // Top 10 Slow-Moving / Non-Moving Items by Value — same 61+ day, real-
    // stock population as the KPIs above, split the same way (sold before
    // vs never sold). Fetched pre-sorted both ways (by value and by qty)
    // so the frontend's Value/Qty toggle just swaps which array it shows,
    // rather than re-querying on toggle.
    const topItemsQuery = (extraWhere, orderBy) => ({
      query: `
        SELECT product_name, category_name, item_qty, total_current_srp
        FROM xv3.mart_level_of_inventory
        WHERE store_name = {store:String} AND item_qty > 0 AND inventory_aging IN ('61-90','91-120','121+') AND ${extraWhere}
        ORDER BY ${orderBy} DESC
        LIMIT 10
      `,
      query_params: { store: HRH_STORE },
      format: "JSONEachRow",
    });
    const mapTopItems = (rows) =>
      rows.map((r) => ({
        product: r.product_name || "—",
        category: r.category_name || "Uncategorized",
        units: toNum(r.item_qty),
        value: toNum(r.total_current_srp),
      }));

    const [slowByValue, slowByQty, nonByValue, nonByQty] = await Promise.all([
      client.query(topItemsQuery("total_qty_sold > 0", "total_current_srp")).then((r) => r.json()),
      client.query(topItemsQuery("total_qty_sold > 0", "item_qty")).then((r) => r.json()),
      client.query(topItemsQuery("total_qty_sold = 0", "total_current_srp")).then((r) => r.json()),
      client.query(topItemsQuery("total_qty_sold = 0", "item_qty")).then((r) => r.json()),
    ]);
    const topSlowMovingItemsByValue = mapTopItems(slowByValue);
    const topSlowMovingItemsByQty = mapTopItems(slowByQty);
    const topNonMovingItemsByValue = mapTopItems(nonByValue);
    const topNonMovingItemsByQty = mapTopItems(nonByQty);

    // Aged Inventory Value by Category — same 61+ day population as the
    // KPIs, top 8 categories by value.
    const categoryRows = await (
      await client.query({
        query: `
          SELECT coalesce(nullIf(category_name, ''), 'Uncategorized') AS category, sum(total_current_srp) AS value
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0 AND inventory_aging IN ('61-90','91-120','121+')
          GROUP BY category
          ORDER BY value DESC
          LIMIT 8
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const agedByCategory = categoryRows.map((r) => ({ label: r.category, value: toNum(r.value) }));

    // Aged Inventory Value by Supplier — same population, top 8 suppliers
    // by value. Verified coverage first (100%, 5,538 of 5,538 rows).
    const supplierRows = await (
      await client.query({
        query: `
          SELECT coalesce(nullIf(supplier_name, ''), 'Unknown') AS supplier, sum(total_current_srp) AS value
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0 AND inventory_aging IN ('61-90','91-120','121+')
          GROUP BY supplier
          ORDER BY value DESC
          LIMIT 8
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const agedBySupplier = supplierRows.map((r) => ({ label: r.supplier, value: toNum(r.value) }));

    // Oldest Inventory — every item_qty > 0 row with a real date_received
    // (100% coverage on that population), oldest first, ties broken by SRP
    // value descending so the highest-value old stock surfaces first among
    // same-age items.
    const oldestRows = await (
      await client.query({
        query: `
          SELECT product_name, category_name, item_qty, total_current_srp, date_received, total_qty_sold
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0 AND date_received IS NOT NULL
          ORDER BY date_received ASC, total_current_srp DESC
          LIMIT 50
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const oldestInventoryTable = oldestRows.map((r) => ({
      product: r.product_name || "—",
      category: r.category_name || "Uncategorized",
      ageDays: r.date_received ? Math.round((Date.now() - new Date(r.date_received).getTime()) / 86400000) : null,
      units: toNum(r.item_qty),
      value: toNum(r.total_current_srp),
      status: toNum(r.total_qty_sold) === 0 ? "Non-Moving" : "Slow-Moving",
    }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        snapshotNote:
          "Live inventory snapshot for HRH Online — not affected by the Date Range or Channel filter above, since xv3.mart_level_of_inventory has no transaction date or sales-channel dimension.",
        thresholdNote: "Slow-Moving / Non-Moving are scoped to items aged 61+ days with real stock on hand (item_qty > 0).",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        slowMovingSkus: { value: toNum(k.slow_moving_skus) },
        slowMovingValue: { value: toNum(k.slow_moving_value) },
        nonMovingSkus: { value: toNum(k.non_moving_skus) },
        nonMovingValue: { value: toNum(k.non_moving_value) },
      },
      topSlowMovingItemsByValue,
      topSlowMovingItemsByQty,
      topNonMovingItemsByValue,
      topNonMovingItemsByQty,
      agedByCategory,
      agedBySupplier,
      oldestInventoryTable,
    });
  } catch (err) {
    console.error("HRH Inventory Aging API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Inventory Aging data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
