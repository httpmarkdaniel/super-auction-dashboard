import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

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
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
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
function resolveView(view) {
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
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}

export async function handleRetailStorePerformance(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const view = req.query.view === "mtd" ? "mtd" : "weekly";
    const stores = resolveSegment(segment);
    const { current, previous } = resolveView(view);

    const [salesRows, targetRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT store_name,
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_rev,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn,
              sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
              sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Targets exist for all 11 real stores (including HRH Online? — no,
      // xv3.mart_sales_target only ever has rows for the 9 core branches
      // plus Envirocycle/HPI Canlubang; HRH Online's own target tracking
      // lives in its own dashboard, not here) — LEFT JOIN'd in below, a
      // store with no target row shows — rather than a fabricated 0/100%.
      client
        .query({
          query: `SELECT store_name, sum(daily_target) AS target FROM xv3.mart_sales_target WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String} GROUP BY store_name`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const targetByStore = new Map(targetRows.map((r) => [r.store_name, toNum(r.target)]));

    const table = salesRows
      .map((r) => {
        const store = r.store_name;
        const curRev = toNum(r.cur_rev);
        const prevRev = toNum(r.prev_rev);
        const target = targetByStore.get(store) || 0;
        return {
          store,
          curRev,
          prevRev,
          deltaPct: pctDelta(curRev, prevRev),
          curTxn: toNum(r.cur_txn),
          prevTxn: toNum(r.prev_txn),
          curUnits: toNum(r.cur_units),
          prevUnits: toNum(r.prev_units),
          target,
          attainmentPct: target > 0 ? safeDivide(curRev, target) * 100 : null,
        };
      })
      .sort((a, b) => b.curRev - a.curRev);

    const totalCur = table.reduce((s, r) => s + r.curRev, 0);
    const totalPrev = table.reduce((s, r) => s + r.prevRev, 0);
    const totalTarget = table.reduce((s, r) => s + r.target, 0);

    return res.status(200).json({
      meta: { view, current, previous, segment, stores },
      table,
      totals: { curRev: totalCur, prevRev: totalPrev, deltaPct: pctDelta(totalCur, totalPrev), target: totalTarget, attainmentPct: totalTarget > 0 ? safeDivide(totalCur, totalTarget) * 100 : null },
      dataQuality: ["Verified 2026-09-17: xv3.mart_sales_target currently has exactly one row per store/date (no duplicates), so a plain sum(daily_target) is correct — a duplicate-row bug was reported in an earlier version of this table but isn't present in the data this dashboard reads."],
    });
  } catch (err) {
    console.error("[retail-store-performance]", err);
    return res.status(500).json({ error: "Failed to load Retail Store Performance data", message: err?.message || "" });
  }
}
