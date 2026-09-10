import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions
// and is already exactly at that cap, so this can't be its own route.
// api/hrh-sales-analytics.js dispatches here on `?report=customers`.
//
// Locked HRH Online sales contract — identical to every other api/hrh-*.js
// file (store scope, channel scope). Duplicated here as small self-contained
// functions rather than imported, so this file can never accidentally
// change another page's behavior.
const HRH_STORE = "HRH ONLINE";
const CHANNEL_MAP = {
  "All Channels": ["HMRPH ONLINE", "TIKTOK", "SHOPEE"],
  "HMRPH Online": ["HMRPH ONLINE"],
  TikTok: ["TIKTOK"],
  Shopee: ["SHOPEE"],
};

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

// ---------------------------------------------------------------------
// Date math — identical logic to api/hrh-executive-overview.js's resolveRange.
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
function daysBetweenISO(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
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
  const to = today;
  const from = mondayOfWeek(to);
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
}

// Which segment/bucket a per-customer window GMV falls into.
function valueSegment(gmv) {
  if (gmv >= 5000) return "High Value";
  if (gmv >= 1000) return "Mid Value";
  return "Low Value";
}
function spendBucket(gmv) {
  if (gmv >= 10000) return "₱10K+";
  if (gmv >= 5000) return "₱5K–₱10K";
  if (gmv >= 1000) return "₱1K–₱5K";
  return "< ₱1K";
}
function frequencyBucket(orders) {
  if (orders >= 6) return "6+ orders";
  if (orders >= 3) return "3–5 orders";
  if (orders === 2) return "2 orders";
  return "1 order";
}

const TOP_CUSTOMERS_SHOWN = 100;

