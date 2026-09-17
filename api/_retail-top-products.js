import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See src/retail/stores.js for the full investigation writeup. Duplicated
// per this dashboard's per-file store/date-helper convention.
const ALL_RETAIL_STORES = [
  "PIONEER",
  "NORTH CALOOCAN",
  "MABALACAT",
  "S AND C CAINTA",
  "HMR TAGAYTAY ROAD",
  "CEBU",
  "HMR SUCAT",
  "SUBIC MAIN",
  "HMR CAGAYAN DE ORO",
  "HPI CANLUBANG",
  "ENVIROCYCLE",
];
const ALL_STORES_OPTION = "All Stores";

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
function mondayOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
function firstOfMonthISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { current: { from, to } };
  }
  if (range === "mtd") return { current: { from: firstOfMonthISO(today), to: today } };
  if (range === "ytd") return { current: { from: `${today.slice(0, 4)}-01-01`, to: today } };
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { current: { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) } };
  }
  if (range === "prevMonth") {
    const lastDayPrevMonth = addDaysISO(firstOfMonthISO(today), -1);
    return { current: { from: firstOfMonthISO(lastDayPrevMonth), to: lastDayPrevMonth } };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { current: { from: `${y}-01-01`, to: `${y}-12-31` } };
  }
  return { current: { from: mondayOfWeek(today), to: today } }; // wtd (default)
}
function resolveStoreScope(store) {
  if (!store || store === ALL_STORES_OPTION) return { stores: ALL_RETAIL_STORES };
  if (!ALL_RETAIL_STORES.includes(store)) return null;
  return { stores: [store] };
}

const TOP_N = 50;

export async function handleRetailTopProducts(req, res) {
  try {
    const { store = ALL_STORES_OPTION, from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const sortBy = req.query.sortBy === "units" ? "units" : "gmv";

    const scope = resolveStoreScope(store);
    if (!scope) return res.status(400).json({ error: "Invalid store", message: `Unknown store: ${store}` });
    const { stores } = scope;

    let current;
    try {
      ({ current } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    // Top products by GMV and by Units — 2 independent queries (different
    // ORDER BY/LIMIT, cheap to run both rather than re-fetch on toggle) —
    // ~14K distinct products in a typical 2-week/11-store window, so this
    // GROUP BY + ORDER BY + LIMIT is the right shape (not a full distinct
    // list) rather than pulling everything client-side.
    const [byGmvRows, byUnitsRows, deptCoverageRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT product_name, department_name, category_name,
              sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
              sumIf(net_quantity, net_sales_amount > 0) AS units,
              uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND net_sales_amount > 0
            GROUP BY product_name, department_name, category_name
            ORDER BY gmv DESC
            LIMIT {topN:UInt16}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, topN: TOP_N },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT product_name, department_name, category_name,
              sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
              sumIf(net_quantity, net_sales_amount > 0) AS units,
              uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND net_sales_amount > 0
            GROUP BY product_name, department_name, category_name
            ORDER BY units DESC
            LIMIT {topN:UInt16}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, topN: TOP_N },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT count(DISTINCT product_name) AS products, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    function mapProduct(r) {
      return {
        product: r.product_name || "Unknown",
        department: r.department_name || "Uncategorized",
        category: r.category_name || "Uncategorized",
        gmv: toNum(r.gmv),
        units: toNum(r.units),
        transactions: toNum(r.transactions),
      };
    }

    return res.status(200).json({
      meta: { current, stores, sortBy },
      kpis: {
        distinctProducts: { value: toNum(deptCoverageRows[0]?.products) },
        topProduct: byGmvRows[0] ? { product: byGmvRows[0].product_name, gmv: toNum(byGmvRows[0].gmv) } : null,
      },
      topByGmv: byGmvRows.map(mapProduct),
      topByUnits: byUnitsRows.map(mapProduct),
      dataQuality: [
        `Top ${TOP_N} products only, by gross sales value and by units sold separately — not a full distinct-product list (there are typically 10,000+ distinct products in even a 2-week window across 11 stores).`,
      ],
    });
  } catch (err) {
    console.error("[retail-top-products]", err);
    return res.status(500).json({ error: "Failed to load Retail Top Products data", message: err?.message || "" });
  }
}
