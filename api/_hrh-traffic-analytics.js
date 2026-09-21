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

// Other branches that currently have their own real online store, per
// explicit list — same /shop/{code} + /search/stores/{code} GA4 page
// pattern as HRH Online's own ONP, and a real xv3.stores row mapping each
// code to its current store_name (used to scope the Orders/Revenue
// queries the same way HRH_STORE does above). Several OTHER codes
// (CUB/CEBU/RCDO/HCM/FVT/HTO) also have real GA4 traffic on this same
// page pattern, but were deliberately left out — not currently real
// online stores, per explicit correction — so this list is intentionally
// narrower than "every code with GA4 traffic." Deliberately excludes HRH
// Online itself (that's the section above, not a dropdown option).
const BRANCHES = [
  { code: "PIO", storeName: "PIONEER", label: "Pioneer" },
  { code: "CTA", storeName: "S AND C CAINTA", label: "Cainta" },
  { code: "HSR", storeName: "HMR SUCAT", label: "Sucat" },
  { code: "MAB", storeName: "MABALACAT", label: "Mabalacat" },
  { code: "SRR", storeName: "HMR TAGAYTAY ROAD", label: "Santa Rosa Road" },
  { code: "SUB", storeName: "SUBIC MAIN", label: "Subic" },
];
function findBranch(code) {
  return BRANCHES.find((b) => b.code === code) || null;
}

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
// Shared per-scope aggregation — the exact same shape of work (GA4 page
// rows -> Users/Page Views, real GMV rows -> Revenue, real order-status
// rows -> Orders/Completed Order) now happens for 3 scopes (HRH Online,
// Whole Site excluding HRH, and an optional selected Branch), so it's
// factored into these 3 functions rather than copy-pasted 3 times.
// ---------------------------------------------------------------------
function aggregatePageRows(rows, curFromKey, curToKey, prevFromKey, prevToKey) {
  let curUsers = 0;
  let curNewUsers = 0;
  let curPageViews = 0;
  let prevUsers = 0;
  let prevPageViews = 0;
  const usersByDate = new Map(); // date (yyyymmdd) -> users (current window only)
  const pageViewsByDate = new Map(); // date (yyyymmdd) -> page views (current window only)
  for (const r of rows) {
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
  // See the ONP-scoped comment this was lifted from: GA4's `newUsers` is
  // scoped to the WHOLE property, not to these specific pages, so this
  // skews heavily Returning for any specific page/store scope.
  const curReturningUsers = Math.max(curUsers - curNewUsers, 0);
  return { curUsers, curNewUsers, curReturningUsers, curPageViews, prevUsers, prevPageViews, usersByDate, pageViewsByDate };
}
function aggregateGmvRows(rows, current, previous) {
  let curGmv = 0;
  let prevGmv = 0;
  const gmvByDate = new Map(); // date (ISO) -> gmv (current window only)
  for (const r of rows) {
    const gmv = toNum(r.gmv);
    if (r.d >= current.from && r.d <= current.to) {
      curGmv += gmv;
      gmvByDate.set(r.d, (gmvByDate.get(r.d) || 0) + gmv);
    } else if (r.d >= previous.from && r.d <= previous.to) {
      prevGmv += gmv;
    }
  }
  return { curGmv, prevGmv, gmvByDate };
}
function aggregateOrderStatusRows(rows, current, previous) {
  let curOrders = 0;
  let curPaidOrders = 0;
  let prevOrders = 0;
  const ordersByDate = new Map(); // date (ISO) -> orders (current window only)
  for (const r of rows) {
    const orders = toNum(r.orders);
    const paid = toNum(r.paid);
    if (r.d >= current.from && r.d <= current.to) {
      curOrders += orders;
      curPaidOrders += paid;
      ordersByDate.set(r.d, (ordersByDate.get(r.d) || 0) + orders);
    } else if (r.d >= previous.from && r.d <= previous.to) {
      prevOrders += orders;
    }
  }
  return { curOrders, curPaidOrders, prevOrders, ordersByDate };
}

// Builds the {kpis, funnel, totalRevenue, newVsReturning, dailyTrend} shape
// every section (HRH Online, Whole Site excl. HRH, a selected Branch)
// renders with the same frontend component. `extraFunnelStages` (e.g. Add
// to Cart for Whole Site, which has no page-dimension limitation) are
// inserted between Users and Checkout.
function buildTrafficSection(pageAgg, gmvAgg, orderAgg, current, extraFunnelStages = []) {
  const conversionRate = safeDivide(orderAgg.curOrders, pageAgg.curPageViews) * 100;
  const prevConversionRate = safeDivide(orderAgg.prevOrders, pageAgg.prevPageViews) * 100;
  const revPerView = safeDivide(gmvAgg.curGmv, pageAgg.curPageViews);
  const prevRevPerView = safeDivide(gmvAgg.prevGmv, pageAgg.prevPageViews);
  const viewsPerUser = safeDivide(pageAgg.curPageViews, pageAgg.curUsers);
  const prevViewsPerUser = safeDivide(pageAgg.prevPageViews, pageAgg.prevUsers);

  const kpis = {
    users: { value: pageAgg.curUsers, delta: pctDelta(pageAgg.curUsers, pageAgg.prevUsers) },
    pageViews: { value: pageAgg.curPageViews, delta: pctDelta(pageAgg.curPageViews, pageAgg.prevPageViews) },
    // "Orders" — raw checkout count, regardless of outcome (see
    // aggregateOrderStatusRows' source comment). Replaces the old
    // net-of-cancellation "Purchases" KPI per explicit request.
    orders: { value: orderAgg.curOrders, delta: pctDelta(orderAgg.curOrders, orderAgg.prevOrders) },
    conversionRate: { value: conversionRate, delta: pctDelta(conversionRate, prevConversionRate) },
    revenuePerView: { value: revPerView, delta: pctDelta(revPerView, prevRevPerView) },
    pageViewsPerUser: { value: viewsPerUser, delta: pctDelta(viewsPerUser, prevViewsPerUser) },
  };

  const funnel = [
    { stage: "Page Views", count: pageAgg.curPageViews },
    { stage: "Users", count: pageAgg.curUsers },
    ...extraFunnelStages,
    { stage: "Checkout", count: orderAgg.curOrders },
    { stage: "Completed Order", count: orderAgg.curPaidOrders },
  ];

  const newVsReturning = [
    { label: "New Users", value: pageAgg.curNewUsers },
    { label: "Returning Users", value: pageAgg.curReturningUsers },
  ];

  const dailyTrend = enumerateDatesISO(current.from, current.to).map((iso) => {
    const key = isoToYyyymmdd(iso);
    const users = pageAgg.usersByDate.get(key) || 0;
    const pageViews = pageAgg.pageViewsByDate.get(key) || 0;
    const orders = orderAgg.ordersByDate.get(iso) || 0;
    const gmv = gmvAgg.gmvByDate.get(iso) || 0;
    return {
      date: iso,
      users,
      pageViews,
      orders,
      conversionRate: safeDivide(orders, pageViews) * 100,
      revenuePerView: safeDivide(gmv, pageViews),
      pageViewsPerUser: safeDivide(pageViews, users),
    };
  });

  return { kpis, funnel, totalRevenue: gmvAgg.curGmv, newVsReturning, dailyTrend };
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
    const branch = findBranch(req.query.branch);

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

    // Base queries (always run) + optional branch-scoped ones, appended
    // conditionally so a request with no `branch` selected doesn't pay for
    // 3 extra round-trips it won't use.
    const queryResults = await Promise.all([
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
      // Real GMV (Revenue) for HRH Online's own website channel — one
      // query spanning the same super-range, grouped by transaction_date.
      // Orders/Completed Order (below) are the order-COUNT metrics; this is
      // only ever used for the Revenue/Revenue-per-View numbers.
      client
        .query({
          query: `
            SELECT
              transaction_date AS d,
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
      // Orders (raw, every checkout regardless of outcome) + Completed
      // Order (payment_status = 'Paid') — the funnel's Checkout/Completed
      // Order stages, and now also the "Orders" KPI/Conversion Rate's
      // source (previously a net-of-cancellation Purchases count from
      // mart_net_sales; replaced with this raw+completed pair per explicit
      // request). Deliberately counts every order regardless of later
      // cancellation — a different question from Real Orders Received
      // elsewhere on the dashboard, which nets cancellations out.
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
      // WHOLE-SITE (all of hmr.ph, every page/store — not just HRH Online's
      // /shop/ONP pages) — added for direct comparison against the
      // HRH-scoped numbers above. ga4_events_report is (date, eventName)
      // grain with NO page dimension, so it can't be scoped to one store —
      // but that's exactly what makes it the right source for a genuine
      // whole-site total (see file-header comment on why this table was
      // originally tried and reverted for the HRH-only numbers specifically).
      // Verified directly against production ClickHouse before writing this:
      // for 2026-09-15, sum(eventCount) WHERE eventName='page_view' = 32,931,
      // an EXACT match to sum(screenPageViews) across every pagePath row in
      // ga4_pages_path_report for that same date — confirming this table's
      // page_view eventCount really is whole-site Page Views, not a
      // different/incompatible number. totalUsers, by contrast, is NOT
      // safe to sum across ga4_pages_path_report's many pagePath rows (a
      // user who viewed 2 pages gets counted twice) — that inflated 23,780
      // vs this table's real distinct 12,917 page_view users for the same
      // day, so Users/New Users below come from here, not that table.
      // 'first_visit' fires exactly once per user, on their first-ever
      // session — so its totalUsers IS that day's New Users, whole-site.
      client
        .query({
          query: `
            SELECT
              date,
              eventName,
              sum(totalUsers) AS users,
              sum(eventCount) AS events,
              sum(totalRevenue) AS revenue
            FROM ga4.ga4_events_report FINAL
            WHERE property_id = {propertyId:String}
              AND eventName IN {events:Array(String)}
              AND date BETWEEN {superFrom:String} AND {superTo:String}
            GROUP BY date, eventName
          `,
          query_params: {
            propertyId: GA4_PROPERTY_ID,
            events: ["page_view", "first_visit", "add_to_cart", "begin_checkout", "purchase"],
            superFrom: superFromKey,
            superTo: superToKey,
          },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Real GMV for EVERY OTHER branch's website channel, i.e. "whole site
      // excluding HRH Online" Revenue — same table/shape as the HRH-only
      // sales query above, just `!=` instead of `=`. Real order records
      // carry store_name, so this is an exact subtraction (unlike Users
      // below, which has no store dimension to filter on directly).
      client
        .query({
          query: `
            SELECT
              transaction_date AS d,
              sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name != {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY transaction_date
          `,
          query_params: { store: HRH_STORE, channels: HMRPH_ONLINE_CHANNEL, prevFrom: previous.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Orders (raw, every checkout regardless of outcome) + Completed
      // Order (payment_status = 'Paid') for EVERY OTHER branch — same table/
      // shape as the HRH-only order-status query above. mart_xv3_order_report
      // carries store_name for every branch (verified), so — like GMV above
      // — this is a real, exact "not HRH" count, not a GA4-event approximation.
      client
        .query({
          query: `
            SELECT
              toDate(created_at) AS d,
              count() AS orders,
              countIf(payment_status = 'Paid') AS paid
            FROM xv3.mart_xv3_order_report
            WHERE store_name != {store:String}
              AND toDate(created_at) BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY d
          `,
          query_params: { store: HRH_STORE, prevFrom: previous.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Optional: one specific OTHER branch, selected via the Branch
      // dropdown (see BRANCHES above) — same 3-query shape as HRH Online's
      // own section (pages_path_report for Users/Page Views, mart_net_sales
      // for Revenue, mart_xv3_order_report for Orders/Completed Order),
      // just swapping in that branch's own page paths/store_name. Only run
      // when a branch is actually selected.
      ...(branch
        ? [
            client
              .query({
                query: `
                  SELECT date, sum(totalUsers) AS users, sum(newUsers) AS newUsers, sum(screenPageViews) AS pageViews
                  FROM ga4.ga4_pages_path_report FINAL
                  WHERE property_id = {propertyId:String}
                    AND pagePath IN {paths:Array(String)}
                    AND date BETWEEN {superFrom:String} AND {superTo:String}
                  GROUP BY date
                `,
                query_params: {
                  propertyId: GA4_PROPERTY_ID,
                  paths: [`/shop/${branch.code}`, `/search/stores/${branch.code}`],
                  superFrom: superFromKey,
                  superTo: superToKey,
                },
                format: "JSONEachRow",
              })
              .then((r) => r.json()),
            client
              .query({
                query: `
                  SELECT transaction_date AS d, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
                  FROM xv3.mart_net_sales
                  WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)}
                    AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
                  GROUP BY transaction_date
                `,
                query_params: { store: branch.storeName, channels: HMRPH_ONLINE_CHANNEL, prevFrom: previous.from, curTo: current.to },
                format: "JSONEachRow",
              })
              .then((r) => r.json()),
            client
              .query({
                query: `
                  SELECT toDate(created_at) AS d, count() AS orders, countIf(payment_status = 'Paid') AS paid
                  FROM xv3.mart_xv3_order_report
                  WHERE store_name = {store:String} AND toDate(created_at) BETWEEN {prevFrom:String} AND {curTo:String}
                  GROUP BY d
                `,
                query_params: { store: branch.storeName, prevFrom: previous.from, curTo: current.to },
                format: "JSONEachRow",
              })
              .then((r) => r.json()),
          ]
        : []),
    ]);
    const [
      pageRows,
      salesRows,
      orderStatusRows,
      wholeSiteRows,
      otherBranchesSalesRows,
      otherBranchesOrderStatusRows,
      branchPageRows = [],
      branchSalesRows = [],
      branchOrderStatusRows = [],
    ] = queryResults;

    // --- HRH Online (scoped to /shop/ONP + /search/stores/ONP) ---
    const hrhPageAgg = aggregatePageRows(pageRows, curFromKey, curToKey, prevFromKey, prevToKey);
    const hrhGmvAgg = aggregateGmvRows(salesRows, current, previous);
    const hrhOrderAgg = aggregateOrderStatusRows(orderStatusRows, current, previous);
    const hrhSection = buildTrafficSection(hrhPageAgg, hrhGmvAgg, hrhOrderAgg, current);

    // --- WHOLE SITE EXCLUDING HRH ONLINE ---
    // Users/Page Views: ga4_events_report's whole-property totals (no page
    // dimension) minus HRH's own page-scoped totals above — valid, exact
    // subtraction for Page Views (both sides are the same "page_view"
    // metric, verified equal in the comment below); Users/New Users are
    // subtracted the same way but are a small approximation (a visitor who
    // viewed both HRH's pages and other pages this window is removed
    // entirely, not split between the two sides) — negligible in practice
    // since HRH is a small fraction of whole-site traffic, but not exact
    // the way Page Views is.
    // Orders/Completed Order/Revenue: real order records (mart_xv3_order_
    // report / mart_net_sales) filtered to store_name != 'HRH ONLINE' — an
    // exact "not HRH" subtraction, no GA4-event mixing at all.
    const wholeSiteAgg = { pageViewUsers: 0, pageViews: 0, firstVisitUsers: 0, addToCart: 0, beginCheckout: 0 };
    const wholeSitePrevAgg = { pageViewUsers: 0, pageViews: 0 };
    const wholeSitePageViewsByDate = new Map(); // date (yyyymmdd) -> whole-site page views (current window only)
    const wholeSiteUsersByDate = new Map(); // date (yyyymmdd) -> whole-site page_view users (current window only)
    for (const r of wholeSiteRows) {
      const users = toNum(r.users);
      const events = toNum(r.events);
      const inCurrent = r.date >= curFromKey && r.date <= curToKey;
      const inPrevious = r.date >= prevFromKey && r.date <= prevToKey;
      if (inCurrent) {
        if (r.eventName === "page_view") {
          wholeSiteAgg.pageViewUsers += users;
          wholeSiteAgg.pageViews += events;
          wholeSitePageViewsByDate.set(r.date, events);
          wholeSiteUsersByDate.set(r.date, users);
        } else if (r.eventName === "first_visit") wholeSiteAgg.firstVisitUsers += users;
        else if (r.eventName === "add_to_cart") wholeSiteAgg.addToCart += events;
        else if (r.eventName === "begin_checkout") wholeSiteAgg.beginCheckout += events;
      } else if (inPrevious && r.eventName === "page_view") {
        wholeSitePrevAgg.pageViewUsers += users;
        wholeSitePrevAgg.pageViews += events;
      }
    }
    const exclPageAgg = {
      curUsers: Math.max(wholeSiteAgg.pageViewUsers - hrhPageAgg.curUsers, 0),
      curNewUsers: Math.max(wholeSiteAgg.firstVisitUsers - hrhPageAgg.curNewUsers, 0),
      curPageViews: wholeSiteAgg.pageViews - hrhPageAgg.curPageViews,
      prevUsers: Math.max(wholeSitePrevAgg.pageViewUsers - hrhPageAgg.prevUsers, 0),
      prevPageViews: wholeSitePrevAgg.pageViews - hrhPageAgg.prevPageViews,
      usersByDate: new Map(
        enumerateDatesISO(current.from, current.to).map((iso) => {
          const key = isoToYyyymmdd(iso);
          return [key, Math.max((wholeSiteUsersByDate.get(key) || 0) - (hrhPageAgg.usersByDate.get(key) || 0), 0)];
        }),
      ),
      pageViewsByDate: new Map(
        enumerateDatesISO(current.from, current.to).map((iso) => {
          const key = isoToYyyymmdd(iso);
          return [key, (wholeSitePageViewsByDate.get(key) || 0) - (hrhPageAgg.pageViewsByDate.get(key) || 0)];
        }),
      ),
    };
    exclPageAgg.curReturningUsers = Math.max(exclPageAgg.curUsers - exclPageAgg.curNewUsers, 0);
    const exclGmvAgg = aggregateGmvRows(otherBranchesSalesRows, current, previous);
    const exclOrderAgg = aggregateOrderStatusRows(otherBranchesOrderStatusRows, current, previous);
    const wholeExclHrhSection = buildTrafficSection(exclPageAgg, exclGmvAgg, exclOrderAgg, current, [
      { stage: "Add to Cart", count: wholeSiteAgg.addToCart },
      { stage: "Begin Checkout", count: wholeSiteAgg.beginCheckout },
    ]);

    // --- Optional selected Branch — identical shape/methodology to HRH
    // Online above, just a different code/store_name (see BRANCHES). ---
    let branchSection = null;
    if (branch) {
      const branchPageAgg = aggregatePageRows(branchPageRows, curFromKey, curToKey, prevFromKey, prevToKey);
      const branchGmvAgg = aggregateGmvRows(branchSalesRows, current, previous);
      const branchOrderAgg = aggregateOrderStatusRows(branchOrderStatusRows, current, previous);
      branchSection = { code: branch.code, label: branch.label, ...buildTrafficSection(branchPageAgg, branchGmvAgg, branchOrderAgg, current) };
    }

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current,
        previous,
        property: GA4_PROPERTY_ID,
        branches: BRANCHES.map((b) => ({ code: b.code, label: b.label })),
        selectedBranch: branch?.code || null,
        scopeNote:
          "Users/Page Views: GA4 pagePath scoped to hmr.ph/shop/ONP (HRH Online's storefront) — real, store-specific data, but GA4 has no 'sessions' metric at this grain. Orders/Completed Order: real order-status counts from HRH Online's own order records (Orders = every checkout regardless of later cancellation; Completed Order = payment_status 'Paid' — a different question from Real Orders Received elsewhere, which nets out cancellations). Revenue: real HRH Online website sales (HMRPH Online channel). Add to Cart is omitted, not zeroed: no scoped source exists for it anywhere in this warehouse.",
        wholeSiteScopeNote:
          "Whole Site: every page/branch on hmr.ph EXCEPT HRH Online. Users/Page Views come from GA4's whole-property event totals minus HRH Online's own page-scoped totals (Page Views: exact; Users/New Users: a small approximation — see code comment). Orders/Completed Order/Revenue come from real order records (mart_xv3_order_report/mart_net_sales) filtered to every branch except HRH Online — an exact subtraction, not a GA4-event approximation.",
        branchScopeNote:
          "Branch: same methodology as HRH Online above (real GA4 page traffic for that branch's own /shop/{code} + /search/stores/{code} pages, real order records for Orders/Completed Order/Revenue) — a different store_name, not an approximation.",
        generatedAt: new Date().toISOString(),
      },
      hrh: hrhSection,
      wholeExclHrh: wholeExclHrhSection,
      branch: branchSection,
    });
  } catch (err) {
    console.error("HRH Traffic & Conversion API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Traffic & Conversion",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
