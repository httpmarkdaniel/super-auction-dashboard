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
// api/hrh-sales-analytics.js dispatches here on `?report=markdownAnalytics`.
//
// A live INVENTORY snapshot, not a sales-over-time report — same
// xv3.mart_level_of_inventory contract as api/_hrh-inventory-aging.js, so
// this also ignores the page's Date Range/Channel filter and always
// answers "as of right now" for HRH Online.
//
// The mock this replaces was flagged "price history integration pending" —
// but original_price (the pre-markdown price) vs current_srp (today's
// price) turned out to already be real, populated fields on THIS table
// (99.8%/97.3% coverage), so a markdown % is computable without any price
// history at all: 1,345 of 12,101 HRH Online rows have original_price >
// current_srp today. What's genuinely NOT computable without real price
// history is a PRE-markdown vs POST-markdown GMV comparison (the mock's
// "Markdown Performance" panel) — there's no timestamp marking when a
// price changed, and total_sold_amount is a lifetime cumulative figure
// with no way to split it into "sold before this markdown" vs "sold
// after". That panel is replaced below with Marked-Down Items by
// Category (a real, computable breakdown) instead.
const HRH_STORE = "HRH ONLINE";
const MARKED_DOWN = "original_price IS NOT NULL AND current_srp IS NOT NULL AND original_price > current_srp";
const AGED = "inventory_aging IN ('61-90','91-120','121+')";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function handleMarkdownAnalytics(req, res) {
  try {
    // Scoped to item_qty > 0 throughout — same "genuinely on hand"
    // population as Inventory Aging/Barcode Analytics, so markdowns on
    // zero-stock ghost records don't dilute these numbers.
    //
    // "Aged + Marked + Unsold" = marked down AND aged 61+ days AND never
    // sold — genuinely dead discounted stock, not just "on sale right now".
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            countIf(${MARKED_DOWN}) AS items_marked_down,
            avgIf((original_price - current_srp) / nullIf(original_price, 0) * 100, ${MARKED_DOWN}) AS avg_markdown_pct,
            sumIf(total_sold_amount, ${MARKED_DOWN}) AS marked_down_gmv,
            countIf(${MARKED_DOWN} AND ${AGED} AND total_qty_sold = 0) AS aged_marked_unsold
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};

    // Markdown Depth Distribution — same bucket scheme the mock already
    // had, now populated from the real per-item markdown %.
    const DEPTH_BUCKETS = [
      { label: "1-10%", key: "b1", where: "markdown_pct > 0 AND markdown_pct <= 10" },
      { label: "11-20%", key: "b2", where: "markdown_pct > 10 AND markdown_pct <= 20" },
      { label: "21-30%", key: "b3", where: "markdown_pct > 20 AND markdown_pct <= 30" },
      { label: "31-40%", key: "b4", where: "markdown_pct > 30 AND markdown_pct <= 40" },
      { label: "41%+", key: "b5", where: "markdown_pct > 40" },
    ];
    const depthRows = await (
      await client.query({
        query: `
          SELECT
            ${DEPTH_BUCKETS.map((b) => `countIf(${b.where}) AS ${b.key}`).join(", ")}
          FROM (
            SELECT (original_price - current_srp) / nullIf(original_price, 0) * 100 AS markdown_pct
            FROM xv3.mart_level_of_inventory
            WHERE store_name = {store:String} AND item_qty > 0 AND ${MARKED_DOWN}
          )
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const depthRow = depthRows[0] || {};
    const markdownDepthDistribution = DEPTH_BUCKETS.map((b) => ({ label: b.label, value: toNum(depthRow[b.key]) }));

    // Marked-Down Items by Category — replaces the mock's "Markdown
    // Performance (pre vs post GMV)" panel, which isn't computable (see
    // file header comment). Top 8 categories by marked-down item count.
    const categoryCountRows = await (
      await client.query({
        query: `
          SELECT coalesce(nullIf(category_name, ''), 'Uncategorized') AS category, count() AS n
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0 AND ${MARKED_DOWN}
          GROUP BY category
          ORDER BY n DESC
          LIMIT 8
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const markedDownByCategory = categoryCountRows.map((r) => ({ label: r.category, value: toNum(r.n) }));

    // Aged Inventory vs Markdown Value (by category) — real comparison of
    // two independently-computable value totals per category: how much
    // aged (61+ day) stock value there is vs how much marked-down stock
    // value, side by side. Top 8 categories by aged value.
    const agedVsMarkdownRows = await (
      await client.query({
        query: `
          SELECT
            coalesce(nullIf(category_name, ''), 'Uncategorized') AS category,
            sumIf(total_current_srp, ${AGED}) AS aged_value,
            sumIf(total_current_srp, ${MARKED_DOWN}) AS markdown_value
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0
          GROUP BY category
          ORDER BY aged_value DESC
          LIMIT 8
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const agedVsMarkdown = agedVsMarkdownRows.map((r) => ({
      label: r.category,
      agedValue: toNum(r.aged_value),
      markedDownValue: toNum(r.markdown_value),
    }));

    // Markdown Products — every marked-down item_qty > 0 row (571 total,
    // comfortably under this 1000 safety cap), sorted by current stock
    // value descending. Status flags the "Aged + Marked + Unsold" subset
    // (same population as that KPI) vs everything else still just
    // actively marked down.
    const productRows = await (
      await client.query({
        query: `
          SELECT
            product_name,
            category_name,
            item_qty,
            total_current_srp,
            date_received,
            total_qty_sold,
            inventory_aging,
            (original_price - current_srp) / nullIf(original_price, 0) * 100 AS markdown_pct
          FROM xv3.mart_level_of_inventory
          WHERE store_name = {store:String} AND item_qty > 0 AND ${MARKED_DOWN}
          ORDER BY total_current_srp DESC
          LIMIT 1000
        `,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();
    const markdownProductTable = productRows.map((r) => ({
      product: r.product_name || "—",
      category: r.category_name || "Uncategorized",
      markdownPct: Math.round(toNum(r.markdown_pct) * 10) / 10,
      ageDays: r.date_received ? Math.round((Date.now() - new Date(r.date_received).getTime()) / 86400000) : null,
      units: toNum(r.item_qty),
      value: toNum(r.total_current_srp),
      status: ["61-90", "91-120", "121+"].includes(r.inventory_aging) && toNum(r.total_qty_sold) === 0 ? "Aged & Unsold" : "Marked Down",
    }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        snapshotNote:
          "Live inventory snapshot for HRH Online — not affected by the Date Range or Channel filter above, since xv3.mart_level_of_inventory has no transaction date or sales-channel dimension.",
        markdownNote: "Markdown % is original_price vs current_srp as of right now — there's no price-change timestamp, so a pre/post-markdown GMV comparison isn't computable.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        itemsMarkedDown: { value: toNum(k.items_marked_down) },
        avgMarkdownPct: { value: toNum(k.avg_markdown_pct) },
        markedDownGmv: { value: toNum(k.marked_down_gmv) },
        agedMarkedUnsold: { value: toNum(k.aged_marked_unsold) },
      },
      markdownDepthDistribution,
      markedDownByCategory,
      agedVsMarkdown,
      markdownProductTable,
    });
  } catch (err) {
    console.error("HRH Markdown Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Markdown Analytics data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
