import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (like _bidderIdentity.js, _bucketing.js, etc. on the
// Auction side) so Vercel does NOT deploy this as its own Serverless
// Function — the project's Hobby plan caps deployments at 12 functions and
// was already exactly at that cap (Auction's 9 + HRH's 3 existing
// endpoints), so a genuinely separate /api/hrh-traffic-analytics route
// would have pushed it to 13 and been rejected at deploy time (verified:
// it was). api/hrh-sales-analytics.js imports and dispatches to
// `handleTrafficAnalytics` here when `?report=traffic` is present,
// otherwise running its own original Sales Analytics logic completely
// unchanged — see that file's top-of-handler branch.
//
// GA4 discovery (this session): HMR's GA4 exports are already ETL'd (via
// Airbyte) into ClickHouse's `ga4` database — no separate Google service
// account / Data API call needed, this file just reuses the SAME
// CLICKHOUSE_* credentials every other api/hrh-*.js file already uses.
// Only ONE GA4 property exists in that data: 314716873 (verified via
// `SELECT DISTINCT property_id` across every ga4.* table — no ambiguity to
// resolve). Two tables cover everything this page needs:
//   - ga4_traffic_acquisition_session_default_channel_grouping_report:
//     plain MergeTree, verified zero duplicate (date, channel) rows across
//     its whole history — safe to query directly, no dedup needed. Has
//     sessions/totalUsers/engagedSessions/totalRevenue per
//     (date, sessionDefaultChannelGrouping).
//   - ga4_events_report: ReplacingMergeTree keyed on
//     (property_id, date, eventName), versioned by _airbyte_extracted_at —
//     the daily re-sync re-extracts recent dates as GA4 finalizes them, so
//     OLDER versions of a (date, eventName) row are NOT physically removed
//     until a background merge runs. Querying without FINAL silently
//     double/triple-counts recent days (verified: 2026-09-07 returned 2 raw
//     versions, non-FINAL summed to 40 purchases when the true FINAL value
//     was 20). EVERY query against this table in this file uses FINAL.
// Confirmed ecommerce events all present with real volume (2025-01-01 to
// today): session_start, view_item, add_to_cart, begin_checkout, purchase
// (13,675 purchases). No funnel stage is fabricated.
const GA4_PROPERTY_ID = "314716873";

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

const FUNNEL_EVENTS = ["view_item", "add_to_cart", "begin_checkout", "purchase"];

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
    const superFrom = isoToYyyymmdd(previous.from);
    const superTo = isoToYyyymmdd(current.to);
    const curFromKey = isoToYyyymmdd(current.from);
    const curToKey = isoToYyyymmdd(current.to);
    const prevFromKey = isoToYyyymmdd(previous.from);
    const prevToKey = isoToYyyymmdd(previous.to);

    // Sessions/Users/Engaged Sessions/Revenue — ONE query spanning the whole
    // previous+current super-range, grouped by (date, channel). Everything
    // else (current/previous totals, per-channel breakdown, daily trend) is
    // derived from this single result set in JS rather than firing a
    // separate query per KPI.
    const channelRows = await (
      await client.query({
        query: `
          SELECT
            date,
            sessionDefaultChannelGrouping AS channel,
            sum(sessions) AS sessions,
            sum(totalUsers) AS users,
            sum(engagedSessions) AS engaged,
            sum(totalRevenue) AS revenue
          FROM ga4.ga4_traffic_acquisition_session_default_channel_grouping_report
          WHERE property_id = {propertyId:String}
            AND date BETWEEN {superFrom:String} AND {superTo:String}
          GROUP BY date, channel
        `,
        query_params: { propertyId: GA4_PROPERTY_ID, superFrom, superTo },
        format: "JSONEachRow",
      })
    ).json();

    // Ecommerce funnel + purchases — ONE query, FINAL (see file-header
    // comment on why FINAL is load-bearing here), spanning the same
    // super-range, grouped by (date, eventName).
    const eventRows = await (
      await client.query({
        query: `
          SELECT date, eventName AS event, sum(eventCount) AS count, sum(totalRevenue) AS revenue
          FROM ga4.ga4_events_report FINAL
          WHERE property_id = {propertyId:String}
            AND date BETWEEN {superFrom:String} AND {superTo:String}
            AND eventName IN {events:Array(String)}
          GROUP BY date, event
        `,
        query_params: { propertyId: GA4_PROPERTY_ID, superFrom, superTo, events: FUNNEL_EVENTS },
        format: "JSONEachRow",
      })
    ).json();

    // --- Aggregate channelRows into current/previous totals + per-channel/per-day ---
    let curSessions = 0;
    let curUsers = 0;
    let curEngaged = 0;
    let curRevenue = 0;
    let prevSessions = 0;
    let prevUsers = 0;
    let prevEngaged = 0;
    let prevRevenue = 0;
    const channelTotals = new Map(); // channel -> sessions (current window only)
    const sessionsByDate = new Map(); // date (yyyymmdd) -> sessions (current window only)
    for (const r of channelRows) {
      const sessions = toNum(r.sessions);
      const users = toNum(r.users);
      const engaged = toNum(r.engaged);
      const revenue = toNum(r.revenue);
      if (r.date >= curFromKey && r.date <= curToKey) {
        curSessions += sessions;
        curUsers += users;
        curEngaged += engaged;
        curRevenue += revenue;
        channelTotals.set(r.channel, (channelTotals.get(r.channel) || 0) + sessions);
        sessionsByDate.set(r.date, (sessionsByDate.get(r.date) || 0) + sessions);
      } else if (r.date >= prevFromKey && r.date <= prevToKey) {
        prevSessions += sessions;
        prevUsers += users;
        prevEngaged += engaged;
        prevRevenue += revenue;
      }
    }

    // --- Aggregate eventRows into current/previous funnel totals + daily purchases ---
    const curEventTotals = new Map();
    const prevEventTotals = new Map();
    const purchasesByDate = new Map(); // date (yyyymmdd) -> purchase count (current window only)
    for (const r of eventRows) {
      const count = toNum(r.count);
      if (r.date >= curFromKey && r.date <= curToKey) {
        curEventTotals.set(r.event, (curEventTotals.get(r.event) || 0) + count);
        if (r.event === "purchase") purchasesByDate.set(r.date, (purchasesByDate.get(r.date) || 0) + count);
      } else if (r.date >= prevFromKey && r.date <= prevToKey) {
        prevEventTotals.set(r.event, (prevEventTotals.get(r.event) || 0) + count);
      }
    }
    const curPurchases = curEventTotals.get("purchase") || 0;
    const prevPurchases = prevEventTotals.get("purchase") || 0;

    // --- KPIs ---
    // Users: totalUsers, not activeUsers — this ETL'd schema never captured
    // activeUsers at all (verified: no such column exists on any ga4.*
    // table), so totalUsers is the only option, not a stylistic choice.
    // Conversion Rate: purchase EVENT COUNT / sessions. GA4's own
    // "session key event rate" (sessions that had >=1 key event / total
    // sessions) isn't available at this grain — the only sessionKeyEventRate
    // column in this data lives on a first-user ACQUISITION-CHANNEL report
    // (different attribution model, would silently mix two populations) —
    // so purchases/sessions is used instead and documented here rather than
    // silently presented as GA4's native key-event rate.
    const curConversionRate = safeDivide(curPurchases, curSessions) * 100;
    const prevConversionRate = safeDivide(prevPurchases, prevSessions) * 100;
    const curRevPerSession = safeDivide(curRevenue, curSessions);
    const prevRevPerSession = safeDivide(prevRevenue, prevSessions);

    // This property's ecommerce tracking (purchase events + revenue)
    // appears to have gone live partway through 2025 — verified: 2025-01-01
    // to 2025-09-10 has 1.84M real sessions but only 2 purchases and $0
    // revenue, vs. real, substantial ecommerce activity in the same window
    // a year later. A YTD-vs-prior-YTD delta against that near-zero
    // baseline produces a mathematically "correct" but meaningless
    // 500,000%+ swing — prevPurchases < 10 is treated as "no usable
    // baseline" (null delta) rather than shown as a fabricated-looking
    // number, same spirit as pctDelta already returning null for previous=0.
    const conversionRateDelta = prevPurchases >= 10 ? pctDelta(curConversionRate, prevConversionRate) : null;

    const kpis = {
      sessions: { value: curSessions, delta: pctDelta(curSessions, prevSessions) },
      users: { value: curUsers, delta: pctDelta(curUsers, prevUsers) },
      engagedSessions: { value: curEngaged, delta: pctDelta(curEngaged, prevEngaged) },
      conversionRate: { value: curConversionRate, delta: conversionRateDelta },
      revenuePerSession: { value: curRevPerSession, delta: pctDelta(curRevPerSession, prevRevPerSession) },
    };

    // --- Conversion Funnel (current window only) ---
    const FUNNEL_LABELS = { view_item: "Product View", add_to_cart: "Add to Cart", begin_checkout: "Begin Checkout", purchase: "Purchase" };
    const funnelCounts = [curSessions, ...FUNNEL_EVENTS.map((e) => curEventTotals.get(e) || 0)];
    const funnelLabels = ["Sessions", ...FUNNEL_EVENTS.map((e) => FUNNEL_LABELS[e])];
    const funnel = funnelLabels.map((stage, i) => {
      const count = funnelCounts[i];
      if (i === 0) return { stage, count, dropoffPct: null };
      const prevCount = funnelCounts[i - 1];
      return { stage, count, dropoffPct: prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : null };
    });

    // --- Conversion Trend (daily, current window, zero-filled) ---
    const conversionTrend = enumerateDatesISO(current.from, current.to).map((iso) => {
      const key = isoToYyyymmdd(iso);
      const sessions = sessionsByDate.get(key) || 0;
      const purchases = purchasesByDate.get(key) || 0;
      return { date: iso, sessions, purchases, conversionRate: safeDivide(purchases, sessions) * 100 };
    });

    // --- Traffic by Acquisition Channel (current window, real GA4 channel
    // groups only — never the sales-channel HMRPH Online/TikTok/Shopee
    // labels, which don't exist in this dimension). All 14 real channels
    // are small enough in count to list directly, no "Other" bucket needed. ---
    const acquisitionChannels = Array.from(channelTotals, ([channel, sessions]) => ({
      channel,
      sessions,
      sharePct: curSessions > 0 ? (sessions / curSessions) * 100 : 0,
    })).sort((a, b) => b.sessions - a.sessions);

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current,
        previous,
        property: GA4_PROPERTY_ID,
        conversionRateNote: "Purchase events / sessions (session-level key-event rate not available in this data source at the whole-property grain).",
        generatedAt: new Date().toISOString(),
      },
      kpis,
      funnel,
      conversionTrend,
      acquisitionChannels,
    });
  } catch (err) {
    console.error("HRH Traffic & Conversion API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Traffic & Conversion",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
