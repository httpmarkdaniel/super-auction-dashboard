import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See api/_retail-sales-overview.js's own comment for the full writeup —
// verified 2026-09-22 against the business's own YTD query.
const CORE_RETAIL_STORES = [
  "PIONEER",
  "NORTH CALOOCAN",
  "MABALACAT",
  "S AND C CAINTA",
  "HMR TAGAYTAY ROAD",
  "CEBU",
  "HMR SUCAT",
  "SUBIC MAIN",
  "HMR CAGAYAN DE ORO",
  "HMR CUBAO",
  "HARRINGTON PIONEER",
  "HMR BULACAN",
  "MAIN",
];
const WHOLESALE_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];
const HRH_ONLINE_STORE = "HRH ONLINE";
const SEGMENTS = {
  all: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE, ...WHOLESALE_STORES],
  retail: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE],
  wholesale: WHOLESALE_STORES,
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function manilaTodayISODate() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}
function resolveStores(segmentStores, storeParam) {
  if (storeParam && segmentStores.includes(storeParam)) return [storeParam];
  return segmentStores;
}

// Fast/healthy/slow/replenishment-risk classification of a product's
// sell-through velocity vs. its current stock coverage. Fixed, documented
// thresholds — not a judgment call the query varies by product:
//   Replenishment Risk: selling >=2 units/day AND <=10 days of cover left.
//   Fast Moving: selling >=2 units/day with 11-45 days of cover.
//   Slow Moving: selling <0.5 units/day, OR >=90 days of cover.
//   Healthy: everything else (moderate velocity, moderate coverage).
export function classifyVelocity(avgDailySales, daysOfSupply) {
  if (avgDailySales >= 2 && daysOfSupply <= 10) return "Replenishment Risk";
  if (avgDailySales >= 2 && daysOfSupply <= 45) return "Fast Moving";
  if (avgDailySales < 0.5 || daysOfSupply >= 90) return "Slow Moving";
  return "Healthy";
}
const VELOCITY_ACTION = {
  "Replenishment Risk": "Reorder immediately — high stockout risk",
  "Fast Moving": "Monitor closely; consider a larger reorder qty",
  "Slow Moving": "Review for markdown or promotion",
  Healthy: "No action needed — coverage is balanced",
};

const TOP_N = 40;

// Computes the velocity table for a resolved `stores` list — exported so
// api/_retail-needs-attention.js can reuse the exact same classification
// (e.g. its Replenishment Risk product flags) without a second, possibly
// drifting implementation of this math.
export async function computeProductVelocity(stores) {
  const today = manilaTodayISODate();
  const from = addDaysISO(today, -29); // 30-day trailing window, inclusive.

  const salesRows = await client
    .query({
      query: `
        SELECT product_name, department_name,
          sumIf(net_sales_amount, net_sales_amount > 0) AS sales_value,
          sumIf(net_quantity, net_sales_amount > 0) AS units
        FROM xv3.mart_net_sales
        WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {today:String} AND net_sales_amount > 0
        GROUP BY product_name, department_name
        HAVING sales_value > 0
        ORDER BY sales_value DESC
        LIMIT {topN:UInt16}
      `,
      query_params: { stores, from, today, topN: TOP_N },
      format: "JSONEachRow",
    })
    .then((r) => r.json());

  const names = salesRows.map((r) => r.product_name);
  const stockRows = names.length
    ? await client
        .query({
          query: `SELECT product_name, sum(item_qty) AS qty FROM xv3.mart_level_of_inventory WHERE store_name IN {stores:Array(String)} AND product_name IN {names:Array(String)} GROUP BY product_name`,
          query_params: { stores, names },
          format: "JSONEachRow",
        })
        .then((r) => r.json())
    : [];
  const stockByProduct = new Map(stockRows.map((r) => [r.product_name, toNum(r.qty)]));

  const items = salesRows.map((r) => {
    const currentStock = Math.max(0, stockByProduct.get(r.product_name) || 0);
    const unitsSold30d = toNum(r.units);
    const salesValue = toNum(r.sales_value);
    const avgDailySales = unitsSold30d / 30;
    // null (not Infinity — JSON.stringify silently turns Infinity into
    // null anyway, so this makes that explicit) when there's stock but no
    // sales in the window to compute a rate from. classifyVelocity below
    // still classifies this correctly as Slow Moving via avgDailySales
    // alone, without needing a numeric days-of-supply value.
    const daysOfSupply = avgDailySales > 0 ? currentStock / avgDailySales : currentStock > 0 ? null : 0;
    const status = classifyVelocity(avgDailySales, daysOfSupply ?? Infinity);
    return {
      product: r.product_name,
      category: r.department_name || "Uncategorized",
      currentStock,
      unitsSold30d,
      avgDailySales,
      daysOfSupply,
      salesValue,
      status,
      action: VELOCITY_ACTION[status],
    };
  });

  return { from, to: today, items };
}

// Product Velocity Analysis — fast/healthy/slow/replenishment-risk
// classification over the top 40 products by sales value in the trailing
// 30 days. Fixed 30-day window, independent of the dashboard-wide Date
// Range filter — same "always current trailing window" convention as
// Stocks and Top Products' own Item subview.
export async function handleRetailProductVelocity(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const stores = resolveStores(resolveSegment(segment), req.query.store);
    const { from, to, items } = await computeProductVelocity(stores);

    return res.status(200).json({
      meta: { segment, store: req.query.store || "", stores, from, to },
      items,
      dataQuality: [
        `Trailing 30-day window (${from} to ${to}), independent of the dashboard-wide Date Range filter — same convention as Stocks and Top Products' own Item subview.`,
        `Limited to the top ${TOP_N} products by 30-day sales value, to keep this a reviewable list rather than the full catalog.`,
        "Days of Supply = current on-hand qty ÷ average daily units sold (last 30 days). A product with sales but zero current stock shows 0 days of supply (Replenishment Risk); a product with stock but no sales in 30 days shows as Slow Moving rather than a fabricated infinite number.",
      ],
    });
  } catch (err) {
    console.error("[retail-product-velocity]", err);
    return res.status(500).json({ error: "Failed to load Retail Product Velocity data", message: err?.message || "" });
  }
}
