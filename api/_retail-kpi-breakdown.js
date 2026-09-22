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
const RETAIL_STORES = [...CORE_RETAIL_STORES, HRH_ONLINE_STORE];
// Foot traffic (and therefore this per-store breakdown) only exists for
// these 10 walk-in branches — see api/_retail-foot-traffic.js's own
// comment for the full writeup.
const WALK_IN_STORES = [
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
function safeDivide(a, b) {
  return b ? a / b : 0;
}
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
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
// report (current + comparable previous period) — see
// api/_retail-sales-overview.js's resolveRange for the full comment on
// each preset.
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

// Revenue/Transactions/ABS drill-down: Retail vs Wholesale, regardless of
// the dashboard's current Segment filter — the whole point of this view
// is to see both sides at once. "Retail" = the 13 walk-in/legacy branches
// + HRH Online, same as the Segment filter's own "Retail" option. Every
// figure includes a vs-previous-period % change, same convention as
// every KPI card elsewhere on this dashboard.
export async function handleRetailSalesSegmentBreakdown(req, res) {
  try {
    const range = req.query.range || "wtd";
    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, req.query.from, req.query.to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const rows = await client
      .query({
        query: `
          SELECT multiIf(store_name IN {retailStores:Array(String)}, 'Retail', store_name IN {wholesaleStores:Array(String)}, 'Wholesale', 'Other') AS bucket,
            sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_revenue,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_transactions,
            sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_revenue,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_transactions
          FROM xv3.mart_net_sales
          WHERE store_name IN {allStores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          GROUP BY bucket
        `,
        query_params: {
          retailStores: RETAIL_STORES,
          wholesaleStores: WHOLESALE_STORES,
          allStores: [...RETAIL_STORES, ...WHOLESALE_STORES],
          curFrom: current.from,
          curTo: current.to,
          prevFrom: previous.from,
          prevTo: previous.to,
        },
        format: "JSONEachRow",
      })
      .then((r) => r.json());

    const byBucket = new Map(rows.map((r) => [r.bucket, r]));
    function buildRow(label, r) {
      const revenue = toNum(r?.cur_revenue);
      const transactions = toNum(r?.cur_transactions);
      const prevRevenue = toNum(r?.prev_revenue);
      const prevTransactions = toNum(r?.prev_transactions);
      const abs = safeDivide(revenue, transactions);
      const prevAbs = safeDivide(prevRevenue, prevTransactions);
      return {
        label,
        revenue,
        revenueDeltaPct: pctDelta(revenue, prevRevenue),
        transactions,
        transactionsDeltaPct: pctDelta(transactions, prevTransactions),
        abs,
        absDeltaPct: pctDelta(abs, prevAbs),
      };
    }

    const rowsOut = ["Retail", "Wholesale"].map((bucket) => buildRow(bucket, byBucket.get(bucket)));
    const curTotal = { cur_revenue: rowsOut.reduce((s, r) => s + r.revenue, 0), cur_transactions: rowsOut.reduce((s, r) => s + r.transactions, 0) };
    const prevTotalRevenue = rows.reduce((s, r) => s + toNum(r.prev_revenue), 0);
    const prevTotalTxn = rows.reduce((s, r) => s + toNum(r.prev_transactions), 0);
    const total = buildRow("Total", { ...curTotal, prev_revenue: prevTotalRevenue, prev_transactions: prevTotalTxn });

    return res.status(200).json({
      meta: { range, current, previous },
      rows: rowsOut,
      total,
      dataQuality: ["Revenue is net of returns/refunds/voids, same convention as every other revenue figure on Sales Overview."],
    });
  } catch (err) {
    console.error("[retail-kpi-breakdown/segment]", err);
    return res.status(500).json({ error: "Failed to load Retail Sales Segment Breakdown data", message: err?.message || "" });
  }
}

// Foot Traffic/Total Customers/New-Returning drill-down: per walk-in
// store, regardless of the dashboard's current Segment/Store filter.
// Every figure includes a vs-previous-period % change.
export async function handleRetailStoreEngagementBreakdown(req, res) {
  try {
    const range = req.query.range || "wtd";
    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, req.query.from, req.query.to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const [trafficRows, customerRows] = await Promise.all([
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
          query_params: { stores: WALK_IN_STORES, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT store_name, customer_recency,
              uniqExactIf(customer_name, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_n,
              uniqExactIf(customer_name, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_n
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
              AND customer_name IS NOT NULL AND trim(customer_name) != '' AND customer_name NOT IN ('n/a', 'WALK IN') AND match(customer_name, '[a-zA-Z]')
            GROUP BY store_name, customer_recency
          `,
          query_params: { stores: WALK_IN_STORES, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const trafficByStore = new Map(trafficRows.map((r) => [r.store_name, { cur: toNum(r.cur_traffic), prev: toNum(r.prev_traffic) }]));
    const custByStore = new Map();
    for (const r of customerRows) {
      if (!custByStore.has(r.store_name)) custByStore.set(r.store_name, { curNew: 0, prevNew: 0, curReturning: 0, prevReturning: 0 });
      const bucket = custByStore.get(r.store_name);
      if (r.customer_recency === "One time customer") {
        bucket.curNew = toNum(r.cur_n);
        bucket.prevNew = toNum(r.prev_n);
      } else if (r.customer_recency === "Repeat buyer") {
        bucket.curReturning = toNum(r.cur_n);
        bucket.prevReturning = toNum(r.prev_n);
      }
    }

    function buildRow(label, traffic, cust) {
      const footTraffic = traffic?.cur || 0;
      const prevFootTraffic = traffic?.prev || 0;
      const newCustomers = cust.curNew;
      const returningCustomers = cust.curReturning;
      const totalCustomers = newCustomers + returningCustomers;
      const prevTotalCustomers = cust.prevNew + cust.prevReturning;
      return {
        label,
        footTraffic,
        footTrafficDeltaPct: pctDelta(footTraffic, prevFootTraffic),
        totalCustomers,
        totalCustomersDeltaPct: pctDelta(totalCustomers, prevTotalCustomers),
        newCustomers,
        newCustomersDeltaPct: pctDelta(newCustomers, cust.prevNew),
        returningCustomers,
        returningCustomersDeltaPct: pctDelta(returningCustomers, cust.prevReturning),
      };
    }

    const EMPTY_CUST = { curNew: 0, prevNew: 0, curReturning: 0, prevReturning: 0 };
    const rowsOut = WALK_IN_STORES.map((store) => buildRow(store, trafficByStore.get(store), custByStore.get(store) || EMPTY_CUST)).sort(
      (a, b) => b.footTraffic - a.footTraffic
    );

    const totalTraffic = { cur: rowsOut.reduce((s, r) => s + r.footTraffic, 0), prev: [...trafficByStore.values()].reduce((s, t) => s + t.prev, 0) };
    const totalCust = [...custByStore.values()].reduce(
      (acc, c) => ({
        curNew: acc.curNew + c.curNew,
        prevNew: acc.prevNew + c.prevNew,
        curReturning: acc.curReturning + c.curReturning,
        prevReturning: acc.prevReturning + c.prevReturning,
      }),
      { ...EMPTY_CUST }
    );
    const total = buildRow("Total", totalTraffic, totalCust);

    return res.status(200).json({
      meta: { range, current, previous, stores: WALK_IN_STORES },
      rows: rowsOut,
      total,
      dataQuality: [
        "Scoped to the 10 walk-in branches only — Wholesale, HRH Online, HARRINGTON PIONEER, MAIN, and HMR BULACAN have no foot-traffic tracking.",
        "Total Customers / New / Returning use xv3.mart_invoice_items' own customer_recency field (a coarser 2-way split), not the full 3R cohort methodology on the Customer (3R) tab.",
      ],
    });
  } catch (err) {
    console.error("[retail-kpi-breakdown/store]", err);
    return res.status(500).json({ error: "Failed to load Retail Store Engagement Breakdown data", message: err?.message || "" });
  }
}
