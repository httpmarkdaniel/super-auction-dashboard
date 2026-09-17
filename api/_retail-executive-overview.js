import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// The real, current, active HMR Retail Haus branch list — see
// src/retail/stores.js for the full investigation writeup (2026-09-17).
// Duplicated here (not imported from the frontend file) per this
// dashboard's "no shared business-logic import across frontend/backend"
// convention — every api/_hrh-*.js file does the same for its own
// store/channel scope constants.
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
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}

// ---------------------------------------------------------------------
// Date math — same logic as api/_hrh-executive-overview.js's resolveRange/
// resolveComparisonWindow (Asia/Manila "today", WTD/MTD/YTD calendar-shift
// comparisons, Custom adjacency comparison). Duplicated per this
// dashboard's per-file date-helper convention.
// ---------------------------------------------------------------------
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
function daysInMonth(year, month1Based) {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}
function shiftMonthsClampedISO(iso, deltaMonths) {
  const [y, m, d] = iso.split("-").map(Number);
  const total0 = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total0 / 12);
  const nm1 = (((total0 % 12) + 12) % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm1));
  return `${ny}-${String(nm1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
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
function resolveComparisonWindow(current, compareTo) {
  const { from, to } = current;
  if (compareTo === "day") return { from: addDaysISO(from, -1), to: addDaysISO(to, -1) };
  if (compareTo === "month") return { from: shiftMonthsClampedISO(from, -1), to: shiftMonthsClampedISO(to, -1) };
  return { from: addDaysISO(from, -7), to: addDaysISO(to, -7) }; // "week" (default)
}

// Resolves the page's Store filter ("All Stores" or one real store name)
// into the list of store_names to scope every query to, plus the subset of
// that list with real foot-traffic tracking (see stores.js/NO_FOOT_TRAFFIC_
// STORES — HPI CANLUBANG/ENVIROCYCLE have live sales targets but no foot
// traffic and much larger bulk-style tickets, so foot-traffic/conversion
// metrics are scoped to the core walk-in branches only).
function resolveStoreScope(store) {
  if (!store || store === ALL_STORES_OPTION) {
    return { stores: ALL_RETAIL_STORES, coreStores: CORE_RETAIL_STORES };
  }
  if (!ALL_RETAIL_STORES.includes(store)) return null;
  return { stores: [store], coreStores: CORE_RETAIL_STORES.includes(store) ? [store] : [] };
}

export async function handleRetailExecutiveOverview(req, res) {
  try {
    const { store = ALL_STORES_OPTION, from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const compareTo = ["day", "week", "month"].includes(req.query.compareTo) ? req.query.compareTo : "week";

    const scope = resolveStoreScope(store);
    if (!scope) return res.status(400).json({ error: "Invalid store", message: `Unknown store: ${store}` });
    const { stores, coreStores } = scope;

    let current;
    try {
      ({ current } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const previous = resolveComparisonWindow(current, compareTo);

    // Sales Trend's own trailing window — fixed 6 months back from today,
    // independent of the page's Date Range filter, same pattern as
    // api/_hrh-executive-overview.js's own Sales Trend (Day/Week/Month
    // bucket views are client-side re-buckets of this same daily data —
    // see RetailApp's ExecutiveOverview.jsx).
    const trailingTo = manilaTodayISODate();
    const trailingFrom = shiftMonthsClampedISO(trailingTo, -6);

    // 5 independent queries — different tables/date windows, nothing
    // depends on another's result — fired together via Promise.all.
    const [kpiRows, trendRows, footTrafficRows, targetRows, leaderboardRows] = await Promise.all([
      // Sales KPIs — GMV (gross, sale-side only, same convention as HRH's
      // own GMV/NMV split) + NMV (net of returns) + Transactions (distinct
      // invoice_id on gross-sale rows), current + comparison window.
      client
        .query({
          query: `
            SELECT
              sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_nmv,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_transactions,
              sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_nmv,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_transactions,
              max(transaction_date) AS sales_as_of
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Sales Trend — daily NMV + Transactions for the trailing window.
      client
        .query({
          query: `
            SELECT
              transaction_date AS d,
              sum(net_sales_amount) AS nmv,
              uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {trailingFrom:String} AND {trailingTo:String}
            GROUP BY transaction_date
          `,
          query_params: { stores, trailingFrom, trailingTo },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Foot Traffic — core walk-in stores only (see resolveStoreScope),
      // current + comparison window. Empty coreStores (a single non-core
      // store selected) short-circuits to avoid an empty-array IN clause.
      coreStores.length
        ? client
            .query({
              query: `
                SELECT
                  sumIf(traffic_count, date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_traffic,
                  sumIf(traffic_count, date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_traffic
                FROM xv3.mart_foot_traffic_masterlist
                WHERE store_name IN {stores:Array(String)}
                  AND date BETWEEN {prevFrom:String} AND {curTo:String}
              `,
              query_params: { stores: coreStores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
              format: "JSONEachRow",
            })
            .then((r) => r.json())
        : Promise.resolve([{ cur_traffic: null, prev_traffic: null }]),
      // Sales Targets — daily_target summed over the window, all stores in
      // scope (targets exist for all 11, including the 2 no-foot-traffic
      // ones — see stores.js).
      client
        .query({
          query: `
            SELECT
              sumIf(daily_target, date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_target,
              sumIf(daily_target, date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_target
            FROM xv3.mart_sales_target
            WHERE store_name IN {stores:Array(String)}
              AND date BETWEEN {prevFrom:String} AND {curTo:String}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Store Leaderboard — per-store Sales/Transactions/Target for the
      // CURRENT window, joined with foot traffic (LEFT JOIN — the 2
      // no-foot-traffic stores simply get no traffic row, not a fabricated
      // 0) in JS below rather than a 3-way SQL join across differently-
      // grained tables.
      client
        .query({
          query: `
            SELECT
              store_name,
              sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
              sum(net_sales_amount) AS nmv,
              uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const [targetByStoreRows, trafficByStoreRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT store_name, sum(daily_target) AS target
            FROM xv3.mart_sales_target
            WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      coreStores.length
        ? client
            .query({
              query: `
                SELECT store_name, sum(traffic_count) AS traffic
                FROM xv3.mart_foot_traffic_masterlist
                WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}
                GROUP BY store_name
              `,
              query_params: { stores: coreStores, curFrom: current.from, curTo: current.to },
              format: "JSONEachRow",
            })
            .then((r) => r.json())
        : Promise.resolve([]),
    ]);

    const kpi = kpiRows[0] || {};
    const curGmv = toNum(kpi.cur_gmv);
    const curNmv = toNum(kpi.cur_nmv);
    const curTransactions = toNum(kpi.cur_transactions);
    const prevGmv = toNum(kpi.prev_gmv);
    const prevNmv = toNum(kpi.prev_nmv);
    const prevTransactions = toNum(kpi.prev_transactions);
    const curAvgBasket = safeDivide(curNmv, curTransactions);
    const prevAvgBasket = safeDivide(prevNmv, prevTransactions);

    const traffic = footTrafficRows[0] || {};
    const curTraffic = traffic.cur_traffic === null || traffic.cur_traffic === undefined ? null : toNum(traffic.cur_traffic);
    const prevTraffic = traffic.prev_traffic === null || traffic.prev_traffic === undefined ? null : toNum(traffic.prev_traffic);
    const curConversion = curTraffic === null ? null : safeDivide(curTransactions, curTraffic) * 100;
    const prevConversion = prevTraffic === null ? null : safeDivide(prevTransactions, prevTraffic) * 100;

    const target = targetRows[0] || {};
    const curTarget = toNum(target.cur_target);
    const prevTarget = toNum(target.prev_target);
    const curAttainment = curTarget > 0 ? safeDivide(curGmv, curTarget) * 100 : null;
    const prevAttainment = prevTarget > 0 ? safeDivide(prevGmv, prevTarget) * 100 : null;

    // Sales Trend — zero-filled per day so a no-sales day doesn't create an
    // x-axis gap, same convention as api/_hrh-executive-overview.js.
    const trendByDate = new Map(trendRows.map((r) => [String(r.d).slice(0, 10), r]));
    const salesTrendTrailing = [];
    for (let d = trailingFrom; d <= trailingTo; d = addDaysISO(d, 1)) {
      const row = trendByDate.get(d);
      salesTrendTrailing.push({ date: d, nmv: row ? toNum(row.nmv) : 0, transactions: row ? toNum(row.transactions) : 0 });
    }

    // Store Leaderboard — merges the 3 sources (sales, target, foot
    // traffic) per store_name; sorted by GMV descending (biggest-selling
    // store first).
    const targetByStore = new Map(targetByStoreRows.map((r) => [r.store_name, toNum(r.target)]));
    const trafficByStore = new Map(trafficByStoreRows.map((r) => [r.store_name, toNum(r.traffic)]));
    const leaderboard = leaderboardRows
      .map((r) => {
        const storeName = r.store_name;
        const gmv = toNum(r.gmv);
        const nmv = toNum(r.nmv);
        const transactions = toNum(r.transactions);
        const storeTarget = targetByStore.get(storeName) || 0;
        const hasFootTraffic = coreStores.includes(storeName);
        const storeTraffic = hasFootTraffic ? trafficByStore.get(storeName) || 0 : null;
        return {
          store: storeName,
          gmv,
          nmv,
          transactions,
          avgBasket: safeDivide(nmv, transactions),
          target: storeTarget,
          attainmentPct: storeTarget > 0 ? safeDivide(gmv, storeTarget) * 100 : null,
          footTraffic: storeTraffic,
          conversionRatePct: storeTraffic ? safeDivide(transactions, storeTraffic) * 100 : null,
        };
      })
      .sort((a, b) => b.gmv - a.gmv);

    return res.status(200).json({
      meta: {
        current,
        previous,
        stores,
        salesAsOf: kpi.sales_as_of ? String(kpi.sales_as_of).slice(0, 10) : null,
        methodologyNote:
          "Sales from xv3.mart_net_sales (GMV = gross sale-side amount, NMV = net of returns). Foot traffic (xv3.mart_foot_traffic_masterlist) and Conversion Rate only cover the 9 core walk-in branches — HPI CANLUBANG and ENVIROCYCLE have live sales targets but no foot-traffic tracking and much larger bulk-style tickets, so they're included in Sales/Targets but shown as — for Foot Traffic/Conversion.",
      },
      kpis: {
        gmv: { value: curGmv, previous: prevGmv, delta: pctDelta(curGmv, prevGmv) },
        nmv: { value: curNmv, previous: prevNmv, delta: pctDelta(curNmv, prevNmv) },
        transactions: { value: curTransactions, previous: prevTransactions, delta: pctDelta(curTransactions, prevTransactions) },
        avgBasket: { value: curAvgBasket, previous: prevAvgBasket, delta: pctDelta(curAvgBasket, prevAvgBasket) },
        footTraffic: { value: curTraffic, previous: prevTraffic, delta: curTraffic === null ? null : pctDelta(curTraffic, prevTraffic) },
        conversionRate: { value: curConversion, previous: prevConversion, delta: curConversion === null ? null : pctDelta(curConversion, prevConversion) },
        targetAttainment: { value: curAttainment, previous: prevAttainment, delta: curAttainment === null ? null : pctDelta(curAttainment, prevAttainment), target: curTarget },
      },
      salesTrendTrailing,
      leaderboard,
      dataQuality: [
        "Foot traffic and Conversion Rate cover the 9 core walk-in branches only (PIONEER, NORTH CALOOCAN, MABALACAT, S AND C CAINTA, HMR TAGAYTAY ROAD, CEBU, HMR SUCAT, SUBIC MAIN, HMR CAGAYAN DE ORO) — HPI CANLUBANG and ENVIROCYCLE have no foot-traffic tracking and behave like institutional/bulk accounts (10–70x larger average tickets), not walk-in floor traffic.",
        "Target Attainment compares GMV (gross sales) against xv3.mart_sales_target's daily_target — a store with no target row for the period shows — rather than a fabricated 0% or 100%.",
        "Conversion Rate (Transactions ÷ Foot Traffic) can read above 100% for some stores/periods — e.g. more than one transaction per visitor counted, or the foot-traffic sensor undercounting relative to actual visits. This is shown as-is, not capped or smoothed, since capping would hide a real counting discrepancy worth investigating at the store level.",
      ],
    });
  } catch (err) {
    console.error("[retail-executive-overview]", err);
    return res.status(500).json({ error: "Failed to load Retail Executive Overview data", message: err?.message || "" });
  }
}
