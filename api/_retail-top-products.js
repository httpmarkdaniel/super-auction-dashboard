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
function safeDivide(a, b) {
  return b ? a / b : 0;
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
function mondayOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
function firstOfMonthISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
// Dashboard-wide Date Range filter, current window only — used by the
// Category subview only (handleCategoryView). The Item subview
// (handleItemView) deliberately stays fixed to This Week vs Last Week
// regardless of this filter — see that function's own comment (the
// reference report's "This Week vs Last Week" framing has no MTD/
// arbitrary-range equivalent). See api/_retail-sales-overview.js's
// resolveRange for the full comment on each preset.
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    return { from: fromParam <= toParam ? fromParam : toParam, to: fromParam <= toParam ? toParam : fromParam };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  }
  if (range === "prevMonth") {
    const to = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(to), to };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today };
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}
function resolveStores(segmentStores, storeParam) {
  if (storeParam && segmentStores.includes(storeParam)) return [storeParam];
  return segmentStores;
}

async function stockStatusFor(productNames, stores) {
  if (!productNames.length) return new Map();
  const rows = await client
    .query({
      query: `
        SELECT product_name, store_name, sum(item_qty) AS qty
        FROM xv3.mart_level_of_inventory
        WHERE product_name IN {names:Array(String)} AND store_name IN {stores:Array(String)}
        GROUP BY product_name, store_name
        HAVING qty > 0
      `,
      query_params: { names: productNames, stores },
      format: "JSONEachRow",
    })
    .then((r) => r.json());
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.product_name)) byProduct.set(r.product_name, []);
    byProduct.get(r.product_name).push(`${r.store_name}(${toNum(r.qty)})`);
  }
  return byProduct;
}

