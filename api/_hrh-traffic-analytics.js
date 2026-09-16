import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (like _bidderIdentity.js, _bucketing.js, etc. on the
// Auction side) so Vercel does NOT deploy this as its own Serverless
// Function — the project's Hobby plan caps deployments at 12 functions.
// api/hrh-sales-analytics.js imports and dispatches to
// `handleTrafficAnalytics` here when `?report=traffic` is present.
//
// --- Scoping history (read before touching this file) ---
// This page was originally wired to GA4 (via ClickHouse's `ga4` database,
// itself ETL'd from the SAME GA4 property every other whole-site table
// uses) at the (date, eventName) and (date, channel) grain — Sessions,
// Users, and the Add to Cart/Begin Checkout/Purchase funnel. That was
// reverted because those tables track HMR's WHOLE website, not HRH Online
// specifically, with no dimension to scope them down.
//
// Re-investigated 2026-09-16: HRH Online's storefront is
// https://hmr.ph/shop/ONP#/ — a client-side (hash-routed) SPA, and GA4
// records a real, clean pagePath for its landing/listing views:
//   - /shop/ONP        (203 distinct days seen, 2026-02-25 to present)
//   - /search/stores/ONP
// Verified these are genuine (not substring noise — a broad `%ONP%` search
// also matches unrelated slugs like "...uoonp"/"...onps5"/"donper" that
// happen to contain those letters; only these two exact paths are real).
// So Users/Page Views on THIS page ARE legitimately HRH-Online-scoped.
//
// What is still NOT scopable, and why this page does not show it:
//   - "Sessions": ga4_pages_path_report (GA4's "Pages and screens" report)
//     has no sessions metric, only totalUsers/screenPageViews/eventCount —
//     Page Views is used as the traffic KPI instead.
//   - Add to Cart: lives only in ga4_events_report, which is aggregated by
//     (date, eventName) with NO page dimension at all — there is no column
//     to join it back to pagePath by. No GA4 table anywhere in this
//     warehouse carries page + event together, so this stage is omitted
//     entirely rather than shown as an unscoped whole-site number.
//
// Re-investigated again 2026-09-16 for a fuller funnel: "Begin Checkout"
// and "Purchase" turn out to have a genuinely scoped real substitute after
// all — xv3.mart_xv3_order_report (store_name = HRH ONLINE, same store
// scope as everywhere else) carries `order_status`/`payment_status` per
// order. Every row in that table IS a completed checkout (an order record
// only exists once checkout finished), and `payment_status = 'Paid'` is a
// real, separate signal from "order exists" — so the funnel's Checkout and
// Payment Confirmed stages count orders from THIS table, deliberately
// counting every order regardless of what happened to it later (unlike
// the "Purchases" KPI and "Real Orders Received" elsewhere on the
// dashboard, which are net of cancellations by design — see
// hrh-online-metric-definitions memory). Don't "fix" these two numbers to
// match Purchases/Real Orders Received if they look different — they're
// answering a different question (did checkout/payment happen at all,
// not "how many orders net out to real sales").
//
// "Purchases"/"Revenue" in the KPI row stay on xv3.mart_net_sales (store
// HRH ONLINE, sales_channel HMRPH ONLINE) — same locked GMV/Orders
// definition Executive Overview and Sales Analytics use — rather than
// switching to mart_xv3_order_report, so this page's headline numbers
// don't silently diverge from the rest of the dashboard's contract.
//
// Revenue is NOT a funnel bar: funnel width is normally proportional to a
// raw count of the same unit across every stage (page views, users,
// orders) — pesos are a different scale entirely and would break that
// scaling. Total Revenue is shown as its own callout under the funnel
// panel instead, per explicit decision.
//
// ga4_pages_path_report is a ReplacingMergeTree keyed on
// (property_id, date, pagePath), versioned by _airbyte_extracted_at — same
// re-sync/versioning behavior as ga4_events_report (see that table's other
// callers). Querying without FINAL double/triple-counts recent days
// (verified: 2026-09-08 returned totalUsers=72 non-FINAL vs 36 FINAL, a
// clean 2x). Every query against it here uses FINAL.
const GA4_PROPERTY_ID = "314716873";
const ONP_PAGE_PATHS = ["/shop/ONP", "/search/stores/ONP"];

// Same locked store/channel scope Executive Overview and Sales Analytics
// use — HRH Online's own website channel only (not TikTok/Shopee, which
// don't send traffic to hmr.ph and so have nothing to do with this page).
const HRH_STORE = "HRH ONLINE";
const HMRPH_ONLINE_CHANNEL = ["HMRPH ONLINE"];

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
// Date math — identical logic to api/hrh-executive-overview.js's resolveRange
// (Asia/Manila "today", WTD/MTD/YTD/Custom current+previous windows).
// Duplicated here (not imported) so this file stays self-contained, same
// convention as every other api/hrh-*.js file.
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
  // Full prior calendar week/month/year — NOT "to date" (see the shared
  // preset added to src/hrh-online/dateRange.js). Unlike wtd/mtd/ytd these
  // are already whole periods, so "previous" is simply the same full-period
  // shift repeated once more (no partial/elapsed-day clamping needed).
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

function enumerateDatesISO(from, to) {
  const dates = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return dates;
}

// ga4.*'s `date` column is the string 'YYYYMMDD' — lexicographic BETWEEN on
// this fixed-width format matches chronological order, so this is a pure
// reformat, not a real conversion.
function isoToYyyymmdd(iso) {
  return iso.replaceAll("-", "");
}

export async function handleTrafficAnalytics(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const superFromKey = isoToYyyymmdd(previous.from);
    const superToKey = isoToYyyymmdd(current.to);
    const curFromKey = isoToYyyymmdd(current.from);
    const curToKey = isoToYyyymmdd(current.to);
    const prevFromKey = isoToYyyymmdd(previous.from);
    const prevToKey = isoToYyyymmdd(previous.to);

    const [pageRows, salesRows, orderStatusRows] = await Promise.all([
      // Users + Page Views on HRH Online's own storefront pages only (see
      // file-header comment) — one query spanning the whole
      // previous+current super-range, grouped by date.
      client
        .query({
          query: `
            SELECT
              date,
              sum(totalUsers) AS users,
              sum(newUsers) AS newUsers,
              sum(screenPageViews) AS pageViews
            FROM ga4.ga4_pages_path_report FINAL
            WHERE property_id = {propertyId:String}
              AND pagePath IN {paths:Array(String)}
              AND date BETWEEN {superFrom:String} AND {superTo:String}
            GROUP BY date
          `,
          query_params: { propertyId: GA4_PROPERTY_ID, paths: ONP_PAGE_PATHS, superFrom: superFromKey, superTo: superToKey },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Real orders + GMV for HRH Online's own website channel (see
      // file-header comment on why this replaces GA4 purchase events) — one
      // query spanning the same super-range, grouped by transaction_date.
      client
        .query({
          query: `
            SELECT
              transaction_date AS d,
              uniqExactIf(invoice_id, net_sales_amount > 0) AS orders,
              sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY transaction_date
          `,
          query_params: { store: HRH_STORE, channels: HMRPH_ONLINE_CHANNEL, prevFrom: previous.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Checkout + Payment Confirmed funnel stages (see file-header comment
      // on why these deliberately count every order regardless of later
      // cancellation, unlike Purchases/Real Orders Received elsewhere).
      client
        .query({
          query: `
            SELECT
              toDate(created_at) AS d,
              count() AS orders,
              countIf(payment_status = 'Paid') AS paid
            FROM xv3.mart_xv3_order_report
            WHERE store_name = {store:String}
              AND toDate(created_at) BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY d
          `,
          query_params: { store: HRH_STORE, prevFrom: previous.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    // --- Aggregate pageRows into current/previous totals + daily users/page views ---
    let curUsers = 0;
    let curNewUsers = 0;
    let curPageViews = 0;
    let prevUsers = 0;
    let prevPageViews = 0;
    const usersByDate = new Map(); // date (yyyymmdd) -> users (current window only)
    const pageViewsByDate = new Map(); // date (yyyymmdd) -> page views (current window only)
    for (const r of pageRows) {
      const users = toNum(r.users);
      const newUsers = toNum(r.newUsers);
      const pageViews = toNum(r.pageViews);
      if (r.date >= curFromKey && r.date <= curToKey) {
        curUsers += users;
        curNewUsers += newUsers;
        curPageViews += pageViews;
        usersByDate.set(r.date, (usersByDate.get(r.date) || 0) + users);
        pageViewsByDate.set(r.date, (pageViewsByDate.get(r.date) || 0) + pageViews);
      } else if (r.date >= prevFromKey && r.date <= prevToKey) {
        prevUsers += users;
        prevPageViews += pageViews;
      }
    }
    // "Returning" is derived (Users - New Users), summed the same way Users
    // itself already is across the window (day-grain totals, so a visitor
    // active on 2 different days is counted twice in both — consistent with
    // itself, not a new precision issue introduced here).
    //
    // Caveat worth knowing before reading this split: GA4's `newUsers` is
    // scoped to the WHOLE property (first-ever visit to any hmr.ph page,
    // not first visit to /shop/ONP specifically) — so a longtime hmr.ph
    // visitor landing on this store page for the first time still counts as
    // "returning" here. Expect this to skew heavily toward Returning even
    // for a genuinely new-to-this-store audience.
    const curReturningUsers = Math.max(curUsers - curNewUsers, 0);

    // --- Aggregate salesRows into current/previous totals + daily orders ---
    let curOrders = 0;
    let curGmv = 0;
    let prevOrders = 0;
    let prevGmv = 0;
    const ordersByDate = new Map(); // date (ISO) -> orders (current window only)
    const gmvByDate = new Map(); // date (ISO) -> gmv (current window only)
    for (const r of salesRows) {
      const orders = toNum(r.orders);
      const gmv = toNum(r.gmv);
      if (r.d >= current.from && r.d <= current.to) {
        curOrders += orders;
        curGmv += gmv;
        ordersByDate.set(r.d, (ordersByDate.get(r.d) || 0) + orders);
        gmvByDate.set(r.d, (gmvByDate.get(r.d) || 0) + gmv);
      } else if (r.d >= previous.from && r.d <= previous.to) {
        prevOrders += orders;
        prevGmv += gmv;
      }
    }

    // --- Aggregate orderStatusRows into current-window Checkout/Payment
    // Confirmed funnel counts (see file-header comment on scope). ---
    let curCheckoutOrders = 0;
    let curPaidOrders = 0;
    for (const r of orderStatusRows) {
      if (r.d >= current.from && r.d <= current.to) {
        curCheckoutOrders += toNum(r.orders);
        curPaidOrders += toNum(r.paid);
      }
    }

    const curConversionRate = safeDivide(curOrders, curPageViews) * 100;
    const prevConversionRate = safeDivide(prevOrders, prevPageViews) * 100;
    const curRevPerView = safeDivide(curGmv, curPageViews);
    const prevRevPerView = safeDivide(prevGmv, prevPageViews);
    const curViewsPerUser = safeDivide(curPageViews, curUsers);
    const prevViewsPerUser = safeDivide(prevPageViews, prevUsers);

    const kpis = {
      users: { value: curUsers, delta: pctDelta(curUsers, prevUsers) },
      pageViews: { value: curPageViews, delta: pctDelta(curPageViews, prevPageViews) },
      purchases: { value: curOrders, delta: pctDelta(curOrders, prevOrders) },
      conversionRate: { value: curConversionRate, delta: pctDelta(curConversionRate, prevConversionRate) },
      revenuePerView: { value: curRevPerView, delta: pctDelta(curRevPerView, prevRevPerView) },
      pageViewsPerUser: { value: curViewsPerUser, delta: pctDelta(curViewsPerUser, prevViewsPerUser) },
    };

    // --- Conversion Funnel (current window only) — 4 count-based stages,
    // see file-header comment on why Add to Cart is omitted and why
    // Checkout/Payment Confirmed come from a different table (and can
    // legitimately differ from the Purchases KPI). Revenue is NOT a stage
    // here — shown as `totalRevenue` instead, see file-header comment.
    // Dropoff % is computed client-side by FunnelList, not here. ---
    const funnel = [
      { stage: "Page Views", count: curPageViews },
      { stage: "Users", count: curUsers },
      { stage: "Checkout", count: curCheckoutOrders },
      { stage: "Payment Confirmed", count: curPaidOrders },
    ];

    // New vs Returning Users (current window only) — see the curReturningUsers
    // comment above on how "Returning" is derived.
    const newVsReturning = [
      { label: "New Users", value: curNewUsers },
      { label: "Returning Users", value: curReturningUsers },
    ];

    // --- Daily trend (current window, zero-filled) — single source for both
    // trend charts and every KPI card's sparkline, rather than two
    // near-duplicate per-chart arrays. ---
    const dailyTrend = enumerateDatesISO(current.from, current.to).map((iso) => {
      const key = isoToYyyymmdd(iso);
      const users = usersByDate.get(key) || 0;
      const pageViews = pageViewsByDate.get(key) || 0;
      const purchases = ordersByDate.get(iso) || 0;
      const gmv = gmvByDate.get(iso) || 0;
      return {
        date: iso,
        users,
        pageViews,
        purchases,
        conversionRate: safeDivide(purchases, pageViews) * 100,
        revenuePerView: safeDivide(gmv, pageViews),
        pageViewsPerUser: safeDivide(pageViews, users),
      };
    });

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current,
        previous,
        property: GA4_PROPERTY_ID,
        scopeNote:
          "Users/Page Views: GA4 pagePath scoped to hmr.ph/shop/ONP (HRH Online's storefront) — real, store-specific data, but GA4 has no 'sessions' metric at this grain. Checkout/Payment Confirmed: real order-status counts from HRH Online's own order records (every order regardless of later cancellation — a different question from the Purchases KPI, which nets out cancellations). Purchases/Revenue: real HRH Online website orders (HMRPH Online channel), not GA4 purchase events — those can't be scoped to a single store in this data source. Add to Cart is omitted, not zeroed: no scoped source exists for it anywhere in this warehouse.",
        generatedAt: new Date().toISOString(),
      },
      kpis,
      funnel,
      totalRevenue: curGmv,
      newVsReturning,
      dailyTrend,
    });
  } catch (err) {
    console.error("HRH Traffic & Conversion API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Traffic & Conversion",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
