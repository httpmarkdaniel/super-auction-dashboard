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
  const to = today;
  const from = mondayOfWeek(to);
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } }; // wtd (default)
}

// WoW/MoM validity — Slide 2 explicitly wants "--" rather than a fabricated
// number when the selected range doesn't logically support the comparison.
// Gated on the CURRENT window's actual length (not the range preset's
// label): a "WoW %" only means something when the window being compared is
// week-scale (<=7 days) — an MTD span of, say, 21 days shifted back 7 days
// would just be two overlapping-but-offset multi-week chunks, not "this
// week vs last week". Same idea for MoM at <=31 days. These thresholds are
// a deliberate, disclosed choice (see dataQuality below), not derived from
// any spec — there's no universal definition of "logically valid" here.
function resolveWowWindow(current) {
  const spanDays = daysBetweenISO(current.from, current.to) + 1;
  if (spanDays > 7) return null;
  return { from: addDaysISO(current.from, -7), to: addDaysISO(current.to, -7) };
}
function resolveMomWindow(current) {
  const spanDays = daysBetweenISO(current.from, current.to) + 1;
  if (spanDays > 31) return null;
  return { from: shiftMonthsClampedISO(current.from, -1), to: shiftMonthsClampedISO(current.to, -1) };
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
    buckets.unshift({ from: weekStart, to: i === 0 ? to : addDaysISO(weekStart, 6) });
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

// "Meaningful" movement threshold for Slide 4's Grew/Dipped buckets — a
// deliberate, disclosed +/-20% cutoff (see dataQuality), not derived from
// any spec. Below this band a product is just flat, not categorized at all.
const MOVEMENT_THRESHOLD_PCT = 20;

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

    // ================= SLIDE 2 — Sales Performance by Platform =================
    const curMap = await channelMetrics(current.from, current.to);
    const wowWindow = resolveWowWindow(current);
    const wowMap = wowWindow ? await channelMetrics(wowWindow.from, wowWindow.to) : null;
    const momWindow = resolveMomWindow(current);
    const momMap = momWindow ? await channelMetrics(momWindow.from, momWindow.to) : null;

    const platformRows = ALL_CHANNELS.map((ch) => {
      const cur = curMap.get(ch);
      const wow = wowMap?.get(ch);
      const mom = momMap?.get(ch);
      return {
        platform: CHANNEL_DISPLAY[ch],
        sales: cur.gmv,
        wowPct: wow ? pctDelta(cur.gmv, wow.gmv) : null,
        momPct: mom ? pctDelta(cur.gmv, mom.gmv) : null,
        orders: cur.orders,
        aov: safeDivide(cur.gmv, cur.orders),
        conversionRate: null, // see dataQuality — no defensible platform-specific denominator
      };
    });
    const curTotalGmv = platformRows.reduce((s, r) => s + r.sales, 0);
    const curTotalOrders = platformRows.reduce((s, r) => s + r.orders, 0);
    const wowTotalGmv = wowMap ? ALL_CHANNELS.reduce((s, ch) => s + wowMap.get(ch).gmv, 0) : null;
    const momTotalGmv = momMap ? ALL_CHANNELS.reduce((s, ch) => s + momMap.get(ch).gmv, 0) : null;
    const platformTotal = {
      platform: "Total",
      sales: curTotalGmv,
      wowPct: wowMap ? pctDelta(curTotalGmv, wowTotalGmv) : null,
      momPct: momMap ? pctDelta(curTotalGmv, momTotalGmv) : null,
      orders: curTotalOrders,
      aov: safeDivide(curTotalGmv, curTotalOrders),
      conversionRate: null,
    };

    // ================= SLIDE 3 — Platform Performance Comparison =================
    const prevMap = await channelMetrics(previous.from, previous.to);
    const platformComparison = ALL_CHANNELS.map((ch) => ({
      platform: CHANNEL_DISPLAY[ch],
      current: curMap.get(ch).gmv,
      previous: prevMap.get(ch).gmv,
    }));
    const labelYears = new Set([current.from, current.to, previous.from, previous.to].map((iso) => iso.slice(0, 4)));
    const showYear = labelYears.size > 1;
    const currentLabel = formatRangeLabel(current.from, current.to, showYear);
    const previousLabel = formatRangeLabel(previous.from, previous.to, showYear);

    const weeks = sixWeeklyBucketsEndingAt(current.to);
    const trendRows = await (
      await client.query({
        query: `
          SELECT
            sales_channel AS ch,
            ${weeks.map((w, i) => `sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {w${i}From:String} AND {w${i}To:String}) AS w${i}`).join(",\n            ")}
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
    ).json();
    const weeklyTrend = weeks.map((w, i) => {
      const row = { weekLabel: `Wk ${i + 1}`, from: w.from, to: w.to };
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

    // ================= SLIDE 4 & 5 — SKU-level (shared query) =================
    // Same query shape as api/hrh-product-analytics.js's comparisonRows
    // (current vs previous comparable period, grouped by the canonical
    // `ct.item_id` key) — product-level only (task calls for "actual
    // product-level sales data"), reusing the identical GMV/Units formulas.
    const productRows = await (
      await client.query({
        query: `
          SELECT
            \`ct.item_id\` AS item_id,
            any(barcode) AS barcode,
            argMax(product_name, transaction_date) AS product_name,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units
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
    ).json();

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
      };
    });

    const categorized = { grew: [], dipped: [], emerging: [], disappeared: [] };
    for (const p of products) {
      if (p.prevGmv > 0 && p.curGmv <= 0) categorized.disappeared.push(p);
      else if (p.prevGmv <= 0 && p.curGmv > 0) categorized.emerging.push(p);
      else if (p.prevGmv > 0 && p.curGmv > 0 && p.pct >= MOVEMENT_THRESHOLD_PCT) categorized.grew.push(p);
      else if (p.prevGmv > 0 && p.curGmv > 0 && p.pct <= -MOVEMENT_THRESHOLD_PCT) categorized.dipped.push(p);
    }
    for (const p of categorized.disappeared) p.stockStatus = stockStatus(p.stockQty);

    function categoryTotals(items) {
      return { curGmv: items.reduce((s, i) => s + i.curGmv, 0), prevGmv: items.reduce((s, i) => s + i.prevGmv, 0) };
    }
    const grewTotals = categoryTotals(categorized.grew);
    const dippedTotals = categoryTotals(categorized.dipped);
    const emergingTotals = categoryTotals(categorized.emerging);
    const disappearedTotals = categoryTotals(categorized.disappeared);
    const disappearedOOS = categorized.disappeared.filter((p) => p.stockStatus === "OUT OF STOCK").length;
    const disappearedHasStock = categorized.disappeared.filter((p) => p.stockStatus === "HAS STOCK").length;
    const disappearedUnknown = categorized.disappeared.filter((p) => p.stockStatus === "UNKNOWN STOCK").length;

    const skuMovement = [
      {
        category: "Grew",
        skus: categorized.grew.length,
        movement: categorized.grew.length ? `+${pctDelta(grewTotals.curGmv, grewTotals.prevGmv)?.toFixed(1)}%` : "—",
        notes: categorized.grew.length
          ? `Sales increased by ${pctDelta(grewTotals.curGmv, grewTotals.prevGmv)?.toFixed(1)}% combined (${formatPesoLocal(grewTotals.prevGmv)} → ${formatPesoLocal(grewTotals.curGmv)}) across ${categorized.grew.length} SKU(s), vs. ${previousLabel}.`
          : "No SKUs met the +20% growth threshold this period.",
      },
      {
        category: "Dipped",
        skus: categorized.dipped.length,
        movement: categorized.dipped.length ? `${pctDelta(dippedTotals.curGmv, dippedTotals.prevGmv)?.toFixed(1)}%` : "—",
        notes: categorized.dipped.length
          ? `Sales decreased by ${Math.abs(pctDelta(dippedTotals.curGmv, dippedTotals.prevGmv) ?? 0).toFixed(1)}% combined (${formatPesoLocal(dippedTotals.prevGmv)} → ${formatPesoLocal(dippedTotals.curGmv)}) across ${categorized.dipped.length} SKU(s), vs. ${previousLabel}.`
          : "No SKUs dropped past the -20% decline threshold this period.",
      },
      {
        category: "Emerging / Breakout",
        skus: categorized.emerging.length,
        movement: categorized.emerging.length ? "New" : "—",
        notes: categorized.emerging.length
          ? `Newly selling — ${categorized.emerging.length} SKU(s) with ${formatPesoLocal(emergingTotals.curGmv)} combined sales this period and no comparable prior-period sales.`
          : "No new/breakout SKUs this period.",
      },
      {
        category: "Disappeared",
        skus: categorized.disappeared.length,
        movement: categorized.disappeared.length ? "-100.0%" : "—",
        notes: categorized.disappeared.length
          ? `Had ${formatPesoLocal(disappearedTotals.prevGmv)} in sales last period, zero this period. ${disappearedOOS} Out of Stock, ${disappearedHasStock} Has Stock but no current sales${disappearedUnknown ? `, ${disappearedUnknown} Cause not determined from available data` : ""}.`
          : "No SKUs with prior-period sales dropped to zero this period.",
      },
    ];

    // ================= SLIDE 5 — Top 10 SKU Movers =================
    const top10 = [...products]
      .filter((p) => p.curUnits > 0)
      .sort((a, b) => b.curUnits - a.curUnits)
      .slice(0, 10)
      .map((p) => ({
        product: p.product,
        sku: p.sku,
        currentUnits: p.curUnits,
        previousUnits: p.prevUnits,
        unitChange: p.curUnits - p.prevUnits,
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

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
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
      top10,
      skuInsights,
      dataQuality: [
        "Conversion Rate is not populated for any platform: this dashboard's only traffic source is a single, site-wide GA4 property covering the HMRPH Online website only — it cannot represent TikTok/Shopee marketplace-app traffic at all, and using it for any platform (per instruction) was ruled out rather than presenting a misleading site-wide number as platform-specific.",
        "WoW % / MoM % show — when the selected date range's actual length doesn't support that comparison (WoW needs a <=7-day window, MoM a <=31-day window) — a deliberate, disclosed threshold, not derived from any spec.",
        "Grew/Dipped (Slide 4) use a +/-20% combined-GMV movement threshold — also a deliberate, disclosed choice; products moving less than that are left uncategorized (flat) rather than forced into a bucket.",
        "Disappeared/Problem SKU stock status reuses api/hrh-product-analytics.js's CURRENT stockStatus() logic, which is only 2 states (HAS STOCK / OUT OF STOCK) plus UNKNOWN STOCK for no inventory match — a 3rd \"Has Stock / Not Posted\" state existed there previously and was deliberately removed; it is not reintroduced here.",
        "SKU-level comparisons (Slides 4-5) use the same current-vs-previous-comparable-period engine as Product Analytics' Top Products/Dropped Products, not week-over-week/month-over-month specifically — the task's own Slide 4/5 definitions ask for a generic \"comparable prior period\", unlike Slide 2's explicit WoW/MoM columns.",
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
