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
function resolveStoreScope(store) {
  if (!store || store === ALL_STORES_OPTION) return { stores: ALL_RETAIL_STORES };
  if (!ALL_RETAIL_STORES.includes(store)) return null;
  return { stores: [store] };
}

export async function handleRetailSalesAnalytics(req, res) {
  try {
    const { store = ALL_STORES_OPTION, from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const compareTo = ["day", "week", "month"].includes(req.query.compareTo) ? req.query.compareTo : "week";

    const scope = resolveStoreScope(store);
    if (!scope) return res.status(400).json({ error: "Invalid store", message: `Unknown store: ${store}` });
    const { stores } = scope;

    let current;
    try {
      ({ current } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const previous = resolveComparisonWindow(current, compareTo);

    // 4 independent queries — different groupings over the same store/date
    // scope, nothing depends on another's result — fired together.
    const [kpiRows, trendRows, byStoreRows, byDepartmentRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT
              sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_nmv,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_transactions,
              sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_nmv,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Daily Sales Trend for the CURRENT window only — the frontend
      // re-buckets by day/week/month via TrendBucketPills (see
      // trendBucket.js), unlike Executive Overview's own fixed 6-month
      // trailing Sales Trend; this one always matches the page's own Date
      // Range filter, for a "how did the period I selected actually play
      // out" view.
      client
        .query({
          query: `
            SELECT transaction_date AS d, sum(net_sales_amount) AS nmv, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY transaction_date
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Sales by Store — ALWAYS all 11 real branches for the current
      // window, regardless of the page's own Store filter (same "always
      // show the full breakdown" convention as HRH Online's Channel Mix
      // donut) — this panel's whole purpose is cross-store comparison, so
      // narrowing it to a single selected store would make it a single bar.
      client
        .query({
          query: `
            SELECT store_name, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name IN {allStores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
            ORDER BY gmv DESC
          `,
          query_params: { allStores: ALL_RETAIL_STORES, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Sales by Department — department_name is the usable coarse
      // grouping (~30 real values); category_name itself is far too
      // fragmented (~2000 distinct raw values across this store scope,
      // investigated 2026-09-17) to group by directly.
      client
        .query({
          query: `
            SELECT department_name, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND net_sales_amount > 0
            GROUP BY department_name
            ORDER BY gmv DESC
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
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

    const salesTrend = trendRows
      .map((r) => ({ date: String(r.d).slice(0, 10), nmv: toNum(r.nmv), transactions: toNum(r.transactions) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const salesByStore = byStoreRows.map((r) => ({ store: r.store_name, gmv: toNum(r.gmv) }));

    const TOP_DEPARTMENTS = 12;
    const deptTotalGmv = byDepartmentRows.reduce((s, r) => s + toNum(r.gmv), 0);
    const topDepartments = byDepartmentRows.slice(0, TOP_DEPARTMENTS).map((r) => ({
      department: r.department_name || "Uncategorized",
      gmv: toNum(r.gmv),
      transactions: toNum(r.transactions),
      sharePct: safeDivide(toNum(r.gmv), deptTotalGmv) * 100,
    }));
    const otherGmv = byDepartmentRows.slice(TOP_DEPARTMENTS).reduce((s, r) => s + toNum(r.gmv), 0);
    const otherTransactions = byDepartmentRows.slice(TOP_DEPARTMENTS).reduce((s, r) => s + toNum(r.transactions), 0);
    if (otherGmv > 0) {
      topDepartments.push({ department: "Other", gmv: otherGmv, transactions: otherTransactions, sharePct: safeDivide(otherGmv, deptTotalGmv) * 100 });
    }

    return res.status(200).json({
      meta: { current, previous, stores },
      kpis: {
        gmv: { value: curGmv, previous: prevGmv, delta: pctDelta(curGmv, prevGmv) },
        nmv: { value: curNmv, previous: prevNmv, delta: pctDelta(curNmv, prevNmv) },
        transactions: { value: curTransactions, previous: prevTransactions, delta: pctDelta(curTransactions, prevTransactions) },
        avgBasket: { value: curAvgBasket, previous: prevAvgBasket, delta: pctDelta(curAvgBasket, prevAvgBasket) },
      },
      salesTrend,
      salesByStore,
      topDepartments,
      dataQuality: [
        "Sales by Store always shows all 11 branches regardless of the page's Store filter — narrowing this specific panel to one store would leave a single bar with nothing to compare against.",
        "Department is the usable grouping level — the underlying category_name field has ~2,000 fragmented raw values (product-level granularity, not a real category taxonomy) and isn't usable for a breakdown like this.",
      ],
    });
  } catch (err) {
    console.error("[retail-sales-analytics]", err);
    return res.status(500).json({ error: "Failed to load Retail Sales Analytics data", message: err?.message || "" });
  }
}
