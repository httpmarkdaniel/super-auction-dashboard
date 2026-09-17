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
];

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
function resolveTableView(view) {
  const today = manilaTodayISODate();
  if (view === "mtd") {
    const current = { from: firstOfMonthISO(today), to: today };
    const previous = { from: shiftMonthsClampedISO(current.from, -1), to: shiftMonthsClampedISO(current.to, -1) };
    return { current, previous };
  }
  const thisWeekMonday = mondayOfWeek(today);
  const current = { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  const previous = { from: addDaysISO(current.from, -7), to: addDaysISO(current.to, -7) };
  return { current, previous };
}

// This tab only ever applies to the 9 core walk-in branches, regardless
// of the page's segment — Wholesale/HRH Online genuinely have no foot
// traffic concept, so unlike Sales Overview/Trend/Sales Channel there is
// no "segment scoping" to do here at all (this mirrors the reference
// report's own note: "No foot traffic is tracked for Wholesale locations
// ... This tab only applies to Retail").
export async function handleRetailFootTraffic(req, res) {
  try {
    const view = req.query.view === "mtd" ? "mtd" : "weekly";
    const { current, previous } = resolveTableView(view);
    const today = manilaTodayISODate();
    const monthStart = firstOfMonthISO(today);
    const fourWeeksAgoMonday = addDaysISO(mondayOfWeek(today), -28);

    const [dailyRows, weeklyRows, storeTrafficRows, storeTxnRows] = await Promise.all([
      client
        .query({
          query: `SELECT date, sum(traffic_count) AS traffic FROM xv3.mart_foot_traffic_masterlist WHERE store_name IN {stores:Array(String)} AND date BETWEEN {from:String} AND {today:String} GROUP BY date`,
          query_params: { stores: CORE_RETAIL_STORES, from: monthStart, today },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT toMonday(date) AS weekStart, sum(traffic_count) AS traffic FROM xv3.mart_foot_traffic_masterlist WHERE store_name IN {stores:Array(String)} AND date BETWEEN {from:String} AND {to:String} GROUP BY weekStart ORDER BY weekStart`,
          query_params: { stores: CORE_RETAIL_STORES, from: fourWeeksAgoMonday, to: addDaysISO(mondayOfWeek(today), -1) },
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
          query_params: { stores: CORE_RETAIL_STORES, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT store_name,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores: CORE_RETAIL_STORES, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
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
      meta: { view, current, previous, stores: CORE_RETAIL_STORES },
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
