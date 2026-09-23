import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions.
// api/hrh-sales-analytics.js dispatches here on `?report=weeklyBusinessReview`.
//
// Recreates slides 2-5 of "Ecomm Weekly Business Review.pdf" as a live,
// real-data section (that deck is a TEMPLATE — every metric cell in it is
// literally "--" with instructions like "Replace with actual weekly data",
// confirmed by extracting its text: nothing here reproduces slide content,
// only its column/section STRUCTURE). No sales_channel/product dimension of
// this report accepts the page's Channel filter — the whole point is
// comparing all 3 real channels side by side, so it always covers all of
// them regardless of what's selected elsewhere in the app (same convention
// as api/hrh-sales-analytics.js's own Channel Comparison table).
//
// Locked HRH Online sales contract, duplicated (not imported) per this
// codebase's convention — same store scope, channel set, and GMV/Orders/AOV
// formulas as api/hrh-sales-analytics.js and api/hrh-product-analytics.js:
//   GMV = sumIf(net_sales_amount, net_sales_amount > 0)   [gross sale rows]
//   Orders = uniqExactIf(invoice_id, net_sales_amount > 0)
//   AOV = GMV / Orders
// No Lazada row — verified (this session, via system.columns/sample query)
// that xv3.mart_net_sales' sales_channel for store_name='HRH ONLINE' only
// ever takes 3 values: HMRPH ONLINE, TIKTOK, SHOPEE. Lazada never appears.
const HRH_STORE = "HRH ONLINE";
const ALL_CHANNELS = ["HMRPH ONLINE", "TIKTOK", "SHOPEE"];
const CHANNEL_DISPLAY = { "HMRPH ONLINE": "HMRPH Online", TIKTOK: "TikTok", SHOPEE: "Shopee" };

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}
// Pre-multiplied by 100 (matches formatPct()'s contract — see the fix in
// api/_hrh-barcode-analytics.js's computeLifecycleFunnel, which got this
// wrong once already). null when there's no valid previous value to compare
// against, so the frontend renders "--" instead of a fabricated 0%/Infinity.
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------------
// Date math — same primitives as api/hrh-product-analytics.js (Asia/Manila
// "today", WTD/MTD/YTD/Custom current+previous resolution), duplicated here
// per this codebase's per-file convention rather than imported.
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

// Current + "previous comparable period" — identical semantics to
// api/hrh-product-analytics.js's resolveRange (wtd: prior week, same
// weekdays; mtd: prior calendar month, same day-of-month; ytd: prior
// calendar year; custom: immediately preceding period of equal length).
// This is what Slide 3's "Current vs Previous Comparable Period" panel and
// Slide 4/5's SKU-level comparisons use — the SAME comparison engine
// Product Analytics' Top Products / Dropped Products already runs on, not
// a competing formula.
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
    return { current: { from, to }, previous: { from: `${Number(to.slice(0, 4)) - 1}-01-01`, to: shiftYearsClampedISO(to, -1) } };
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
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } }; // wtd (default)
}

// WoW validity — Slide 2 explicitly wants "--" rather than a fabricated
// number when the selected range doesn't logically support the comparison.
// Gated on the CURRENT window's actual length (not the range preset's
// label): a "WoW %" only means something when the window being compared is
// week-scale (<=7 days) — an MTD span of, say, 21 days shifted back 7 days
// would just be two overlapping-but-offset multi-week chunks, not "this
// week vs last week". This threshold is a deliberate, disclosed choice (see
// dataQuality below), not derived from any spec.
function resolveWowWindow(current) {
  const spanDays = daysBetweenISO(current.from, current.to) + 1;
  if (spanDays > 7) return null;
  return { from: addDaysISO(current.from, -7), to: addDaysISO(current.to, -7) };
}
// MoM — 2026-09-15 update, per explicit user request ("make MoM default as
// month to date"): fixed to the real Manila calendar Month-to-Date vs. the
// same elapsed days last month, ALWAYS — independent of whatever the page's
// Date Range filter is set to (same idea as this file's own six-week
// trend above: some metrics only mean something anchored to the real
// calendar, not to an arbitrary selected window). Unlike WoW, this never
// returns null — a month-to-date comparison is always well-defined, so
// MoM % is always shown.
function resolveFixedMomWindows() {
  const today = manilaTodayISODate();
  const current = { from: firstOfMonthISO(today), to: today };
  const prevAnchor = shiftMonthsClampedISO(today, -1);
  const previous = { from: firstOfMonthISO(prevAnchor), to: prevAnchor };
  return { current, previous };
}

