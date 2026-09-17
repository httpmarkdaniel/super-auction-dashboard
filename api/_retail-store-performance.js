import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See src/retail/stores.js for the full investigation writeup. Duplicated
// per this dashboard's per-file store/date-helper convention.
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
];
const NO_FOOT_TRAFFIC_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];
const ALL_RETAIL_STORES = [...CORE_RETAIL_STORES, ...NO_FOOT_TRAFFIC_STORES];
const ALL_STORES_OPTION = "All Stores";

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
  if (!store || store === ALL_STORES_OPTION) return { stores: ALL_RETAIL_STORES, coreStores: CORE_RETAIL_STORES };
  if (!ALL_RETAIL_STORES.includes(store)) return null;
  return { stores: [store], coreStores: CORE_RETAIL_STORES.includes(store) ? [store] : [] };
}

// This page's whole purpose is cross-store comparison — Attainment by
// Store and Foot Traffic/Conversion by Store ALWAYS show all 11 (or all 9
// core) branches regardless of the page's own Store filter (same "always
// show the full breakdown" convention as Sales Analytics' Sales by Store —
// see that file's comment). The Store Detail table and daily trend below
// them DO respect the filter, for a per-store drill-down when one is
// selected.
export async function handleRetailStorePerformance(req, res) {
  try {
    const { store = ALL_STORES_OPTION, from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    const scope = resolveStoreScope(store);
    if (!scope) return res.status(400).json({ error: "Invalid store", message: `Unknown store: ${store}` });
    const { stores, coreStores } = scope;

    let current;
    try {
      ({ current } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const [salesByStoreRows, targetByStoreRows, trafficByStoreRows, dailyRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT store_name, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv, sum(net_sales_amount) AS nmv, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {allStores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { allStores: ALL_RETAIL_STORES, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT store_name, sum(daily_target) AS target
            FROM xv3.mart_sales_target
            WHERE store_name IN {allStores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { allStores: ALL_RETAIL_STORES, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT store_name, sum(traffic_count) AS traffic
            FROM xv3.mart_foot_traffic_masterlist
            WHERE store_name IN {coreStores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { coreStores: CORE_RETAIL_STORES, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Daily Sales vs Target for the SELECTED store scope (respects the
      // page's Store filter) — the drill-down trend beneath the always-all
      // comparison bars above.
      client
        .query({
          query: `
            SELECT s.date AS d, s.gmv AS gmv, t.target AS target
            FROM (
              SELECT transaction_date AS date, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
              FROM xv3.mart_net_sales
              WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              GROUP BY transaction_date
            ) s
            FULL OUTER JOIN (
              SELECT date, sum(daily_target) AS target
              FROM xv3.mart_sales_target
              WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}
              GROUP BY date
            ) t ON s.date = t.date
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const targetByStore = new Map(targetByStoreRows.map((r) => [r.store_name, toNum(r.target)]));
    const trafficByStore = new Map(trafficByStoreRows.map((r) => [r.store_name, toNum(r.traffic)]));

    const allStoreDetail = salesByStoreRows
      .map((r) => {
        const storeName = r.store_name;
        const gmv = toNum(r.gmv);
        const nmv = toNum(r.nmv);
        const transactions = toNum(r.transactions);
        const target = targetByStore.get(storeName) || 0;
        const hasFootTraffic = CORE_RETAIL_STORES.includes(storeName);
        const footTraffic = hasFootTraffic ? trafficByStore.get(storeName) || 0 : null;
        return {
          store: storeName,
          gmv,
          nmv,
          transactions,
          avgBasket: safeDivide(nmv, transactions),
          target,
          attainmentPct: target > 0 ? safeDivide(gmv, target) * 100 : null,
          footTraffic,
          conversionRatePct: footTraffic ? safeDivide(transactions, footTraffic) * 100 : null,
        };
      })
      .sort((a, b) => b.gmv - a.gmv);

    const attainmentByStore = allStoreDetail
      .filter((r) => r.attainmentPct !== null)
      .map((r) => ({ store: r.store, attainmentPct: r.attainmentPct }))
      .sort((a, b) => b.attainmentPct - a.attainmentPct);

    const trafficConversionByStore = allStoreDetail
      .filter((r) => r.footTraffic !== null)
      .map((r) => ({ store: r.store, footTraffic: r.footTraffic, conversionRatePct: r.conversionRatePct }))
      .sort((a, b) => b.footTraffic - a.footTraffic);

    // Store Detail table respects the page's own Store filter (unlike the
    // two always-all comparison charts above).
    const storeDetail = allStoreDetail.filter((r) => stores.includes(r.store));

    const dailyByDate = new Map();
    for (const r of dailyRows) {
      const d = String(r.d).slice(0, 10);
      dailyByDate.set(d, { date: d, gmv: toNum(r.gmv), target: toNum(r.target) });
    }
    const salesVsTarget = Array.from(dailyByDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

    return res.status(200).json({
      meta: { current, stores, coreStores },
      attainmentByStore,
      trafficConversionByStore,
      storeDetail,
      salesVsTarget,
      dataQuality: [
        "Attainment by Store and Foot Traffic by Store always compare all branches regardless of the page's Store filter — the Store Detail table and Sales vs Target trend below respect the filter.",
        "Foot Traffic/Conversion Rate cover the 9 core walk-in branches only — HPI CANLUBANG and ENVIROCYCLE have no foot-traffic tracking (see src/retail/stores.js).",
      ],
    });
  } catch (err) {
    console.error("[retail-store-performance]", err);
    return res.status(500).json({ error: "Failed to load Retail Store Performance data", message: err?.message || "" });
  }
}
