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
// Same dashboard-wide Date Range preset shape as every other retail
// report, current-window only — see api/_retail-sales-overview.js's
// resolveRange for the full comment on each preset.
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    return { from: fromParam <= toParam ? fromParam : toParam, to: fromParam <= toParam ? toParam : fromParam };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  }
  if (range === "prevMonth") {
    const to = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(to), to };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today };
}

// Revenue/Transactions/ABS drill-down: Retail vs Wholesale, regardless of
// the dashboard's current Segment filter — the whole point of this view
// is to see both sides at once. "Retail" = the 13 walk-in/legacy branches
// + HRH Online, same as the Segment filter's own "Retail" option.
export async function handleRetailSalesSegmentBreakdown(req, res) {
  try {
    const range = req.query.range || "wtd";
    let current;
    try {
      current = resolveRange(range, req.query.from, req.query.to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const rows = await client
      .query({
        query: `
          SELECT multiIf(store_name IN {retailStores:Array(String)}, 'Retail', store_name IN {wholesaleStores:Array(String)}, 'Wholesale', 'Other') AS bucket,
            sum(net_sales_amount) AS revenue,
            uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
          FROM xv3.mart_net_sales
          WHERE store_name IN {allStores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY bucket
        `,
        query_params: {
          retailStores: RETAIL_STORES,
          wholesaleStores: WHOLESALE_STORES,
          allStores: [...RETAIL_STORES, ...WHOLESALE_STORES],
          from: current.from,
          to: current.to,
        },
        format: "JSONEachRow",
      })
      .then((r) => r.json());

    const byBucket = new Map(rows.map((r) => [r.bucket, r]));
    const rowsOut = ["Retail", "Wholesale"].map((bucket) => {
      const r = byBucket.get(bucket);
      const revenue = toNum(r?.revenue);
      const transactions = toNum(r?.transactions);
      return { label: bucket, revenue, transactions, abs: safeDivide(revenue, transactions) };
    });
    const total = {
      label: "Total",
      revenue: rowsOut.reduce((s, r) => s + r.revenue, 0),
      transactions: rowsOut.reduce((s, r) => s + r.transactions, 0),
    };
    total.abs = safeDivide(total.revenue, total.transactions);

    return res.status(200).json({
      meta: { range, current },
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
export async function handleRetailStoreEngagementBreakdown(req, res) {
  try {
    const range = req.query.range || "wtd";
    let current;
    try {
      current = resolveRange(range, req.query.from, req.query.to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const [trafficRows, customerRows] = await Promise.all([
      client
        .query({
          query: `SELECT store_name, sum(traffic_count) AS traffic FROM xv3.mart_foot_traffic_masterlist WHERE store_name IN {stores:Array(String)} AND date BETWEEN {from:String} AND {to:String} GROUP BY store_name`,
          query_params: { stores: WALK_IN_STORES, from: current.from, to: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT store_name, customer_recency, uniqExact(customer_name) AS n
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
              AND customer_name IS NOT NULL AND trim(customer_name) != '' AND customer_name NOT IN ('n/a', 'WALK IN') AND match(customer_name, '[a-zA-Z]')
            GROUP BY store_name, customer_recency
          `,
          query_params: { stores: WALK_IN_STORES, from: current.from, to: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const trafficByStore = new Map(trafficRows.map((r) => [r.store_name, toNum(r.traffic)]));
    const custByStore = new Map();
    for (const r of customerRows) {
      if (!custByStore.has(r.store_name)) custByStore.set(r.store_name, { newCustomers: 0, returningCustomers: 0 });
      const bucket = custByStore.get(r.store_name);
      if (r.customer_recency === "One time customer") bucket.newCustomers = toNum(r.n);
      else if (r.customer_recency === "Repeat buyer") bucket.returningCustomers = toNum(r.n);
    }

    const rowsOut = WALK_IN_STORES.map((store) => {
      const cust = custByStore.get(store) || { newCustomers: 0, returningCustomers: 0 };
      return {
        label: store,
        footTraffic: trafficByStore.get(store) || 0,
        totalCustomers: cust.newCustomers + cust.returningCustomers,
        newCustomers: cust.newCustomers,
        returningCustomers: cust.returningCustomers,
      };
    }).sort((a, b) => b.footTraffic - a.footTraffic);

    const total = rowsOut.reduce(
      (acc, r) => ({
        label: "Total",
        footTraffic: acc.footTraffic + r.footTraffic,
        totalCustomers: acc.totalCustomers + r.totalCustomers,
        newCustomers: acc.newCustomers + r.newCustomers,
        returningCustomers: acc.returningCustomers + r.returningCustomers,
      }),
      { label: "Total", footTraffic: 0, totalCustomers: 0, newCustomers: 0, returningCustomers: 0 }
    );

    return res.status(200).json({
      meta: { range, current, stores: WALK_IN_STORES },
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