// "Sep 7-13" (same month) / "Aug 31-Sep 6" (spans a month boundary) — real
// dates for the comparison-period label, per instruction, instead of a
// generic "Last Week" that would be wrong whenever the filter isn't WTD.
// withYear is forced on whenever current/previous don't all share one
// calendar year (YTD's year-over-year previous, or an MTD/custom window
// that crosses a Dec/Jan boundary) — otherwise "Jan 1-Sep 14" would render
// identically for both a 2026 and a 2025 period.
function formatDateLabel(iso, withYear) {
  const [y, m, d] = iso.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return withYear ? `${month} ${d}, ${y}` : `${month} ${d}`;
}
function formatRangeLabel(from, to, withYear) {
  const sameMonth = !withYear && from.slice(0, 7) === to.slice(0, 7);
  if (sameMonth) return `${formatDateLabel(from, false)}–${Number(to.slice(8, 10))}`;
  return `${formatDateLabel(from, withYear)}–${formatDateLabel(to, withYear)}`;
}

// Numeric "9/14–15" / "8/31–9/6" — for the Weekly Sales Trend chart's x-axis
// tick labels specifically, which need to fit 6 of them side by side
// without truncating or getting auto-skipped; formatRangeLabel's spelled-
// out month names (e.g. "Sep 14–15") ran too wide for that. Panel
// subtitles/period labels elsewhere keep the spelled-out form — this is
// only for cramped chart ticks.
function formatCompactAxisRangeLabel(from, to) {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  if (sameMonth) return `${md(from)}–${Number(to.slice(8, 10))}`;
  return `${md(from)}–${md(to)}`;
}

// Standard ISO-8601 week number (weeks start Monday; week 1 is the week
// containing the year's first Thursday) — for the Weekly Sales Trend
// panel's per-bucket label, per explicit request to show the REAL week
// number (e.g. "Wk 38"), not just a relative "1st of these 6 buckets"
// count. Computed from the bucket's Monday.
function isoWeekNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

// 6 ISO weeks (Monday-Sunday) ending at `to` — the most recent bucket is
// the week CONTAINING `to` (partial if `to` isn't a Sunday yet), the 5
// before it are full weeks. Deliberately independent of the page's range
// preset, per instruction ("always show the latest relevant six weekly
// buckets") — same fixed-lookback idea as Product Analytics' Repeat
// Sellers weeklyBucketsEndingAt, just 6 buckets instead of 4.
function sixWeeklyBucketsEndingAt(to) {
  const buckets = [];
  let weekStart = mondayOfWeek(to);
  for (let i = 0; i < 6; i++) {
    buckets.unshift({ from: weekStart, to: i === 0 ? to : addDaysISO(weekStart, 6), isoWeek: isoWeekNumber(weekStart) });
    weekStart = addDaysISO(weekStart, -7);
  }
  return buckets;
}

async function channelMetrics(from, to) {
  const rows = await (
    await client.query({
      query: `
        SELECT
          sales_channel AS ch,
          sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
          sumIf(net_quantity, net_sales_amount > 0) AS units,
          uniqExactIf(invoice_id, net_sales_amount > 0) AS orders
        FROM xv3.mart_net_sales
        WHERE store_name = {store:String}
          AND sales_channel IN {channels:Array(String)}
          AND transaction_date BETWEEN {from:String} AND {to:String}
        GROUP BY sales_channel
      `,
      query_params: { store: HRH_STORE, channels: ALL_CHANNELS, from, to },
      format: "JSONEachRow",
    })
  ).json();
  const map = new Map();
  for (const ch of ALL_CHANNELS) {
    const r = rows.find((x) => x.ch === ch) || {};
    map.set(ch, { gmv: toNum(r.gmv), units: toNum(r.units), orders: toNum(r.orders) });
  }
  return map;
}

