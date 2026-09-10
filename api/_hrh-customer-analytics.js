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
// Resolves ONLY the current window from the Date Range filter (WTD/MTD/
// YTD/Custom) — the comparison window is a separate, user-chosen concern,
// see resolveComparisonWindow below (identical split to
// api/hrh-executive-overview.js's resolveRange/resolveComparisonWindow).
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { current: { from, to } };
  }
  if (range === "mtd") {
    return { current: { from: firstOfMonthISO(today), to: today } };
  }
  if (range === "ytd") {
    return { current: { from: `${today.slice(0, 4)}-01-01`, to: today } };
  }
  return { current: { from: mondayOfWeek(today), to: today } };
}

// "Compare to" — shifts the whole current window back by a fixed amount
// (1 day / 7 days / 1 calendar month), independent of the Date Range
// filter's own span or type — same control as Executive Overview's
// scorecards (api/hrh-executive-overview.js's resolveComparisonWindow).
function resolveComparisonWindow(current, compareTo) {
  const { from, to } = current;
  if (compareTo === "day") return { from: addDaysISO(from, -1), to: addDaysISO(to, -1) };
  if (compareTo === "month") return { from: shiftMonthsClampedISO(from, -1), to: shiftMonthsClampedISO(to, -1) };
  return { from: addDaysISO(from, -7), to: addDaysISO(to, -7) }; // "week" (default)
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
    const compareTo = ["day", "week", "month"].includes(req.query.compareTo) ? req.query.compareTo : "week";

    let current;
    try {
      ({ current } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const previous = resolveComparisonWindow(current, compareTo);

    // Per-customer window aggregation — ONE query covering previous+current,
    // conditionally aggregated (same pattern as every other api/hrh-*.js
    // KPI query).
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
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_orders,
            minIf(transaction_date, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_first_txn,
            maxIf(transaction_date, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_last_txn,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_orders,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv
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

    // New vs Returning — "one-time buyer status": New = this customer has
    // placed exactly ONE order ever, across their ENTIRE history with HMR
    // (any store, any channel, any date) as of right now. Returning = 2+
    // lifetime orders. Deliberately NOT tied to the selected date range at
    // all (an earlier "first order fell inside this window" definition was
    // tried and rejected — it made New shrink to near-zero on a 1-day
    // filter purely because a customer's literal first-ever-anything-day
    // rarely lands on any one specific day you happen to be viewing).
    // A customer's label is fixed as of today: if they were a one-time
    // buyer last month but ordered again since, they read as Returning
    // everywhere, including in past periods — this is intentional, not a
    // bug (see prevNewCount below).
    //
    // Lifetime count is computed by `ct.customer_name`, not customer_id —
    // verified customer_id is NOT a stable cross-store identity (a real
    // customer active at 4 different stores carried 2 different
    // customer_ids, split across store groupings, which would have
    // undercounted her lifetime orders as 3 and 2 instead of 5).
    // customer_name is the same cross-store key already trusted elsewhere
    // in this app (cust_first_order_date, Executive Overview's Customer
    // Segments) — verified it recovers her correct lifetime total of 5.
    // Known limitation inherited from that same precedent: very common
    // names (e.g. "Michael Reyes") can collide across genuinely different
    // people, which would overcount their combined lifetime orders and
    // misclassify some of them as Returning when they're actually
    // first-time buyers — a data-quality ceiling, not something fixable
    // from this table alone.
    const names = [...new Set(rows.map((r) => r.customer_name).filter(Boolean))];
    let lifetimeMap = new Map();
    if (names.length) {
      const lifetimeRows = await (
        await client.query({
          query: `
            SELECT \`ct.customer_name\` AS name, uniqExactIf(invoice_id, net_sales_amount > 0) AS lifetime_orders
            FROM xv3.mart_net_sales
            WHERE \`ct.customer_name\` IN {names:Array(String)}
            GROUP BY name
          `,
          query_params: { names },
          format: "JSONEachRow",
        })
      ).json();
      lifetimeMap = new Map(lifetimeRows.map((r) => [r.name, toNum(r.lifetime_orders)]));
    }
    const isOneTimeBuyer = (name) => lifetimeMap.get(name) === 1;

    const curCustomers = rows
      .filter((r) => toNum(r.cur_orders) > 0)
      .map((r) => ({
        customerId: r.customer_id,
        name: r.customer_name || "—",
        isNew: isOneTimeBuyer(r.customer_name),
        gmv: toNum(r.cur_gmv),
        units: toNum(r.cur_units),
        orders: toNum(r.cur_orders),
        firstTxn: r.cur_first_txn,
        lastTxn: r.cur_last_txn,
      }));
    const prevActiveRows = rows.filter((r) => toNum(r.prev_orders) > 0);
    const prevOrderCount = prevActiveRows.length;
    const prevNewCount = prevActiveRows.filter((r) => isOneTimeBuyer(r.customer_name)).length;
    const prevReturningCount = prevOrderCount - prevNewCount;

    const curUnique = curCustomers.length;
    const curNew = curCustomers.filter((c) => c.isNew).length;
    const curReturning = curUnique - curNew;
    const curRepeat = curCustomers.filter((c) => c.orders >= 2).length;
    const curGmvTotal = curCustomers.reduce((s, c) => s + c.gmv, 0);

    const curRepeatRate = safeDivide(curRepeat, curUnique) * 100;
    const curSalesPerCustomer = safeDivide(curGmvTotal, curUnique);

    const prevRepeatCount = prevActiveRows.filter((r) => toNum(r.prev_orders) >= 2).length;
    const prevGmvTotal = prevActiveRows.reduce((s, r) => s + toNum(r.prev_gmv), 0);
    const prevRepeatRate = safeDivide(prevRepeatCount, prevOrderCount) * 100;
    const prevSalesPerCustomer = safeDivide(prevGmvTotal, prevOrderCount);

    const kpis = {
      uniqueCustomers: { value: curUnique, previous: prevOrderCount, delta: pctDelta(curUnique, prevOrderCount) },
      newCustomers: { value: curNew, previous: prevNewCount, delta: pctDelta(curNew, prevNewCount) },
      returningCustomers: { value: curReturning, previous: prevReturningCount, delta: pctDelta(curReturning, prevReturningCount) },
      repeatRate: { value: curRepeatRate, previous: prevRepeatRate, delta: pctDelta(curRepeatRate, prevRepeatRate) },
      salesPerCustomer: { value: curSalesPerCustomer, previous: prevSalesPerCustomer, delta: pctDelta(curSalesPerCustomer, prevSalesPerCustomer) },
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

    // Customer Trend — New/Returning classified per bucket using the SAME
    // lifetime-order-count definition as the KPIs above (isOneTimeBuyer),
    // not a per-bucket or per-window boundary — a customer's label is a
    // fixed, today-as-of fact about them, so it's identical in every
    // bucket they appear in. This IS a per-bucket ACTIVITY breakdown, not a
    // re-partition of the whole-window unique count: a customer active in
    // multiple buckets legitimately shows as "New" (or "Returning") in
    // each one, so bars can sum higher than the KPI's unique total — same
    // as multiple GA4 sessions from one user each counting toward
    // "sessions". Classification happens in JS (not SQL countIf) so it can
    // share the exact same lifetimeMap lookup as the KPIs, guaranteeing
    // the two can never drift out of sync.
    // Computed server-side (not via the client-side bucketRows() pattern)
    // since distinct-customer counts can't be safely summed across days the
    // way GMV/Orders sums can. All 3 granularities are precomputed here so
    // the page's Day/Week/Month toggle just switches between them
    // client-side, same "already fetched, no refetch on toggle" feel as
    // every other bucketed panel.
    async function fetchCustomerTrend(bucketExpr) {
      const trendRows = await (
        await client.query({
          query: `
            SELECT
              toString(${bucketExpr}) AS bucket,
              customer_id,
              any(\`ct.customer_name\`) AS customer_name
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND customer_id IS NOT NULL
              AND trim(\`ct.customer_name\`) NOT IN ('WALK IN', 'n/a')
              AND match(\`ct.customer_name\`, '[a-zA-Z]')
              AND net_sales_amount > 0
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY bucket, customer_id
          `,
          query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
      ).json();
      const byBucket = new Map();
      for (const r of trendRows) {
        const entry = byBucket.get(r.bucket) || { newCustomers: 0, returningCustomers: 0 };
        if (isOneTimeBuyer(r.customer_name)) entry.newCustomers += 1;
        else entry.returningCustomers += 1;
        byBucket.set(r.bucket, entry);
      }
      return [...byBucket.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([bucket, v]) => ({ bucket, ...v }));
    }
    const [trendDay, trendWeek, trendMonth] = await Promise.all([
      fetchCustomerTrend("toDate(transaction_date)"),
      fetchCustomerTrend("toStartOfWeek(transaction_date, 1)"),
      fetchCustomerTrend("toStartOfMonth(transaction_date)"),
    ]);
    const customerTrend = { day: trendDay, week: trendWeek, month: trendMonth };

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        range,
        compareTo,
        current,
        previous,
        customerScopeNote:
          "Excludes orders with no captured buyer identity ('WALK IN' — mostly TikTok/Shopee marketplace orders, which never carry a real customer profile); those share a single placeholder customer record and would otherwise wreck every count below.",
        newCustomerDefinition:
          "New = this customer has placed exactly one order ever, across their entire history with HMR (any store, any channel) as of today. Returning = two or more lifetime orders. Not tied to the selected date range — a customer's label stays the same regardless of what period you're viewing.",
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
