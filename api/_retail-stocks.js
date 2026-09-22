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
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}
function resolveStores(segmentStores, storeParam) {
  if (storeParam && segmentStores.includes(storeParam)) return [storeParam];
  return segmentStores;
}

// On-Hand Stock — a live current-inventory snapshot (item_qty right now),
// same source/columns as Sales Overview's own "Inventory Overview" tile
// (xv3.mart_level_of_inventory: item_qty, current_srp) and the identical
// pattern already used for HRH Online's own Stocks tab
// (api/_hrh-barcode-analytics.js's computeOnHandStock) — just scoped to
// this dashboard-wide segment/store filter instead of HRH_STORE alone, and
// with no Date Range dependency at all (a snapshot is "right now", never
// "as of the selected period" — same convention as every other point-in-
// time inventory figure in this codebase).
export async function handleRetailStocks(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const stores = resolveStores(resolveSegment(segment), req.query.store);

    const rows = await client
      .query({
        query: `
          SELECT
            product_name,
            sum(item_qty) AS qty,
            sum(item_qty * current_srp) AS stock_value
          FROM xv3.mart_level_of_inventory
          WHERE store_name IN {stores:Array(String)} AND item_qty > 0
          GROUP BY product_name
          HAVING qty > 0
          ORDER BY stock_value DESC
        `,
        query_params: { stores },
        format: "JSONEachRow",
      })
      .then((r) => r.json());

    const items = rows.map((r) => ({ product: r.product_name, qty: toNum(r.qty), stockValue: toNum(r.stock_value) }));
    const totals = items.reduce((acc, r) => ({ qty: acc.qty + r.qty, stockValue: acc.stockValue + r.stockValue }), { qty: 0, stockValue: 0 });

    return res.status(200).json({
      meta: { segment, store: req.query.store || "", stores },
      items,
      totals,
      dataQuality: [
        "Live current inventory snapshot (item_qty right now) from xv3.mart_level_of_inventory — not affected by the Date Range filter above, same convention as every other point-in-time inventory figure on this dashboard.",
      ],
    });
  } catch (err) {
    console.error("[retail-stocks]", err);
    return res.status(500).json({ error: "Failed to load Retail Stocks data", message: err?.message || "" });
  }
}