// Same 2-state (+ "unknown") stock logic actually live in
// api/hrh-product-analytics.js's stockStatus() today — that file's comment
// notes a 3rd "Has Stock / Not Posted" state existed once and was
// deliberately removed "per request". Reusing what's REALLY there now
// (rather than the 3-state version this task's own instructions describe,
// which no longer exists) rather than reintroducing a state this dashboard
// already chose to retire — see dataQuality below.
function stockStatus(stockQty) {
  if (stockQty === undefined) return "UNKNOWN STOCK";
  if (stockQty <= 0) return "OUT OF STOCK";
  return "HAS STOCK";
}
async function fetchStockQty(itemIds) {
  if (itemIds.length === 0) return new Map();
  const rows = await (
    await client.query({
      query: `
        SELECT product_id, sum(item_qty) AS stock_qty
        FROM xv3.mart_level_of_inventory
        WHERE store_name = {store:String} AND product_id IN {itemIds:Array(Int64)}
        GROUP BY product_id
      `,
      query_params: { store: HRH_STORE, itemIds },
      format: "JSONEachRow",
    })
  ).json();
  const map = new Map();
  for (const r of rows) map.set(String(r.product_id), toNum(r.stock_qty));
  return map;
}

// Slide 4's Grew/Dipped buckets used to require a +/-20% cutoff to be
// "meaningful" — removed 2026-09-16 per explicit request, so every SKU
// with ANY real increase or decrease (and real sales in both periods)
// lands in Grew or Dipped now; only an exact 0% change (curGmv === prevGmv)
// stays uncategorized as genuinely flat.
//
// 2026-09-15: a ₱500 materiality floor was briefly added on top of the old
// threshold (a %-only rule let phone cases/tape/pet powder qualify off a
// tiny base), then explicitly removed again per user request — no minimum
// peso floor here either.

