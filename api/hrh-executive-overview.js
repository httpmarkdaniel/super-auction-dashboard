import { createClient } from "@clickhouse/client";
import { computeHmrphOnlineLifecycle } from "./_hrh-orders-fulfillment.js";

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
// Resolves ONLY the current window from the Date Range filter (WTD/MTD/
// YTD/Custom) — the comparison window is a separate, user-chosen concern,
// see resolveComparisonWindow below.
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
  // Full prior calendar week/month/year — NOT "to date" (see the shared
  // preset added to src/hrh-online/dateRange.js): Previous Week is
  // Monday-Sunday of the week before this one; Previous Month is the 1st
  // through the last day of the month before this one; Previous Year is
  // Jan 1 - Dec 31 of last year.
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { current: { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) } };
  }
  if (range === "prevMonth") {
    const lastDayPrevMonth = addDaysISO(firstOfMonthISO(today), -1);
    return { current: { from: firstOfMonthISO(lastDayPrevMonth), to: lastDayPrevMonth } };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { current: { from: `${y}-01-01`, to: `${y}-12-31` } };
  }
  return { current: { from: mondayOfWeek(today), to: today } };
}

// The "Compare to" scorecard control (Day/Week/Month) — shifts the WHOLE
// current window back by a fixed amount, independent of the Date Range
// filter's own span or type. This replaces the old behavior where the
// comparison window was implicitly tied to the range type (e.g. WTD was
// always "vs prior week") — now the user picks the comparison basis
// explicitly, and it applies the same way regardless of what's selected
// in the Date Range filter (a single day, a week, MTD, a custom span…).
function resolveComparisonWindow(current, compareTo) {
  const { from, to } = current;
  if (compareTo === "day") return { from: addDaysISO(from, -1), to: addDaysISO(to, -1) };
  if (compareTo === "month") return { from: shiftMonthsClampedISO(from, -1), to: shiftMonthsClampedISO(to, -1) };
  return { from: addDaysISO(from, -7), to: addDaysISO(to, -7) }; // "week" (default)
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
function daysInRange(from, to) {
  return enumerateDatesISO(from, to).length;
}

export default async function handler(req, res) {
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
    // Day counts for the current/comparison windows — used by Avg Sales/Day
    // by Channel below (GMV spread evenly across the window's calendar
    // days, not just days with sales, so a slow custom range reads as
    // genuinely slower rather than averaging only its active days).
    const curDayCount = daysInRange(current.from, current.to);
    const prevDayCount = daysInRange(previous.from, previous.to);

    // Projected Month-End Sales — run-rate projection tied to the current
    // Manila calendar month, independent of the page's Date Range filter
    // (same reasoning as Avg Sales/Day by Channel above: "end of month"
    // only means something against the real month). Average daily GMV is
    // computed over ACTIVE days only (days with GMV > 0) — a day with no
    // sales at all (no data, not just a slow day) would otherwise drag the
    // average down and understate the projection — then that average is
    // spread across every day in the month, elapsed or not.
    const today = manilaTodayISODate();
    const monthStart = firstOfMonthISO(today);
    const prevMonthStart = shiftMonthsClampedISO(monthStart, -1);
    const [y, m] = monthStart.split("-").map(Number);
    const totalDaysInMonth = daysInMonth(y, m);

    const monthGmvRows = await (
      await client.query({
        query: `
          SELECT
            transaction_date AS d,
            sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY transaction_date
        `,
        query_params: { store: HRH_STORE, channels, from: prevMonthStart, to: today },
        format: "JSONEachRow",
      })
    ).json();
    let mtdGmv = 0;
    let activeDaysThisMonth = 0;
    let lastMonthGmv = 0;
    for (const r of monthGmvRows) {
      const rowGmv = toNum(r.gmv);
      if (r.d >= monthStart) {
        mtdGmv += rowGmv;
        if (rowGmv > 0) activeDaysThisMonth += 1;
      } else {
        lastMonthGmv += rowGmv;
      }
    }
    const avgGmvPerActiveDay = safeDivide(mtdGmv, activeDaysThisMonth);
    const projectedMonthEndSales = avgGmvPerActiveDay * totalDaysInMonth;

    // Sales Trend — daily GMV (gross, sale-side only) + Orders + Units for
    // the CURRENT window only. Zero-filled below so a day with no sales
    // doesn't create a gap in the x-axis.
    const trendRows = await (
      await client.query({
        query: `
          SELECT
            transaction_date AS d,
            sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
            uniqExactIf(invoice_id, net_sales_amount > 0) AS orders,
            sumIf(net_quantity, net_sales_amount > 0) AS units
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
    const trendByDate = new Map(
      trendRows.map((r) => [r.d, { gmv: toNum(r.gmv), orders: toNum(r.orders), units: toNum(r.units) }])
    );
    const salesTrend = enumerateDatesISO(current.from, current.to).map((d) => ({
      date: d,
      gmv: trendByDate.get(d)?.gmv ?? 0,
      orders: trendByDate.get(d)?.orders ?? 0,
      units: trendByDate.get(d)?.units ?? 0,
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

    // Avg Sales/Day by Channel — same "always all 3 real channels" pattern
    // as Sales by Channel above, so the 3 channels are visible side by side
    // without switching the page's Channel filter. Reuses channelGmv (cur)
    // and queries the comparison window's per-channel GMV the same way.
    const prevChannelRows = await (
      await client.query({
        query: `
          SELECT sales_channel AS ch, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {allChannels:Array(String)}
            AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}
          GROUP BY sales_channel
        `,
        query_params: { store: HRH_STORE, allChannels: CHANNEL_MAP["All Channels"], prevFrom: previous.from, prevTo: previous.to },
        format: "JSONEachRow",
      })
    ).json();
    const prevChannelGmv = new Map(prevChannelRows.map((r) => [r.ch, toNum(r.gmv)]));
    const avgSalesPerDayByChannel = CHANNEL_MAP["All Channels"].map((ch) => {
      const curChGmv = channelGmv.get(ch) || 0;
      const prevChGmv = prevChannelGmv.get(ch) || 0;
      const curAvg = safeDivide(curChGmv, curDayCount);
      const prevAvg = safeDivide(prevChGmv, prevDayCount);
      return { channel: ch, value: curAvg, previous: prevAvg, delta: pctDelta(curAvg, prevAvg) };
    });
    const channelMix =
      channel === "All Channels"
        ? CHANNEL_MAP["All Channels"].map((ch) => ({
            channel: ch,
            gmv: channelGmv.get(ch) || 0,
            sharePct: curGmv > 0 ? ((channelGmv.get(ch) || 0) / curGmv) * 100 : 0,
          }))
        : [{ channel: channels[0], gmv: curGmv, sharePct: curGmv > 0 ? 100 : 0 }];

    // Order Lifecycle — replaces the old order_status-heavy donut (Paid/
    // Processing/Unknown-Unmapped described raw system state, not real
    // fulfillment — order_status can sit at "Paid" or "Processing" long
    // after an order is actually invoiced and sold). Uses the SAME
    // canonical Fulfilled/Cancelled/Still Awaiting definitions as Orders &
    // Fulfillment (see api/_hrh-orders-fulfillment.js's
    // computeHmrphOnlineLifecycle — fulfillment determined from invoices
    // in xv3.mart_net_sales, direct order_no match or a probable name+
    // date+amount match, never from order_status), for the SAME date
    // range as this page's Date Range filter, so the two pages always
    // reconcile for HMRPH Online.
    //
    // Cancelled = allRealCancelled (ALL real cancellations, any reason —
    // 2026-09-15 unification, see computeHmrphOnlineLifecycle's 2026-09-15
    // note). Previously this used only the narrower stayingCancelled
    // population, which didn't match Orders & Fulfillment's broader
    // Cancellation Rate KPI for the same period.
    //
    // Fixed to HMRPH Online regardless of the page's Channel filter — same
    // reasoning as Customer Segments below: xv3.mart_xv3_order_report (the
    // order/cancellation source) only ever contains HMRPH Online's own
    // website orders, TikTok/Shopee orders never flow through it, so there
    // is no equivalent lifecycle to compute for those channels without
    // separate validation (see api/_hrh-orders-fulfillment.js's channel-
    // scope comment).
    const lifecycleData = await computeHmrphOnlineLifecycle(current.from, current.to);
    const orderLifecycle = [
      { status: "Fulfilled", count: lifecycleData.fulfilled },
      { status: "Cancelled", count: lifecycleData.allRealCancelled },
      { status: "Still Awaiting Fulfillment", count: lifecycleData.stillAwaiting },
    ];
    const orderLifecycleTotal = lifecycleData.realOrdersReceived;

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
        compareTo,
        current,
        previous,
        salesAsOf: k.sales_as_of || null,
        generatedAt: new Date().toISOString(),
        orderLifecycleNote:
          "HMRPH Online only, not affected by the Channel filter above — same Fulfilled/Cancelled/Still Awaiting definitions as Orders & Fulfillment (fulfillment from invoices, not order_status).",
      },
      kpis: {
        gmv: { value: curGmv, previous: prevGmv, delta: pctDelta(curGmv, prevGmv) },
        nmv: { value: curNmv, previous: prevNmv, delta: pctDelta(curNmv, prevNmv) },
        aov: { value: curAov, previous: prevAov, delta: pctDelta(curAov, prevAov) },
        orders: { value: curOrders, previous: prevOrders, delta: pctDelta(curOrders, prevOrders) },
        units: { value: curUnits, previous: prevUnits, delta: pctDelta(curUnits, prevUnits) },
        projectedMonthEndSales: {
          value: projectedMonthEndSales,
          previous: lastMonthGmv,
          delta: pctDelta(projectedMonthEndSales, lastMonthGmv),
        },
      },
      salesTrend,
      avgSalesPerDayByChannel,
      channelMix,
      orderLifecycle,
      orderLifecycleTotal,
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