export async function handleCustomerAnalytics(req, res) {
  try {
    const { channel = "All Channels", from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];

    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    // Per-customer window aggregation — ONE query covering previous+current,
    // conditionally aggregated (same pattern as every other api/hrh-*.js
    // KPI query). `first_order_date` is the customer's cross-store,
    // all-time-first HRH-family order (cust_first_order_date on
    // xv3.mart_net_sales) — deliberately NOT scoped to this store alone, same
    // reasoning as Executive Overview's Customer Segments: a customer who's
    // shopped at a physical branch for years is correctly NOT "new" just
    // because this is their first HRH Online order.
    //
    // `ct.customer_name` = 'WALK IN' is EXCLUDED — verified this session
    // (Executive Overview's Customer Segments) that every TikTok/Shopee
    // order (and some HMRPH Online ones) with no captured buyer identity
    // shares this one literal string, and — verified again just now — they
    // ALL share ONE customer_id (1068086): 18,815 real TikTok buyers alone
    // were merging into a single fake "customer" with 18,889 orders,
    // wrecking Unique Customers, Top Customers, and every distribution
    // below. Same exclusion condition as Customer Segments ('n/a' + a
    // real-letters check) for consistency.
    const rows = await (
      await client.query({
        query: `
          SELECT
            customer_id,
            any(\`ct.customer_name\`) AS customer_name,
            any(toDate(cust_first_order_date)) AS first_order_date,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_orders,
            minIf(transaction_date, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_first_txn,
            maxIf(transaction_date, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_last_txn,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_orders
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND customer_id IS NOT NULL
            AND trim(\`ct.customer_name\`) NOT IN ('WALK IN', 'n/a')
            AND match(\`ct.customer_name\`, '[a-zA-Z]')
            AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          GROUP BY customer_id
          HAVING cur_orders > 0 OR prev_orders > 0
        `,
        query_params: {
          store: HRH_STORE,
          channels,
          curFrom: current.from,
          curTo: current.to,
          prevFrom: previous.from,
          prevTo: previous.to,
        },
        format: "JSONEachRow",
      })
    ).json();

    const curCustomers = rows
      .filter((r) => toNum(r.cur_orders) > 0)
      .map((r) => ({
        customerId: r.customer_id,
        name: r.customer_name || "—",
        firstOrderDate: r.first_order_date,
        gmv: toNum(r.cur_gmv),
        units: toNum(r.cur_units),
        orders: toNum(r.cur_orders),
        firstTxn: r.cur_first_txn,
        lastTxn: r.cur_last_txn,
      }));
    const prevOrderCount = rows.filter((r) => toNum(r.prev_orders) > 0).length;
    const prevNewCount = rows.filter((r) => toNum(r.prev_orders) > 0 && r.first_order_date && r.first_order_date >= previous.from).length;
    const prevReturningCount = prevOrderCount - prevNewCount;

    const curUnique = curCustomers.length;
    const curNew = curCustomers.filter((c) => c.firstOrderDate && c.firstOrderDate >= current.from).length;
    const curReturning = curUnique - curNew;
    const curRepeat = curCustomers.filter((c) => c.orders >= 2).length;
    const curGmvTotal = curCustomers.reduce((s, c) => s + c.gmv, 0);

    const curRepeatRate = safeDivide(curRepeat, curUnique) * 100;
    const curSalesPerCustomer = safeDivide(curGmvTotal, curUnique);
    // Previous-period repeat rate/sales-per-customer aren't derivable from
    // this query without a second full per-customer pass (prev_gmv wasn't
    // selected above to keep this a single lean query) — only Unique/New/
    // Returning get a real previous-period comparison; Repeat Rate and
    // Sales/Customer show no delta rather than a fabricated one.
    const kpis = {
      uniqueCustomers: { value: curUnique, delta: pctDelta(curUnique, prevOrderCount) },
      newCustomers: { value: curNew, delta: pctDelta(curNew, prevNewCount) },
      returningCustomers: { value: curReturning, delta: pctDelta(curReturning, prevReturningCount) },
      repeatRate: { value: curRepeatRate, delta: null },
      salesPerCustomer: { value: curSalesPerCustomer, delta: null },
    };

    const newVsReturning = [
      { segment: "New", count: curNew },
      { segment: "Returning", count: curReturning },
    ];

    const valueSegments = { "High Value": 0, "Mid Value": 0, "Low Value": 0 };
    const spendBuckets = { "< ₱1K": 0, "₱1K–₱5K": 0, "₱5K–₱10K": 0, "₱10K+": 0 };
    const frequencyBuckets = { "1 order": 0, "2 orders": 0, "3–5 orders": 0, "6+ orders": 0 };
    for (const c of curCustomers) {
      valueSegments[valueSegment(c.gmv)] += 1;
      spendBuckets[spendBucket(c.gmv)] += 1;
      frequencyBuckets[frequencyBucket(c.orders)] += 1;
    }

    const topCustomers = [...curCustomers]
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, TOP_CUSTOMERS_SHOWN)
      .map((c) => ({
        customer: c.name,
        orders: c.orders,
        units: c.units,
        gmv: c.gmv,
        aov: safeDivide(c.gmv, c.orders),
        firstPurchase: c.firstTxn,
        lastBuy: c.lastTxn,
      }));

    // Customer Trend — New/Returning classified PER BUCKET (a customer's
    // first-ever order falling within THAT bucket's own date span = New for
    // that bucket), computed server-side via SQL grouping rather than
    // client-side day-bucket summing — distinct-customer counts don't sum
    // across days the way GMV/Orders do (the same customer buying on two
    // different days in one week must count once, not twice), so this can't
    // reuse the client-side bucketRows() pattern other trend panels use.
    const bucketUnit = daysBetweenISO(current.from, current.to) + 1 > 60 ? "week" : "day";
    const bucketExpr = bucketUnit === "week" ? "toStartOfWeek(transaction_date, 1)" : "toDate(transaction_date)";
    const trendRows = await (
      await client.query({
        query: `
          WITH per_bucket_customer AS (
            SELECT
              ${bucketExpr} AS bucket_date,
              customer_id,
              any(toDate(cust_first_order_date)) AS first_order_date
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND customer_id IS NOT NULL
              AND trim(\`ct.customer_name\`) NOT IN ('WALK IN', 'n/a')
              AND match(\`ct.customer_name\`, '[a-zA-Z]')
              AND net_sales_amount > 0
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY bucket_date, customer_id
          )
          SELECT
            toString(bucket_date) AS bucket,
            countIf(first_order_date >= bucket_date) AS new_customers,
            countIf(first_order_date < bucket_date OR first_order_date IS NULL) AS returning_customers
          FROM per_bucket_customer
          GROUP BY bucket_date
          ORDER BY bucket_date
        `,
        query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    const customerTrend = trendRows.map((r) => ({
      bucket: r.bucket,
      newCustomers: toNum(r.new_customers),
      returningCustomers: toNum(r.returning_customers),
    }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        range,
        current,
        previous,
        bucketUnit,
        customerScopeNote:
          "Excludes orders with no captured buyer identity ('WALK IN' — mostly TikTok/Shopee marketplace orders, which never carry a real customer profile); those share a single placeholder customer record and would otherwise wreck every count below.",
        generatedAt: new Date().toISOString(),
      },
      kpis,
      newVsReturning,
      valueSegments: Object.entries(valueSegments).map(([segment, count]) => ({ segment, count })),
      spendDistribution: Object.entries(spendBuckets).map(([bucket, count]) => ({ bucket, count })),
      purchaseFrequency: Object.entries(frequencyBuckets).map(([bucket, count]) => ({ bucket, count })),
      customerTrend,
      topCustomers,
    });
  } catch (err) {
    console.error("HRH Customer Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Customer Analytics",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