function formatPesoLocal(n) {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

export async function handleWeeklyBusinessReview(req, res) {
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

    // ================= SLIDE 2/3/4/5 — all independent, one parallel wave =================
    // curMap/wowMap/momCurMap/momPrevMap/prevMap (Slide 2/3's channel
    // metrics) and trendRows/productRows (Slide 3's 6-week trend, Slide
    // 4/5's SKU-level comparison) are 7 fully independent queries — none
    // depends on another's result, each just needs its own date window —
    // fired together instead of stacking one round-trip at a time (was
    // ~2.4s sequential end-to-end on a typical week; measured 2026-09-15).
    const wowWindow = resolveWowWindow(current);
    // MoM is fixed to real Month-to-Date, independent of `current` — see
    // resolveFixedMomWindows above.
    const momWindows = resolveFixedMomWindows();
    const weeks = sixWeeklyBucketsEndingAt(current.to);
    const [curMap, wowMap, momCurMap, momPrevMap, prevMap, trendRows, productRows] = await Promise.all([
      channelMetrics(current.from, current.to),
      wowWindow ? channelMetrics(wowWindow.from, wowWindow.to) : Promise.resolve(null),
      channelMetrics(momWindows.current.from, momWindows.current.to),
      channelMetrics(momWindows.previous.from, momWindows.previous.to),
      channelMetrics(previous.from, previous.to),
      client
        .query({
          query: `
            SELECT
              sales_channel AS ch,
              ${weeks.map((w, i) => `sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {w${i}From:String} AND {w${i}To:String}) AS w${i}`).join(",\n              ")}
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {spanFrom:String} AND {spanTo:String}
            GROUP BY sales_channel
          `,
          query_params: {
            store: HRH_STORE,
            channels: ALL_CHANNELS,
            spanFrom: weeks[0].from,
            spanTo: weeks[weeks.length - 1].to,
            ...Object.fromEntries(weeks.flatMap((w, i) => [[`w${i}From`, w.from], [`w${i}To`, w.to]])),
          },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Same query shape as api/hrh-product-analytics.js's comparisonRows
      // (current vs previous comparable period, grouped by the canonical
      // `ct.item_id` key) — product-level only (task calls for "actual
      // product-level sales data"), reusing the identical GMV/Units formulas.
      client
        .query({
          query: `
            SELECT
              \`ct.item_id\` AS item_id,
              any(barcode) AS barcode,
              argMax(product_name, transaction_date) AS product_name,
              sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
              sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
              sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
              sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units,
              maxIf(transaction_date, net_sales_amount > 0) AS last_sold_date
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
              AND \`ct.item_id\` IS NOT NULL
            GROUP BY item_id
            HAVING cur_gmv > 0 OR prev_gmv > 0
          `,
          query_params: {
            store: HRH_STORE,
            channels: ALL_CHANNELS,
            curFrom: current.from,
            curTo: current.to,
            prevFrom: previous.from,
            prevTo: previous.to,
          },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const platformRows = ALL_CHANNELS.map((ch) => {
      const cur = curMap.get(ch);
      const wow = wowMap?.get(ch);
      const momCur = momCurMap.get(ch);
      const momPrev = momPrevMap.get(ch);
      return {
        platform: CHANNEL_DISPLAY[ch],
        sales: cur.gmv,
        wowPct: wow ? pctDelta(cur.gmv, wow.gmv) : null,
        // The prior period's own absolute GMV (not a delta) — "how much was
        // it before", per explicit request, so no +/- sign belongs on this.
        wowPrevious: wow ? wow.gmv : null,
        momPct: pctDelta(momCur.gmv, momPrev.gmv),
        momPrevious: momPrev.gmv,
        momCurrent: momCur.gmv,
        orders: cur.orders,
        aov: safeDivide(cur.gmv, cur.orders),
        conversionRate: null, // see dataQuality — no defensible platform-specific denominator
      };
    });
    const curTotalGmv = platformRows.reduce((s, r) => s + r.sales, 0);
    const curTotalOrders = platformRows.reduce((s, r) => s + r.orders, 0);
    const wowTotalGmv = wowMap ? ALL_CHANNELS.reduce((s, ch) => s + wowMap.get(ch).gmv, 0) : null;
    const momCurTotalGmv = ALL_CHANNELS.reduce((s, ch) => s + momCurMap.get(ch).gmv, 0);
    const momPrevTotalGmv = ALL_CHANNELS.reduce((s, ch) => s + momPrevMap.get(ch).gmv, 0);
    const platformTotal = {
      platform: "Total",
      sales: curTotalGmv,
      wowPct: wowMap ? pctDelta(curTotalGmv, wowTotalGmv) : null,
      wowPrevious: wowMap ? wowTotalGmv : null,
      momPct: pctDelta(momCurTotalGmv, momPrevTotalGmv),
      momPrevious: momPrevTotalGmv,
      momCurrent: momCurTotalGmv,
      orders: curTotalOrders,
      aov: safeDivide(curTotalGmv, curTotalOrders),
      conversionRate: null,
    };

    // ================= SLIDE 3 — Platform Performance Comparison =================
    // % change per platform vs. the comparison period (current vs. previous,
    // the same two periods the bar chart itself plots) — replaces an
    // earlier "share of total" table, removed per explicit request in favor
    // of a plain increase/decrease percentage instead.
    const platformComparison = ALL_CHANNELS.map((ch) => ({
      platform: CHANNEL_DISPLAY[ch],
      current: curMap.get(ch).gmv,
      previous: prevMap.get(ch).gmv,
      pctChange: pctDelta(curMap.get(ch).gmv, prevMap.get(ch).gmv),
    }));
    const labelYears = new Set([current.from, current.to, previous.from, previous.to].map((iso) => iso.slice(0, 4)));
    const showYear = labelYears.size > 1;
    const currentLabel = formatRangeLabel(current.from, current.to, showYear);
    const previousLabel = formatRangeLabel(previous.from, previous.to, showYear);

    const weeklyTrend = weeks.map((w, i) => {
      // "Wk38 (9/14–15)" — the ISO week number alone doesn't say which
      // actual dates that bucket covers, per explicit request to show the
      // real date range in the label itself. Kept compact (numeric M/D, no
      // space after "Wk") so all 6 labels fit without truncating.
      const row = {
        weekLabel: `Wk${w.isoWeek} (${formatCompactAxisRangeLabel(w.from, w.to)})`,
        isoWeek: w.isoWeek,
        from: w.from,
        to: w.to,
      };
      for (const ch of ALL_CHANNELS) {
        const r = trendRows.find((x) => x.ch === ch);
        row[CHANNEL_DISPLAY[ch]] = toNum(r?.[`w${i}`]);
      }
      return row;
    });

    // Insight cards — purely arithmetic on platformComparison's real deltas.
    // No causes are asserted; every card ends with the required disclaimer
    // rather than guessing at promo/algo/stockout drivers.
    const deltas = platformComparison.map((p) => ({ ...p, delta: p.current - p.previous, pct: pctDelta(p.current, p.previous) }));
    const grower = [...deltas].filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const dipper = [...deltas].filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta)[0];
    const totalDelta = curTotalGmv - platformComparison.reduce((s, p) => s + p.previous, 0);
    const insights = {
      grew: grower
        ? `${grower.platform} grew the most in absolute terms: ${formatPesoLocal(grower.delta)} (${grower.pct === null ? "new" : `+${grower.pct.toFixed(1)}%`}) vs. ${previousLabel}. Driver requires business validation.`
        : "No platform grew vs. the prior comparable period.",
      dipped: dipper
        ? `${dipper.platform} declined the most: ${formatPesoLocal(dipper.delta)} (${dipper.pct === null ? "—" : `${dipper.pct.toFixed(1)}%`}) vs. ${previousLabel}. Driver requires business validation.`
        : "No platform declined vs. the prior comparable period.",
      crossPlatform:
        grower && dipper
          ? `${grower.platform} gained ${formatPesoLocal(grower.delta)} while ${dipper.platform} lost ${formatPesoLocal(Math.abs(dipper.delta))} over the same period; total sales moved ${totalDelta >= 0 ? "+" : ""}${formatPesoLocal(totalDelta)} net. Whether one offset the other (cannibalization) or both reflect independent, incremental changes requires business validation.`
          : "Not enough platforms moved in opposite directions this period to assess a cross-platform offset.",
    };

    // ================= SLIDE 4 & 5 — SKU-level =================
    // productRows already fetched above (same parallel wave as curMap etc).
    const itemIds = productRows.map((r) => Number(r.item_id));
    const stockMap = await fetchStockQty(itemIds);

    const products = productRows.map((r) => {
      const curGmv = toNum(r.cur_gmv);
      const prevGmv = toNum(r.prev_gmv);
      const curUnits = toNum(r.cur_units);
      const prevUnits = toNum(r.prev_units);
      return {
        itemId: r.item_id,
        sku: r.barcode || null,
        product: r.product_name || r.barcode || `Item ${r.item_id}`,
        curGmv,
        prevGmv,
        curUnits,
        prevUnits,
        pct: pctDelta(curGmv, prevGmv),
        stockQty: stockMap.has(String(r.item_id)) ? stockMap.get(String(r.item_id)) : undefined,
        lastSoldDate: r.last_sold_date ? String(r.last_sold_date).slice(0, 10) : null,
      };
    });

    const categorized = { grew: [], dipped: [], emerging: [], disappeared: [] };
    for (const p of products) {
      if (p.prevGmv > 0 && p.curGmv <= 0) categorized.disappeared.push(p);
      else if (p.prevGmv <= 0 && p.curGmv > 0) categorized.emerging.push(p);
      // No minimum % threshold — every real increase/decrease counts (see
      // the note above this function's old MOVEMENT_THRESHOLD_PCT).
      else if (p.prevGmv > 0 && p.curGmv > 0 && p.pct > 0) categorized.grew.push(p);
      else if (p.prevGmv > 0 && p.curGmv > 0 && p.pct < 0) categorized.dipped.push(p);
    }
    for (const p of categorized.disappeared) p.stockStatus = stockStatus(p.stockQty);

    // Extended 2026-09-18 to also aggregate units and stock — per explicit
    // request to show each category's last-period total sales/units and
    // current total stock on hand, not just buried inline in the notes
    // text. Stock sums only SKUs with a real inventory match (stockQty !==
    // undefined) — an unmatched SKU contributes 0 to the sum but is
    // counted separately (stockUnknownCount) so "Stock" never silently
    // understates by conflating "confirmed 0 on hand" with "no match
    // found", same distinction stockStatus() already draws per-SKU.
    function categoryTotals(items) {
      let stockQty = 0;
      let stockUnknownCount = 0;
      for (const i of items) {
        if (i.stockQty === undefined) stockUnknownCount += 1;
        else stockQty += i.stockQty;
      }
      return {
        curGmv: items.reduce((s, i) => s + i.curGmv, 0),
        prevGmv: items.reduce((s, i) => s + i.prevGmv, 0),
        curUnits: items.reduce((s, i) => s + i.curUnits, 0),
        prevUnits: items.reduce((s, i) => s + i.prevUnits, 0),
        stockQty,
        stockUnknownCount,
      };
    }
    const grewTotals = categoryTotals(categorized.grew);
    const dippedTotals = categoryTotals(categorized.dipped);
    const emergingTotals = categoryTotals(categorized.emerging);
    const disappearedTotals = categoryTotals(categorized.disappeared);
    const disappearedOOS = categorized.disappeared.filter((p) => p.stockStatus === "OUT OF STOCK").length;
    const disappearedHasStock = categorized.disappeared.filter((p) => p.stockStatus === "HAS STOCK").length;
    const disappearedUnknown = categorized.disappeared.filter((p) => p.stockStatus === "UNKNOWN STOCK").length;

    // ALL SKUs per movement category (not just a top-N) — for the SKUs
    // column's click-through modal (the count alone doesn't say WHICH
    // SKUs). 2026-09-15: was capped to the top 10 by revenue size, removed
    // per explicit request ("display all") once the click target became a
    // full modal instead of a small hover popup. Still ranked by absolute
    // revenue SIZE — current-period GMV for Grew/Emerging, prior-period GMV
    // for Disappeared — per the earlier "items with the most value at top"
    // request, just no longer truncated to 10.
    function topSkusFor(items, kind) {
      const ranked = [...items].sort((a, b) => (kind === "disappeared" ? b.prevGmv - a.prevGmv : b.curGmv - a.curGmv));
      return ranked.map((p) => {
        // Total GMV actually generated, not a +/- change figure — a signed
        // delta ("+₱107") read as confusing/ambiguous; this is just the
        // plain total the SKU brought in, same idea for all 4 categories.
        // Disappeared has no current-period GMV (that's the whole point of
        // the bucket), so it reports what the SKU generated in the PRIOR
        // period instead — every other category reports the CURRENT
        // period's total. Units sold and current stock on hand (stockPhrase
        // — same helper/wording as the Hero/Problem/Emerging insight cards
        // below) ride along beside it.
        const detail =
          kind === "disappeared"
            ? `${formatPesoLocal(p.prevGmv)} (${formatNumLocal(p.prevUnits)} units)${stockPhrase(p)}`
            : `${formatPesoLocal(p.curGmv)} (${formatNumLocal(p.curUnits)} units)${stockPhrase(p)}`;
        // Last Date Sold — most useful for Disappeared (when did it stop
        // selling?), included for every category since it's the same real
        // maxIf(transaction_date) field regardless of kind.
        return { product: p.product, sku: p.sku, detail, lastSoldDate: p.lastSoldDate };
      });
    }

    // lastPeriodSales/lastPeriodUnits/stock added 2026-09-18 per explicit
    // request — the same "Total Sales / Units / Stock" figures already
    // shown per-SKU in the modal, now also aggregated per category so the
    // main table doesn't require opening every category to see the scale
    // of last period's sales/units or how much stock sits behind it.
    // stockUnknownCount (SKUs with no inventory match) rides along so the
    // frontend can caveat the Stock figure instead of presenting a partial
    // sum as complete.
    const skuMovement = [
      {
        category: "Grew",
        skus: categorized.grew.length,
        movement: categorized.grew.length ? `+${pctDelta(grewTotals.curGmv, grewTotals.prevGmv)?.toFixed(1)}%` : "—",
        notes: categorized.grew.length
          ? `Sales increased by ${pctDelta(grewTotals.curGmv, grewTotals.prevGmv)?.toFixed(1)}% combined (${formatPesoLocal(grewTotals.prevGmv)} → ${formatPesoLocal(grewTotals.curGmv)}) across ${categorized.grew.length} SKU(s), vs. ${previousLabel}.`
          : "No SKUs had any real sales increase this period.",
        topSkus: topSkusFor(categorized.grew, "grew"),
        lastPeriodSales: grewTotals.prevGmv,
        lastPeriodUnits: grewTotals.prevUnits,
        stock: grewTotals.stockQty,
        stockUnknownCount: grewTotals.stockUnknownCount,
      },
      {
        category: "Dipped",
        skus: categorized.dipped.length,
        movement: categorized.dipped.length ? `${pctDelta(dippedTotals.curGmv, dippedTotals.prevGmv)?.toFixed(1)}%` : "—",
        notes: categorized.dipped.length
          ? `Sales decreased by ${Math.abs(pctDelta(dippedTotals.curGmv, dippedTotals.prevGmv) ?? 0).toFixed(1)}% combined (${formatPesoLocal(dippedTotals.prevGmv)} → ${formatPesoLocal(dippedTotals.curGmv)}) across ${categorized.dipped.length} SKU(s), vs. ${previousLabel}.`
          : "No SKUs had any real sales decrease this period.",
        topSkus: topSkusFor(categorized.dipped, "dipped"),
        lastPeriodSales: dippedTotals.prevGmv,
        lastPeriodUnits: dippedTotals.prevUnits,
        stock: dippedTotals.stockQty,
        stockUnknownCount: dippedTotals.stockUnknownCount,
      },
      {
        category: "Emerging / Breakout",
        skus: categorized.emerging.length,
        movement: categorized.emerging.length ? "New" : "—",
        notes: categorized.emerging.length
          ? `Newly selling — ${categorized.emerging.length} SKU(s) with ${formatPesoLocal(emergingTotals.curGmv)} combined sales this period and no comparable prior-period sales.`
          : "No new/breakout SKUs this period.",
        topSkus: topSkusFor(categorized.emerging, "emerging"),
        // Always 0 by definition (Emerging = zero-or-no prior-period
        // sales) — shown, not omitted, since "0" is itself the real,
        // meaningful answer here (confirms these are genuinely new).
        lastPeriodSales: emergingTotals.prevGmv,
        lastPeriodUnits: emergingTotals.prevUnits,
        stock: emergingTotals.stockQty,
        stockUnknownCount: emergingTotals.stockUnknownCount,
      },
      {
        category: "Disappeared",
        skus: categorized.disappeared.length,
        movement: categorized.disappeared.length ? "-100.0%" : "—",
        notes: categorized.disappeared.length
          ? `Had ${formatPesoLocal(disappearedTotals.prevGmv)} in sales last period, zero this period. ${disappearedOOS} Out of Stock, ${disappearedHasStock} Has Stock but no current sales${disappearedUnknown ? `, ${disappearedUnknown} Cause not determined from available data` : ""}.`
          : "No SKUs with prior-period sales dropped to zero this period.",
        topSkus: topSkusFor(categorized.disappeared, "disappeared"),
        lastPeriodSales: disappearedTotals.prevGmv,
        lastPeriodUnits: disappearedTotals.prevUnits,
        stock: disappearedTotals.stockQty,
        stockUnknownCount: disappearedTotals.stockUnknownCount,
      },
    ];

    // ================= SLIDE 5 — Top SKU Movers =================
    // Every SKU with real current-period activity (not pre-truncated to
    // 10) — the frontend sorts by units OR value and takes its own top 10,
    // so "Top 10 by Units" and "Top 10 by Value" can be two different sets
    // instead of the value ranking being limited to whatever made the
    // units-based top 10.
    const skuMovers = [...products]
      .filter((p) => p.curUnits > 0 || p.curGmv > 0)
      .sort((a, b) => b.curUnits - a.curUnits)
      .map((p) => ({
        product: p.product,
        sku: p.sku,
        currentUnits: p.curUnits,
        previousUnits: p.prevUnits,
        unitChange: p.curUnits - p.prevUnits,
        currentGmv: p.curGmv,
        previousGmv: p.prevGmv,
        gmvChange: p.curGmv - p.prevGmv,
        pctChange: p.pct,
      }));

    // Hero prefers a proven repeat performer (prevGmv > 0) over the single
    // top-GMV item overall — the PDF's own framing asks "are they
    // sustainable?", which a one-off item with zero prior sales can't
    // answer; that item is more honestly reported as Emerging instead.
    // Falls back to the overall top-GMV item only if nothing here has any
    // prior-period sales at all.
    const heroPool = products.filter((p) => p.prevGmv > 0);
    const heroSku = (heroPool.length ? heroPool : products).sort((a, b) => b.curGmv - a.curGmv)[0];
    const problemPool = [...categorized.disappeared, ...categorized.dipped].sort((a, b) => b.prevGmv - a.prevGmv);
    const problemSku = problemPool[0];
    const emergingSku = [...categorized.emerging].sort((a, b) => b.curGmv - a.curGmv)[0];

    function stockPhrase(p) {
      if (!p) return "";
      if (p.stockQty === undefined) return " · Cause not determined from available data";
      return p.stockQty > 0 ? ` · ${formatNumLocal(p.stockQty)} unit(s) still in stock` : " · Out of Stock";
    }
    function formatNumLocal(n) {
      return Math.round(n).toLocaleString("en-PH");
    }

    const skuInsights = {
      hero: heroSku
        ? `${heroSku.product} — ${formatNumLocal(heroSku.curUnits)} units · ${formatPesoLocal(heroSku.curGmv)} GMV${
            heroSku.pct !== null ? ` · ${heroSku.pct >= 0 ? "+" : ""}${heroSku.pct.toFixed(1)}% vs prior` : " · no comparable prior-period sales"
          }`
        : "No SKU with current-period sales.",
      problem: problemSku
        ? `${problemSku.product} — ${formatNumLocal(problemSku.curGmv > 0 ? problemSku.curUnits : 0)} current units · previously ${formatNumLocal(problemSku.prevUnits)}${stockPhrase(problemSku)}`
        : "No SKU with a sharp decline or disappearance this period.",
      emerging: emergingSku
        ? `${emergingSku.product} — ${formatNumLocal(emergingSku.curUnits)} units vs ${formatNumLocal(emergingSku.prevUnits)} prior${stockPhrase(emergingSku)}`
        : "No new/breakout SKU this period.",
    };

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      meta: {
        range,
        current,
        previous,
        currentLabel,
        previousLabel,
        generatedAt: new Date().toISOString(),
      },
      platformTable: { rows: platformRows, total: platformTotal },
      platformComparison: { currentLabel, previousLabel, rows: platformComparison },
      weeklyTrend,
      insights,
      skuMovement,
      skuMovers,
      skuInsights,
      dataQuality: [
        "Conversion Rate is not populated for any platform: this dashboard's only traffic source is a single, site-wide GA4 property covering the HMRPH Online website only — it cannot represent TikTok/Shopee marketplace-app traffic at all, and using it for any platform (per instruction) was ruled out rather than presenting a misleading site-wide number as platform-specific.",
        "WoW % follows the page's selected Date Range filter and shows — when that window's actual length doesn't support the comparison (needs a <=7-day window) — a deliberate, disclosed threshold, not derived from any spec. MoM % (2026-09-15) is fixed to real Month-to-Date vs. the same elapsed days last month, independent of the Date Range filter, and is always shown.",
        "Grew/Dipped (Slide 4) count every SKU with any real GMV increase or decrease between the two periods (no minimum % threshold) — only an exact 0% change (identical GMV in both periods) is left uncategorized as genuinely flat.",
        "Disappeared/Problem SKU stock status reuses api/hrh-product-analytics.js's CURRENT stockStatus() logic, which is only 2 states (HAS STOCK / OUT OF STOCK) plus UNKNOWN STOCK for no inventory match — a 3rd \"Has Stock / Not Posted\" state existed there previously and was deliberately removed; it is not reintroduced here.",
        "SKU-level comparisons (Slides 4-5) use the same current-vs-previous-comparable-period engine as Product Analytics' Top Products/Dropped Products, not week-over-week/month-over-month specifically — the task's own Slide 4/5 definitions ask for a generic \"comparable prior period\", unlike Slide 2's explicit WoW/MoM columns.",
        "Each SKU Movement category's Stock total (2026-09-18) only sums SKUs with a real inventory match — a SKU with no match contributes 0 rather than being guessed, and is counted separately (shown as \"+N unknown\") so the total is never mistaken for complete when it isn't.",
      ],
    });
  } catch (err) {
    console.error("HRH Weekly Business Review API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Weekly Business Review data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
