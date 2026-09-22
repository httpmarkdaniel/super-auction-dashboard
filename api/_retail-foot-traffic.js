import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Foot traffic only ever exists for the 9 core walk-in branches — never
// HRH Online or Wholesale (Envirocycle/HPI Canlubang), verified zero rows
// in xv3.mart_foot_traffic_masterlist for both. See segments.js.
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
];

// See api/_retail-sales-overview.js's own comment for the full writeup —
// "SUCAT, PARANAQUE"/"HARRINGTON PIONEER" are confirmed earlier names for
// HMR SUCAT/PIONEER, present historically in mart_net_sales (used by the
// transaction/conversion query below) but NOT in
// mart_foot_traffic_masterlist itself, which only ever used the current
// names.
const STORE_ALIASES = { "HMR SUCAT": ["SUCAT, PARANAQUE"], PIONEER: ["HARRINGTON PIONEER"] };
function expandStoreAliases(stores) {
  return stores.flatMap((s) => [s, ...(STORE_ALIASES[s] || [])]);
}
const STORE_NAME_EXPR = "multiIf(store_name = 'SUCAT, PARANAQUE', 'HMR SUCAT', store_name = 'HARRINGTON PIONEER', 'PIONEER', store_name)";

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
function shiftYearsClampedISO(iso, deltaYears) {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y + deltaYears;
  const nd = Math.min(d, daysInMonth(ny, m));
  return `${ny}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}
function daysBetweenISO(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
// Dashboard-wide Date Range filter — controls the `table` (per-store
// traffic + conversion, current vs previous) below only. `daily`/`weekly`
// stay fixed trailing windows (this month to date / last 4 weeks),
// independent of this filter, same convention as Trend.jsx's own charts.
// See api/_retail-sales-overview.js's resolveRange for the full comment.
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    const lengthDays = daysBetweenISO(from, to) + 1;
    const prevTo = addDaysISO(from, -1);
    const prevFrom = addDaysISO(prevTo, -(lengthDays - 1));
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }
  if (range === "mtd") {
    const to = today;
    const from = firstOfMonthISO(to);
    const prevAnchor = shiftMonthsClampedISO(to, -1);
    return { current: { from, to }, previous: { from: firstOfMonthISO(prevAnchor), to: prevAnchor } };
  }
  if (range === "ytd") {
    const to = today;
    const from = `${to.slice(0, 4)}-01-01`;
    const prevTo = shiftYearsClampedISO(to, -1);
    const prevFrom = `${Number(to.slice(0, 4)) - 1}-01-01`;
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    const from = addDaysISO(thisWeekMonday, -7);
    const to = addDaysISO(thisWeekMonday, -1);
    return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
  }
  if (range === "prevMonth") {
    const to = addDaysISO(firstOfMonthISO(today), -1);
    const from = firstOfMonthISO(to);
    const prevTo = addDaysISO(from, -1);
    const prevFrom = firstOfMonthISO(prevTo);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { current: { from: `${y}-01-01`, to: `${y}-12-31` }, previous: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` } };
  }
  const to = today;
  const from = mondayOfWeek(to);
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
}
// Store drill-down — only honored when it's actually one of the 9 core
// walk-in branches (see file-header comment: Wholesale/HRH Online have no
// foot traffic at all), otherwise every core branch is shown, same as
// before this filter existed.
function resolveStores(storeParam) {
  if (storeParam && CORE_RETAIL_STORES.includes(storeParam)) return [storeParam];
  return CORE_RETAIL_STORES;
}

// This tab only ever applies to the 9 core walk-in branches, regardless
// of the page's segment — Wholesale/HRH Online genuinely have no foot
// traffic concept, so unlike Sales Overview/Trend/Sales Channel there is
// no "segment scoping" to do here at all (this mirrors the reference
// report's own note: "No foot traffic is tracked for Wholesale locations
// ... This tab only applies to Retail").
export async function handleRetailFootTraffic(req, res) {
  try {
    const range = req.query.range || "wtd";
    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, req.query.from, req.query.to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const stores = expandStoreAliases(resolveStores(req.query.store));
    const today = manilaTodayISODate();
    const monthStart = firstOfMonthISO(today);
    const fourWeeksAgoMonday = addDaysISO(mondayOfWeek(today), -28);

    const [dailyRows, weeklyRows, storeTrafficRows, storeTxnRows] = await Promise.all([
      client
        .query({
          query: `SELECT date, sum(traffic_count) AS traffic FROM xv3.mart_foot_traffic_masterlist WHERE store_name IN {stores:Array(String)} AND date BETWEEN {from:String} AND {today:String} GROUP BY date`,
          query_params: { stores, from: monthStart, today },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT toMonday(date) AS weekStart, sum(traffic_count) AS traffic FROM xv3.mart_foot_traffic_masterlist WHERE store_name IN {stores:Array(String)} AND date BETWEEN {from:String} AND {to:String} GROUP BY weekStart ORDER BY weekStart`,
          query_params: { stores, from: fourWeeksAgoMonday, to: addDaysISO(mondayOfWeek(today), -1) },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT store_name,
              sumIf(traffic_count, date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_traffic,
              sumIf(traffic_count, date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_traffic
            FROM xv3.mart_foot_traffic_masterlist
            WHERE store_name IN {stores:Array(String)} AND date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT ${STORE_NAME_EXPR} AS store_name,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY ${STORE_NAME_EXPR}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const dailyByDate = new Map(dailyRows.map((r) => [String(r.date).slice(0, 10), toNum(r.traffic)]));
    const daily = [];
    for (let d = monthStart; d <= today; d = addDaysISO(d, 1)) daily.push({ date: d, traffic: dailyByDate.get(d) || 0 });
    const weekly = weeklyRows.map((r) => ({ weekStart: String(r.weekStart).slice(0, 10), traffic: toNum(r.traffic) }));

    const txnByStore = new Map(storeTxnRows.map((r) => [r.store_name, { cur: toNum(r.cur_txn), prev: toNum(r.prev_txn) }]));
    const table = storeTrafficRows
      .map((r) => {
        const store = r.store_name;
        const curTraffic = toNum(r.cur_traffic);
        const prevTraffic = toNum(r.prev_traffic);
        const txn = txnByStore.get(store) || { cur: 0, prev: 0 };
        return {
          store,
          curTraffic,
          prevTraffic,
          curTransactions: txn.cur,
          prevTransactions: txn.prev,
          curConversionPct: safeDivide(txn.cur, curTraffic) * 100,
          prevConversionPct: safeDivide(txn.prev, prevTraffic) * 100,
        };
      })
      .sort((a, b) => b.curTraffic - a.curTraffic);

    return res.status(200).json({
      meta: { range, current, previous, store: req.query.store || "", stores },
      daily,
      weekly,
      table,
      dataQuality: ["This tab always covers the 9 core walk-in branches only, regardless of the page's segment toggle — Wholesale and HRH Online have no foot-traffic concept (verified zero rows for Wholesale; not applicable for e-commerce)."],
    });
  } catch (err) {
    console.error("[retail-foot-traffic]", err);
    return res.status(500).json({ error: "Failed to load Retail Foot Traffic data", message: err?.message || "" });
  }
}
