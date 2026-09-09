import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Locked HRH Online sales contract — identical to api/hrh-product-analytics.js
// (store scope, channel scope, GMV/NMV/Orders/Units/AOV formulas). Duplicated
// here as small self-contained functions rather than imported, so this file
// can never accidentally change Product Analytics' behavior.
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
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}

// ---------------------------------------------------------------------
// Date math — identical logic to api/hrh-product-analytics.js's resolveRange
// (Asia/Manila "today", WTD/MTD/YTD calendar-shift comparisons, Custom
// adjacency comparison). See that file's comments for the full rationale.
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
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, mondayOffset);
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

export default async function handler(req, res) {
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

    // KPIs — identical formula/shape to hrh-product-analytics.js.
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_nmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_orders,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
            sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_nmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_orders,
            max(transaction_date) AS sales_as_of
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
        `,
        query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};
    const curGmv = toNum(k.cur_gmv);
    const prevGmv = toNum(k.prev_gmv);
    const curOrders = toNum(k.cur_orders);
    const prevOrders = toNum(k.prev_orders);
    const curNmv = toNum(k.cur_nmv);
    const prevNmv = toNum(k.prev_nmv);
    const curUnits = toNum(k.cur_units);
    const prevUnits = toNum(k.prev_units);
    const curAov = safeDivide(curGmv, curOrders);
    const prevAov = safeDivide(prevGmv, prevOrders);

    // Sales Trend — daily GMV (gross, sale-side only) + Orders for the
    // CURRENT window only. Zero-filled below so a day with no sales doesn't
    // create a gap in the x-axis.
    const trendRows = await (
      await client.query({
        query: `
          SELECT
            transaction_date AS d,
            sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
            uniqExactIf(invoice_id, net_sales_amount > 0) AS orders
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
          GROUP BY transaction_date
        `,
        query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    const trendByDate = new Map(trendRows.map((r) => [r.d, { gmv: toNum(r.gmv), orders: toNum(r.orders) }]));
    const salesTrend = enumerateDatesISO(current.from, current.to).map((d) => ({
      date: d,
      gmv: trendByDate.get(d)?.gmv ?? 0,
      orders: trendByDate.get(d)?.orders ?? 0,
    }));

    // Sales by Channel — real per-channel GMV for the current window,
    // always broken out across the 3 real channels regardless of the
    // selected channel filter (queried without the channel filter applied),
    // then collapsed to a single 100% slice below if one channel is
    // selected — keeps the donut consistent with the KPI scope.
    const channelRows = await (
      await client.query({
        query: `
          SELECT sales_channel AS ch, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {allChannels:Array(String)}
            AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
          GROUP BY sales_channel
        `,
        query_params: { store: HRH_STORE, allChannels: CHANNEL_MAP["All Channels"], curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    const channelGmv = new Map(channelRows.map((r) => [r.ch, toNum(r.gmv)]));
    const channelMix =
      channel === "All Channels"
        ? CHANNEL_MAP["All Channels"].map((ch) => ({
            channel: ch,
            gmv: channelGmv.get(ch) || 0,
            sharePct: curGmv > 0 ? ((channelGmv.get(ch) || 0) / curGmv) * 100 : 0,
          }))
        : [{ channel: channels[0], gmv: curGmv, sharePct: curGmv > 0 ? 100 : 0 }];

    // Order Status — MUST classify the exact same canonical order population
    // as the Orders KPI (uniqExactIf(invoice_id, net_sales_amount > 0) on
    // mart_net_sales, same store/channel/date scope), never a different,
    // smaller population, so SUM(orderStatus.count) === kpis.orders always.
    //
    // Each canonical invoice_id gets exactly one status (single GROUP BY
    // over the canonical set, not separate additive queries, so there is
    // no double-counting by construction):
    //   1. order_status from xv3.mart_xv3_order_report, LEFT JOINed on
    //      invoice_id (the same field Recent Orders already joins on) —
    //      real values only (Paid/Cancelled/Completed/For Delivery/
    //      Processing/Pending).
    //   2. "Unknown/Unmapped" for every canonical invoice_id with no match
    //      in that table (investigated: TikTok/Shopee orders and a
    //      majority of HMRPH Online orders aren't tracked there at all —
    //      that table is HMRPH's own storefront checkout system, not a
    //      universal order ledger, so this is expected, not a bug).
    // "Returned" was investigated and deliberately NOT added: a return's
    // invoice_id does not match its original sale's invoice_id in
    // mart_net_sales (checked directly — zero overlap), so there is no
    // reliable way to tag a canonical order as returned without guessing.
    const orderStatusRows = await (
      await client.query({
        query: `
          WITH canonical AS (
            SELECT DISTINCT invoice_id, sales_channel
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND net_sales_amount > 0 AND invoice_id IS NOT NULL
          ),
          statuses AS (
            SELECT invoice_id, argMax(order_status, created_at) AS order_status
            FROM xv3.mart_xv3_order_report
            WHERE invoice_id IS NOT NULL
            GROUP BY invoice_id
          )
          SELECT
            multiIf(s.order_status != '', s.order_status, 'Unknown/Unmapped') AS status,
            c.sales_channel AS channel,
            count() AS c
          FROM canonical c
          LEFT JOIN statuses s ON c.invoice_id = s.invoice_id
          GROUP BY status, channel
          ORDER BY c DESC
        `,
        query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    // Matched statuses (Paid/Processing/etc.) stay collapsed across channels
    // — coverage in xv3.mart_xv3_order_report is essentially HMRPH Online
    // only anyway (see comment above). "Unknown/Unmapped" is split per
    // channel instead of one blob, since it means something different per
    // channel: for TikTok/Shopee it's simply "this table never tracks
    // marketplace orders at all" (100% of those orders, every period); for
    // HMRPH Online it's a real (smaller) coverage gap in that table.
    const CHANNEL_DISPLAY = { "HMRPH ONLINE": "HMRPH Online", TIKTOK: "TikTok", SHOPEE: "Shopee" };
    const matchedTotals = new Map();
    const orderStatus = [];
    for (const r of orderStatusRows) {
      const count = toNum(r.c);
      if (r.status === "Unknown/Unmapped") {
        orderStatus.push({ status: `Unmapped (${CHANNEL_DISPLAY[r.channel] || r.channel})`, count });
      } else {
        matchedTotals.set(r.status, (matchedTotals.get(r.status) || 0) + count);
      }
    }
    for (const [status, count] of matchedTotals) orderStatus.push({ status, count });
    orderStatus.sort((a, b) => b.count - a.count);
    const hasUnmapped = orderStatus.some((r) => r.status.startsWith("Unmapped"));

    // Customer Segments — deliberately HARD-CODED to sales_channel =
    // 'HMRPH ONLINE', ignoring the page's channel filter entirely. Verified
    // (2026-09-09, MTD window): every single TikTok/Shopee order carries
    // customer_name = 'WALK IN' (HMR's own systems never capture a real
    // buyer identity for marketplace orders — that relationship lives on
    // TikTok's/Shopee's own platform), so classifying those channels would
    // just produce ~100% "Unregistered" noise, not a meaningful segment
    // split. HMRPH Online is the only channel where this is real signal.
    //
    // Anchored to the SAME canonical invoice_id population style as Order
    // Status (store/date-scoped positive-sale invoices from mart_net_sales,
    // channel fixed here), so SUM(customerSegments.orders) is always a
    // clean subset with a known, stated scope — never a mismatched
    // population. New/Retained/Reactivated/Unregistered come from a full
    // cross-store purchase-history cohort analysis on customer_name (the
    // only identifier consistently populated across xv3.mart_invoice_items'
    // history) — a customer already active at a physical branch for years
    // is correctly NOT "New" just because this is their first HRH Online
    // order. Classification is evaluated as of the window's last month
    // (toStartOfMonth(current.to)) — exact for WTD/MTD (single month),
    // an end-of-range snapshot rather than a month-by-month sum for
    // multi-month windows (YTD/wide Custom ranges).
    const customerSegmentRows = await (
      await client.query({
        query: `
          WITH canonical AS (
            SELECT DISTINCT invoice_id
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String} AND sales_channel = 'HMRPH ONLINE'
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND net_sales_amount > 0 AND invoice_id IS NOT NULL
          ),
          canonical_customer AS (
            SELECT c.invoice_id AS invoice_id, any(m.customer_name) AS customer_name
            FROM canonical c
            LEFT JOIN xv3.mart_invoice_items m ON c.invoice_id = m.invoice_id
            GROUP BY c.invoice_id
          ),
          customer_purchase_history AS (
            SELECT
              customer_name,
              transaction_date,
              MIN(transaction_date) OVER (PARTITION BY customer_name) AS first_ever_date,
              lag(transaction_date) OVER (PARTITION BY customer_name ORDER BY transaction_date ASC) AS previous_date
            FROM (
              SELECT DISTINCT customer_name, toDate(transaction_date) AS transaction_date
              FROM xv3.mart_invoice_items
              WHERE customer_name IS NOT NULL AND trim(customer_name) != ''
                AND customer_name NOT IN ('n/a', 'WALK IN') AND match(customer_name, '[a-zA-Z]')
            )
          ),
          customer_month_segment AS (
            SELECT
              customer_name,
              toStartOfMonth(transaction_date) AS purchase_month,
              MIN(transaction_date) AS first_transaction_in_month,
              argMin(first_ever_date, transaction_date) AS first_order_date,
              argMin(previous_date, transaction_date) AS first_previous_date
            FROM (
              SELECT
                m.customer_name AS customer_name,
                toDate(m.transaction_date) AS transaction_date,
                ch.first_ever_date AS first_ever_date,
                ch.previous_date AS previous_date
              FROM xv3.mart_invoice_items m
              LEFT JOIN customer_purchase_history ch
                ON m.customer_name = ch.customer_name AND toDate(m.transaction_date) = ch.transaction_date
              WHERE m.customer_name IS NOT NULL AND trim(m.customer_name) != ''
                AND m.customer_name NOT IN ('n/a', 'WALK IN') AND match(m.customer_name, '[a-zA-Z]')
            )
            GROUP BY customer_name, toStartOfMonth(transaction_date)
          )
          SELECT
            multiIf(
              cc.customer_name IS NULL OR trim(cc.customer_name) = '' OR cc.customer_name IN ('n/a', 'WALK IN') OR NOT match(cc.customer_name, '[a-zA-Z]'), 'Unregistered',
              toStartOfMonth(cms.first_order_date) = cms.purchase_month, 'New',
              cms.first_previous_date IS NOT NULL AND dateDiff('month', cms.first_previous_date, cms.first_transaction_in_month) <= 2, 'Retained',
              cms.first_previous_date IS NOT NULL AND dateDiff('month', cms.first_previous_date, cms.first_transaction_in_month) > 2, 'Reactivated',
              'Unknown'
            ) AS segment,
            count() AS orders
          FROM canonical_customer cc
          LEFT JOIN customer_month_segment cms
            ON cc.customer_name = cms.customer_name
            AND cms.purchase_month = toStartOfMonth(toDate({curTo:String}))
          GROUP BY segment
          ORDER BY orders DESC
        `,
        query_params: { store: HRH_STORE, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    const customerSegments = customerSegmentRows.map((r) => ({ segment: r.segment, orders: toNum(r.orders) }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        range,
        current,
        previous,
        salesAsOf: k.sales_as_of || null,
        generatedAt: new Date().toISOString(),
        orderStatusNote: hasUnmapped
          ? "Status coverage based on matched order records; unmatched sales orders are shown as Unmapped, split by channel."
          : null,
      },
      kpis: {
        gmv: { value: curGmv, delta: pctDelta(curGmv, prevGmv) },
        nmv: { value: curNmv, delta: pctDelta(curNmv, prevNmv) },
        aov: { value: curAov, delta: pctDelta(curAov, prevAov) },
        orders: { value: curOrders, delta: pctDelta(curOrders, prevOrders) },
        units: { value: curUnits, delta: pctDelta(curUnits, prevUnits) },
      },
      salesTrend,
      channelMix,
      orderStatus,
      customerSegments,
    });
  } catch (err) {
    console.error("HRH Executive Overview API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Executive Overview",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
