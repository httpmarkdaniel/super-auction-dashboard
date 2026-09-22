import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Foot traffic + conversion only exist for these 10 walk-in branches — see
// api/_retail-foot-traffic.js's own comment for the full writeup (verified
// zero rows in xv3.mart_foot_traffic_masterlist for Wholesale/HRH Online/
// HARRINGTON PIONEER/MAIN/HMR BULACAN).
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
// Same dashboard-wide Date Range preset shape as every other retail
// report — see api/_retail-sales-overview.js's resolveRange for the full
// comment on each preset.
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

// Store Performance Quadrant — foot traffic growth vs conversion rate
// change, bubble size = revenue, for the 10 walk-in branches only (same
// scope Foot Traffic itself uses; Wholesale/HRH Online/HARRINGTON
// PIONEER/MAIN/HMR BULACAN have no foot-traffic concept). Conversion
// change is a percentage-POINT delta (curConversionPct - prevConversionPct),
// not a relative growth rate — conversion rate is already a percentage, so
// a pp delta is the standard way to describe its change.
//
// Exported (not just the HTTP handler below) so
// api/_retail-needs-attention.js can reuse the exact same per-store
// traffic/conversion computation for its own decline flags, instead of a
// second, possibly drifting implementation of this math.
export async function computeStoreQuadrant(range, fromParam, toParam) {
  const { current, previous } = resolveRange(range, fromParam, toParam);
  const stores = CORE_RETAIL_STORES;

  const [trafficRows, salesRows] = await Promise.all([
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
          SELECT store_name,
            sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn
          FROM xv3.mart_net_sales
          WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          GROUP BY store_name
        `,
        query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);

  const salesByStore = new Map(salesRows.map((r) => [r.store_name, { rev: toNum(r.cur_rev), curTxn: toNum(r.cur_txn), prevTxn: toNum(r.prev_txn) }]));

  const table = trafficRows
    .map((r) => {
      const store = r.store_name;
      const curTraffic = toNum(r.cur_traffic);
      const prevTraffic = toNum(r.prev_traffic);
      const sales = salesByStore.get(store) || { rev: 0, curTxn: 0, prevTxn: 0 };
      const curConversionPct = safeDivide(sales.curTxn, curTraffic) * 100;
      const prevConversionPct = safeDivide(sales.prevTxn, prevTraffic) * 100;
      return {
        store,
        revenue: sales.rev,
        trafficGrowthPct: pctDelta(curTraffic, prevTraffic),
        conversionGrowthPct: prevTraffic > 0 ? curConversionPct - prevConversionPct : null,
        currentTraffic: curTraffic,
        currentConversionPct: curConversionPct,
        transactions: sales.curTxn,
      };
    })
    // currentTraffic > 0 guards against a source-data sync lag (foot
    // traffic can trail 1-2 days behind sales — verified 2026-09-22) that
    // would otherwise show every store as "-100% traffic" simply because
    // today's count hasn't posted yet, not because traffic actually
    // dropped to zero.
    .filter((r) => r.trafficGrowthPct !== null && r.conversionGrowthPct !== null && r.currentTraffic > 0);

  return { range, current, previous, stores, table };
}

export async function handleRetailStoreQuadrant(req, res) {
  try {
    const range = req.query.range || "wtd";
    let result;
    try {
      result = await computeStoreQuadrant(range, req.query.from, req.query.to);
    } catch (rangeErr) {
      if (rangeErr instanceof RangeError) return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
      throw rangeErr;
    }
    return res.status(200).json({
      meta: { range: result.range, current: result.current, previous: result.previous, stores: result.stores },
      table: result.table,
      dataQuality: [
        "Scoped to the 10 walk-in branches only (same as the Foot Traffic tab) — Wholesale, HRH Online, HARRINGTON PIONEER, MAIN, and HMR BULACAN have no foot-traffic tracking.",
        "Conversion Rate Growth is a percentage-POINT change (this period's conversion rate minus the prior period's), not a relative growth rate — conversion rate is already a percentage, so a pp delta is the standard way to read its change.",
        "A store is only shown once it has traffic in both the current and previous period (needed to compute growth); a newly-tracked or zero-traffic store is omitted rather than shown with a fabricated 0%/∞ growth value. This also guards against a source-data sync lag — foot traffic can trail 1-2 days behind sales, so a Date Range whose most recent day(s) haven't synced yet would otherwise show every store as a fake -100%.",
      ],
    });
  } catch (err) {
    console.error("[retail-store-quadrant]", err);
    return res.status(500).json({ error: "Failed to load Retail Store Quadrant data", message: err?.message || "" });
  }
}
