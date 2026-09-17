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

export async function handleRetailTransactionsBasket(req, res) {
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

    // Basket detail (items/invoice, current + comparison) comes from
    // xv3.mart_invoice_items — richer line-item grain than mart_net_sales,
    // confirmed feasible 2026-09-17 (invoice_id groups cleanly, ~3s for an
    // 11-store/17-day scan, acceptable for this dedicated page). Excludes
    // voided invoices/items, which mart_net_sales' net_sales_amount
    // already nets out differently (not a like-for-like population), so
    // this basket-size query is independent from the Transactions KPI
    // below rather than trying to reconcile the two exactly.
    const [transactionRows, prevTransactionRows, basketRows, prevBasketRows, distByStoreRows] = await Promise.all([
      // Current window's daily trend (for the chart) — a separate query
      // from the previous-window total below rather than one wide BETWEEN
      // spanning both, since previous.to and current.from aren't always
      // adjacent (e.g. compareTo="month" leaves a gap between them that a
      // single wide range would wrongly include).
      client
        .query({
          query: `
            SELECT transaction_date AS d, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY transaction_date
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}
          `,
          query_params: { stores, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT invoice_id, sum(invoice_item_qty) AS items, sum(invoice_item_sold_amount) AS amount
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
            GROUP BY invoice_id
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT invoice_id, sum(invoice_item_qty) AS items, sum(invoice_item_sold_amount) AS amount
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
            GROUP BY invoice_id
          `,
          query_params: { stores, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Transactions by Store — ALWAYS all 11 branches, same "always show
      // the full breakdown" convention as Sales Analytics' Sales by Store.
      client
        .query({
          query: `
            SELECT store_name, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
            FROM xv3.mart_net_sales
            WHERE store_name IN {allStores:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY store_name
            ORDER BY transactions DESC
          `,
          query_params: { allStores: ALL_RETAIL_STORES, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const curTransactions = transactionRows.reduce((s, r) => s + toNum(r.transactions), 0);
    const prevTransactions = toNum(prevTransactionRows[0]?.transactions);
    const transactionsTrend = transactionRows
      .map((r) => ({ date: String(r.d).slice(0, 10), transactions: toNum(r.transactions) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    function basketStats(rows) {
      const invoiceCount = rows.length;
      const totalItems = rows.reduce((s, r) => s + toNum(r.items), 0);
      const totalAmount = rows.reduce((s, r) => s + toNum(r.amount), 0);
      return { invoiceCount, avgItems: safeDivide(totalItems, invoiceCount), avgValue: safeDivide(totalAmount, invoiceCount) };
    }
    const curBasket = basketStats(basketRows);
    const prevBasket = basketStats(prevBasketRows);

    // Basket Size Distribution — how many transactions fall into each
    // item-count bucket, for the current window.
    const BUCKETS = [
      { label: "1 item", test: (n) => n === 1 },
      { label: "2–3 items", test: (n) => n >= 2 && n <= 3 },
      { label: "4–6 items", test: (n) => n >= 4 && n <= 6 },
      { label: "7–10 items", test: (n) => n >= 7 && n <= 10 },
      { label: "11+ items", test: (n) => n >= 11 },
    ];
    const distribution = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    for (const r of basketRows) {
      const items = toNum(r.items);
      const bucket = distribution[BUCKETS.findIndex((b) => b.test(items))];
      if (bucket) bucket.count += 1;
    }

    const transactionsByStore = distByStoreRows.map((r) => ({ store: r.store_name, transactions: toNum(r.transactions) }));

    return res.status(200).json({
      meta: { current, previous, stores },
      kpis: {
        transactions: { value: curTransactions, previous: prevTransactions, delta: pctDelta(curTransactions, prevTransactions) },
        avgItemsPerBasket: { value: curBasket.avgItems, previous: prevBasket.avgItems, delta: pctDelta(curBasket.avgItems, prevBasket.avgItems) },
        avgBasketValue: { value: curBasket.avgValue, previous: prevBasket.avgValue, delta: pctDelta(curBasket.avgValue, prevBasket.avgValue) },
        invoiceCount: { value: curBasket.invoiceCount, previous: prevBasket.invoiceCount, delta: pctDelta(curBasket.invoiceCount, prevBasket.invoiceCount) },
      },
      transactionsTrend,
      basketDistribution: distribution,
      transactionsByStore,
      dataQuality: [
        "Basket size (items/invoice, avg basket value) comes from xv3.mart_invoice_items, a different population than the Transactions KPI (xv3.mart_net_sales) — voided items/invoices are excluded here but not reconciled 1:1 against Transactions, so the two invoice counts can differ slightly.",
        "Transactions by Store always shows all 11 branches regardless of the page's Store filter.",
      ],
    });
  } catch (err) {
    console.error("[retail-transactions-basket]", err);
    return res.status(500).json({ error: "Failed to load Retail Transactions & Basket data", message: err?.message || "" });
  }
}