async function handleItemView(req, res, stores) {
  const today = manilaTodayISODate();
  const thisWeekMonday = mondayOfWeek(today);
  const thisWeek = { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  const lastWeek = { from: addDaysISO(thisWeek.from, -7), to: addDaysISO(thisWeek.to, -7) };
  const fourWeeksAgo = addDaysISO(thisWeek.from, -21);

  const [wowRows, fourWeekRows] = await Promise.all([
    // This Week vs Last Week — per product, for Top Movers + Dropped.
    client
      .query({
        query: `
          SELECT product_name, department_name,
            sumIf(net_sales_amount, transaction_date BETWEEN {twFrom:String} AND {twTo:String}) AS tw,
            sumIf(net_quantity, transaction_date BETWEEN {twFrom:String} AND {twTo:String}) AS twq,
            sumIf(net_sales_amount, transaction_date BETWEEN {lwFrom:String} AND {lwTo:String}) AS lw,
            sumIf(net_quantity, transaction_date BETWEEN {lwFrom:String} AND {lwTo:String}) AS lwq,
            groupUniqArray(store_name) AS stores_sold
          FROM xv3.mart_net_sales
          WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {lwFrom:String} AND {twTo:String}
          GROUP BY product_name, department_name
          HAVING tw != 0 OR lw != 0
        `,
        query_params: { stores, twFrom: thisWeek.from, twTo: thisWeek.to, lwFrom: lastWeek.from, lwTo: lastWeek.to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // Last 4 full weeks — per product per week, for Repeat Sellers.
    client
      .query({
        query: `
          SELECT product_name, department_name, toMonday(transaction_date) AS weekStart,
            sum(net_sales_amount) AS revenue, sum(net_quantity) AS qty
          FROM xv3.mart_net_sales
          WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY product_name, department_name, weekStart
        `,
        query_params: { stores, from: fourWeeksAgo, to: thisWeek.to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);

  const topMoversAll = wowRows
    .map((r) => ({
      product: r.product_name,
      department: r.department_name || "Uncategorized",
      tw: toNum(r.tw),
      twq: toNum(r.twq),
      lw: toNum(r.lw),
      lwq: toNum(r.lwq),
      stores: (r.stores_sold || []).join(", "),
      isNew: toNum(r.lw) === 0,
    }))
    .sort((a, b) => b.tw - a.tw);
  const topMovers = topMoversAll.filter((p) => p.tw > 0).slice(0, 10);

  const dropped = topMoversAll
    .filter((p) => p.lw > 0 && p.tw === 0)
    .sort((a, b) => b.lw - a.lw)
    .slice(0, 10);

  const byProductWeek = new Map();
  for (const r of fourWeekRows) {
    const key = r.product_name;
    if (!byProductWeek.has(key)) byProductWeek.set(key, { product: key, department: r.department_name || "Uncategorized", weeks: new Map() });
    byProductWeek.get(key).weeks.set(String(r.weekStart).slice(0, 10), { revenue: toNum(r.revenue), qty: toNum(r.qty) });
  }
  const weekStarts = [3, 2, 1, 0].map((n) => addDaysISO(thisWeek.from, -7 * n));
  const repeatSellersAll = Array.from(byProductWeek.values())
    .filter((p) => weekStarts.every((w) => p.weeks.has(w) && p.weeks.get(w).revenue > 0))
    .map((p) => ({
      product: p.product,
      department: p.department,
      weeks: weekStarts.map((w) => ({ weekStart: w, weekEnd: addDaysISO(w, 6), ...p.weeks.get(w) })),
    }))
    .sort((a, b) => b.weeks[3].revenue - a.weeks[3].revenue);
  const repeatSellers = repeatSellersAll.slice(0, 10);

  const productsNeedingStock = [...new Set([...topMovers.map((p) => p.product), ...dropped.map((p) => p.product), ...repeatSellers.map((p) => p.product)])];
  const stockByProduct = await stockStatusFor(productsNeedingStock, stores);

  function withStock(p) {
    const stock = stockByProduct.get(p.product);
    return { ...p, stockStatus: stock && stock.length ? "HAS_STOCK" : "SOLD_OUT", stockDetail: stock && stock.length ? stock.join(", ") : "No stock — sold out" };
  }

  return res.status(200).json({
    meta: { thisWeek, lastWeek, weekStarts },
    topMovers: topMovers.map(withStock),
    dropped: dropped.map(withStock),
    repeatSellers: repeatSellers.map((p) => ({ ...p, ...withStock(p) })),
    dataQuality: [
      "Stock status comes from xv3.mart_level_of_inventory's item_qty, summed per product per store — a product with item_qty > 0 anywhere in scope shows as Has Stock with which store(s); otherwise Sold Out.",
      "Repeat Sellers requires real sales in all 4 of the last 4 full Mon-Sun weeks (not just 'at some point') — a stricter bar than Top Movers.",
      "Sales/quantity figures are net of returns/refunds/voids, matching Sales Overview's own headline revenue — verified 2026-09-22.",
    ],
  });
}

async function handleCategoryView(req, res, stores, range, current) {
  const TOP_N = 12;
  const TOP_ITEMS_PER_CATEGORY = 5;

  const [categoryRows, itemRows] = await Promise.all([
    client
      .query({
        query: `
          SELECT category_name, sum(net_sales_amount) AS gmv
          FROM xv3.mart_net_sales
          WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY category_name
          ORDER BY gmv DESC
          LIMIT {topN:UInt8}
        `,
        query_params: { stores, from: current.from, to: current.to, topN: TOP_N },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    client
      .query({
        query: `
          SELECT category_name, product_name, sales, qty, stores_sold FROM (
            SELECT category_name, product_name,
              sum(net_sales_amount) AS sales,
              sum(net_quantity) AS qty,
              groupUniqArray(store_name) AS stores_sold,
              row_number() OVER (PARTITION BY category_name ORDER BY sum(net_sales_amount) DESC) AS rn
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
            GROUP BY category_name, product_name
          )
          WHERE rn <= {topItems:UInt8} AND sales > 0
          ORDER BY category_name, sales DESC
        `,
        query_params: { stores, from: current.from, to: current.to, topItems: TOP_ITEMS_PER_CATEGORY },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);

  const totalGmv = categoryRows.reduce((s, r) => s + toNum(r.gmv), 0);
  const categories = categoryRows.map((r) => ({ category: r.category_name || "Uncategorized", gmv: toNum(r.gmv), sharePct: safeDivide(toNum(r.gmv), totalGmv) * 100 }));

  const itemsByCategory = new Map();
  for (const r of itemRows) {
    const cat = r.category_name || "Uncategorized";
    if (!itemsByCategory.has(cat)) itemsByCategory.set(cat, []);
    itemsByCategory.get(cat).push({ product: r.product_name, sales: toNum(r.sales), qty: toNum(r.qty), stores: (r.stores_sold || []).join(", ") });
  }

  return res.status(200).json({
    meta: { range, current, stores },
    categories,
    itemsByCategory: Object.fromEntries(itemsByCategory),
    dataQuality: [
      "Category GMV is net of returns/refunds/voids, matching Sales Overview's own Top Categories panel — verified 2026-09-22. The top-5-items-per-category drilldown still only shows items with positive net sales.",
    ],
  });
}

// Top Products — Item subtab (Repeat Sellers / Top Movers / Dropped Items,
// always Weekly — the reference report's own "This Week vs Last Week"
// framing doesn't have an MTD equivalent) and Category subtab (top
// categories + top-5-items drilldown, Weekly or MTD). Deliberately stays
// segment-scoped (unlike the reference mock's "always network-wide"
// choice) since this dashboard's segment toggle already covers that same
// need.
export async function handleRetailTopProducts(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const stores = resolveStores(resolveSegment(segment), req.query.store);
    const subview = req.query.subview === "category" ? "category" : "item";

    if (subview === "category") {
      const range = req.query.range || "wtd";
      let current;
      try {
        current = resolveRange(range, req.query.from, req.query.to);
      } catch (rangeErr) {
        return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
      }
      return handleCategoryView(req, res, stores, range, current);
    }
    return handleItemView(req, res, stores);
  } catch (err) {
    console.error("[retail-top-products]", err);
    return res.status(500).json({ error: "Failed to load Retail Top Products data", message: err?.message || "" });
  }
}
