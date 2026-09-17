import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See src/retail/segments.js for the full All/Retail/Wholesale writeup.
// Duplicated per this dashboard's per-file store/date-helper convention.
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
const WHOLESALE_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];
const HRH_ONLINE_STORE = "HRH ONLINE";
const SEGMENTS = {
  all: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE, ...WHOLESALE_STORES],
  retail: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE],
  wholesale: WHOLESALE_STORES,
};

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
// "Weekly" = the last FULL completed Mon-Sun calendar week ("This Week"),
// vs the week before ("Last Week") — NOT week-to-date. "MTD" = 1st of
// this month through today, vs the same elapsed span last month. Both
// views reuse this dashboard's existing prevWeek/mtd preset math (same
// resolveRange/resolveComparisonWindow shape as every other api/_*.js
// file), just fixed to one specific preset per view instead of a
// free-form Date Range filter, per the reference report's own two-toggle
// (Weekly/MTD) pattern.
function resolveView(view) {
  const today = manilaTodayISODate();
  if (view === "mtd") {
    const current = { from: firstOfMonthISO(today), to: today };
    const previous = { from: shiftMonthsClampedISO(current.from, -1), to: shiftMonthsClampedISO(current.to, -1) };
    return { current, previous };
  }
  const thisWeekMonday = mondayOfWeek(today);
  const current = { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  const previous = { from: addDaysISO(current.from, -7), to: addDaysISO(current.to, -7) };
  return { current, previous };
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}

export async function handleRetailSalesOverview(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const view = req.query.view === "mtd" ? "mtd" : "weekly";
    const stores = resolveSegment(segment);
    const { current, previous } = resolveView(view);

    // MTD Attainment needs a target — only queried for the "mtd" view (the
    // reference report only ever shows Attainment on the MTD toggle, never
    // Weekly, since there's no such thing as a "weekly target" in
    // xv3.mart_sales_target).
    const [kpiRows, targetRows, storeRows, channelRows, productRows, recencyRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
              sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_rev,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn,
              sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      view === "mtd"
        ? client
            .query({
              query: `SELECT sum(daily_target) AS target FROM xv3.mart_sales_target WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}`,
              query_params: { stores, curFrom: current.from, curTo: current.to },
              format: "JSONEachRow",
            })
            .then((r) => r.json())
        : Promise.resolve([{ target: 0 }]),
      // Per-store revenue (current + comparison) — for "Top Performing
      // Store" / "Steepest Decline" in At a Glance.
      client
        .query({
          query: `
            SELECT store_name,
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_rev
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Top Channel (current window).
      client
        .query({
          query: `
            SELECT sales_channel, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY sales_channel ORDER BY gmv DESC LIMIT 1
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Top Product (current window).
      client
        .query({
          query: `
            SELECT product_name, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} AND net_sales_amount > 0
            GROUP BY product_name ORDER BY gmv DESC LIMIT 1
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // New vs Returning revenue split — via mart_invoice_items'
      // customer_recency field ("Repeat buyer" / "One time customer" /
      // "No name"), a real precomputed classification rather than a
      // fabricated split. This is coarser than the full New/Retained/
      // Reactivated cohort analysis on the Customer (3R) tab (which
      // reuses HRH Online's own established cohort methodology) — used
      // here only for the At a Glance quick-reference card.
      client
        .query({
          query: `
            SELECT customer_recency, sum(invoice_item_sold_amount) AS amount
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
            GROUP BY customer_recency
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const kpi = kpiRows[0] || {};
    const curRev = toNum(kpi.cur_rev);
    const curTxn = toNum(kpi.cur_txn);
    const curUnits = toNum(kpi.cur_units);
    const prevRev = toNum(kpi.prev_rev);
    const prevTxn = toNum(kpi.prev_txn);
    const prevUnits = toNum(kpi.prev_units);
    const curAbs = safeDivide(curRev, curTxn);
    const prevAbs = safeDivide(prevRev, prevTxn);
    const target = toNum(targetRows[0]?.target);
    const attainment = view === "mtd" && target > 0 ? safeDivide(curRev, target) * 100 : null;

    const storeDeltas = storeRows.map((r) => ({ store: r.store_name, cur: toNum(r.cur_rev), prev: toNum(r.prev_rev), deltaPct: pctDelta(toNum(r.cur_rev), toNum(r.prev_rev)) }));
    const withDelta = storeDeltas.filter((s) => s.deltaPct !== null);
    const topStore = withDelta.length ? [...withDelta].sort((a, b) => b.deltaPct - a.deltaPct)[0] : null;
    const worstStore = withDelta.length ? [...withDelta].sort((a, b) => a.deltaPct - b.deltaPct)[0] : null;

    const topChannel = channelRows[0] ? { channel: channelRows[0].sales_channel, gmv: toNum(channelRows[0].gmv) } : null;
    const topProduct = productRows[0] ? { product: productRows[0].product_name, gmv: toNum(productRows[0].gmv) } : null;

    const recencyMap = new Map(recencyRows.map((r) => [r.customer_recency, toNum(r.amount)]));
    const returningRevenue = recencyMap.get("Repeat buyer") || 0;
    const newRevenue = recencyMap.get("One time customer") || 0;
    const namedTotal = returningRevenue + newRevenue;

    // Notable Changes — a short, factual, auto-derived list (NOT the
    // reference mock's hand-written "Recommended Actions" — those are
    // editorial judgment calls that can't be honestly generated from a
    // query, so this dashboard states what changed and leaves the
    // "what to do about it" to the reader).
    const notableChanges = [];
    if (topStore) notableChanges.push(`${topStore.store} had the strongest ${view === "mtd" ? "vs-last-month" : "week-over-week"} change: ${topStore.deltaPct >= 0 ? "+" : ""}${topStore.deltaPct.toFixed(1)}%.`);
    if (worstStore && worstStore.store !== topStore?.store) {
      notableChanges.push(`${worstStore.store} had the steepest decline: ${worstStore.deltaPct.toFixed(1)}%.`);
    }
    if (topChannel) notableChanges.push(`${topChannel.channel} was the top sales channel this period.`);
    if (topProduct) notableChanges.push(`${topProduct.product} was the top-selling product this period.`);

    return res.status(200).json({
      meta: { view, current, previous, segment, stores },
      kpis: {
        revenue: { value: curRev, previous: prevRev, delta: pctDelta(curRev, prevRev) },
        transactions: { value: curTxn, previous: prevTxn, delta: pctDelta(curTxn, prevTxn) },
        units: { value: curUnits, previous: prevUnits, delta: pctDelta(curUnits, prevUnits) },
        abs: { value: curAbs, previous: prevAbs, delta: pctDelta(curAbs, prevAbs) },
        attainment: view === "mtd" ? { value: attainment, target } : null,
      },
      atAGlance: {
        topStore,
        worstStore,
        topChannel,
        topProduct,
        newVsReturning: namedTotal > 0 ? { newPct: safeDivide(newRevenue, namedTotal) * 100, returningPct: safeDivide(returningRevenue, namedTotal) * 100 } : null,
      },
      notableChanges,
      dataQuality: [
        "New vs Returning Revenue (At a Glance) uses xv3.mart_invoice_items' own customer_recency field (Repeat buyer / One time customer / No name) — a coarser 2-way split than the full New/Retained/Reactivated cohort analysis on the Customer (3R) tab, used here only for a quick-reference figure.",
        "Notable Changes are auto-derived facts (what changed, by how much) — not editorial recommendations, since those require business judgment a query can't honestly produce.",
      ],
    });
  } catch (err) {
    console.error("[retail-sales-overview]", err);
    return res.status(500).json({ error: "Failed to load Retail Sales Overview data", message: err?.message || "" });
  }
}
