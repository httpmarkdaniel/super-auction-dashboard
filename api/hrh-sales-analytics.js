import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Locked HRH Online sales contract — identical to api/hrh-product-analytics.js
// and api/hrh-executive-overview.js (store scope, channel scope, GMV/NMV/
// Orders/Units/AOV formulas). Duplicated here as small self-contained
// functions rather than imported, so this file can never accidentally
// change Product Analytics' behavior.
const HRH_STORE = "HRH ONLINE";
const CHANNEL_MAP = {
  "All Channels": ["HMRPH ONLINE", "TIKTOK", "SHOPEE"],
  "HMRPH Online": ["HMRPH ONLINE"],
  TikTok: ["TIKTOK"],
  Shopee: ["SHOPEE"],
};
const CHANNEL_DISPLAY = { "HMRPH ONLINE": "HMRPH Online", TIKTOK: "TikTok", SHOPEE: "Shopee" };

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}

// ---------------------------------------------------------------------
// Date math — identical logic to api/hrh-product-analytics.js's resolveRange
// (Asia/Manila "today", WTD/MTD/YTD/Custom current-window resolution). Only
// the CURRENT window is used on this page (no prior-period deltas in the
// mockup this was built from), so the previous-period half is dropped.
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
function resolveCurrentRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { from, to };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: mondayOfWeek(today), to: today }; // wtd
}

// Known case-variant duplicates in the raw payment_type values (verified via
// system.columns sample — "Gcash" and "GCash" are the same method, just
// inconsistently cased at entry) — normalized so they don't split into two
// legend rows.
const PAYMENT_TYPE_DISPLAY = {
  gcash: "GCash",
  maya: "Maya",
  paymaya: "Maya",
  "debit/credit card": "Debit/Credit Card",
  "cash on delivery": "Cash On Delivery",
};
function normalizePaymentType(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return PAYMENT_TYPE_DISPLAY[key] || raw.trim();
}
const CHECKOUT_METHOD_DISPLAY = { Pickup: "Pickup at Store", Delivery: "Home Delivery" };

// Groups raw {label, value} counts into a top-N + "Other" ShareBar segment
// list, coloring by rank from the shared hrh.series palette.
function toTopSegments(rows, labelKey, valueKey, topN, seriesColors, otherColor) {
  const sorted = [...rows].sort((a, b) => toNum(b[valueKey]) - toNum(a[valueKey]));
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const segments = top.map((r, i) => ({ label: r[labelKey], value: toNum(r[valueKey]), color: seriesColors[i % seriesColors.length] }));
  const otherTotal = rest.reduce((s, r) => s + toNum(r[valueKey]), 0);
  if (otherTotal > 0) segments.push({ label: "Other", value: otherTotal, color: otherColor });
  return segments;
}

const SERIES_COLORS = ["#22304f", "#d99a3d", "#1baf7a", "#4a3aa7", "#e34948", "#2f8fd6"];
const OTHER_COLOR = "#94a0ae";

export default async function handler(req, res) {
  try {
    const { channel = "All Channels", from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];
    const allChannels = CHANNEL_MAP["All Channels"];

    let current;
    try {
      current = resolveCurrentRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    // Channel Comparison — GMV/NMV/Orders/Units/AOV/Return Rate always
    // broken out across all 3 real channels, regardless of the page's
    // channel filter (same convention as Executive Overview's Sales by
    // Channel donut: the whole point of this table is the per-channel
    // split, so the filter would otherwise just hide rows from a
    // comparison table). Return Rate = |returned amount| / GMV, computed
    // directly from mart_net_sales (transaction_type = 'return'), which
    // covers every channel — unlike Cancellation Rate below, this does NOT
    // depend on the limited order-report table.
    const channelRows = await (
      await client.query({
        query: `
          SELECT
            sales_channel AS ch,
            sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
            sum(net_sales_amount) AS nmv,
            sumIf(net_quantity, net_sales_amount > 0) AS units,
            uniqExactIf(invoice_id, net_sales_amount > 0) AS orders,
            sumIf(-net_sales_amount, transaction_type = 'return') AS return_amt
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {allChannels:Array(String)}
            AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
          GROUP BY sales_channel
        `,
        query_params: { store: HRH_STORE, allChannels, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();

    // Cancellation Rate — MUST classify the exact same canonical order
    // population as the Orders KPI/Order Status donut (see
    // api/hrh-executive-overview.js's comment for the full reasoning: real
    // order_status values LEFT JOINed on invoice_id from
    // xv3.mart_xv3_order_report). That table only ever tracks HMRPH Online
    // orders (TikTok/Shopee: 0% coverage, verified) — so a channel with zero
    // MATCHED orders reports Cancellation Rate as null ("N/A" once
    // formatted), never a fabricated 0%, which would misleadingly read as
    // "no cancellations" instead of "not tracked here at all".
    const cancelRows = await (
      await client.query({
        query: `
          WITH canonical AS (
            SELECT DISTINCT invoice_id, sales_channel
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String}
              AND sales_channel IN {allChannels:Array(String)}
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
            c.sales_channel AS ch,
            count() AS total,
            countIf(s.invoice_id IS NOT NULL) AS matched,
            countIf(s.order_status = 'Cancelled') AS cancelled
          FROM canonical c
          LEFT JOIN statuses s ON c.invoice_id = s.invoice_id
          GROUP BY ch
        `,
        query_params: { store: HRH_STORE, allChannels, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    const cancelByChannel = new Map(cancelRows.map((r) => [r.ch, r]));

    const channelComparison = allChannels.map((ch) => {
      const r = channelRows.find((row) => row.ch === ch) || {};
      const gmv = toNum(r.gmv);
      const nmv = toNum(r.nmv);
      const units = toNum(r.units);
      const orders = toNum(r.orders);
      const returnAmt = toNum(r.return_amt);
      const cancel = cancelByChannel.get(ch);
      const matched = cancel ? toNum(cancel.matched) : 0;
      const cancelled = cancel ? toNum(cancel.cancelled) : 0;
      return {
        channel: CHANNEL_DISPLAY[ch] || ch,
        gmv,
        nmv,
        orders,
        units,
        aov: safeDivide(gmv, orders),
        cancellationRate: matched > 0 ? (cancelled / matched) * 100 : null,
        returnRate: gmv > 0 ? (returnAmt / gmv) * 100 : 0,
      };
    });

    // Category / Department Contribution — GMV share for the CURRENT
    // window and the page's selected channel filter (unlike the table
    // above, these two respect it — they're a single distribution, not a
    // channel-by-channel comparison). category_name/department_name are
    // 100% populated on this store's population (verified), so every row
    // gets a real bucket, never an "Unknown" catch-all.
    const [categoryRows, departmentRows] = await Promise.all([
      (
        await client.query({
          query: `
            SELECT category_name AS label, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} AND net_sales_amount > 0
            GROUP BY category_name
            HAVING gmv > 0
            ORDER BY gmv DESC
          `,
          query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
      ).json(),
      (
        await client.query({
          query: `
            SELECT department_name AS label, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} AND net_sales_amount > 0
            GROUP BY department_name
            HAVING gmv > 0
            ORDER BY gmv DESC
          `,
          query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
      ).json(),
    ]);
    const categoryContribution = toTopSegments(categoryRows, "label", "gmv", 6, SERIES_COLORS, OTHER_COLOR);
    const departmentContribution = toTopSegments(departmentRows, "label", "gmv", 6, SERIES_COLORS, OTHER_COLOR);

    // Payment Type / Checkout-Fulfillment Method — same canonical-population
    // + LEFT JOIN pattern as Cancellation Rate above (xv3.mart_xv3_order_report,
    // scoped to the page's selected channel filter this time). Rows with no
    // match (TikTok/Shopee orders, plus a coverage gap on HMRPH Online) are
    // excluded from the percentage breakdown rather than shown as a
    // "unknown" slice that would dwarf the real signal — the `coverage`
    // note in the response states the exclusion explicitly.
    const checkoutInfoRows = await (
      await client.query({
        query: `
          WITH canonical AS (
            SELECT DISTINCT invoice_id
            FROM xv3.mart_net_sales
            WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)}
              AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND net_sales_amount > 0 AND invoice_id IS NOT NULL
          ),
          info AS (
            SELECT invoice_id, argMax(payment_type, created_at) AS payment_type, argMax(checkout_method, created_at) AS checkout_method
            FROM xv3.mart_xv3_order_report
            WHERE invoice_id IS NOT NULL
            GROUP BY invoice_id
          )
          SELECT c.invoice_id AS invoice_id, i.payment_type AS payment_type, i.checkout_method AS checkout_method
          FROM canonical c
          LEFT JOIN info i ON c.invoice_id = i.invoice_id
        `,
        query_params: { store: HRH_STORE, channels, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
    ).json();
    const totalCheckoutOrders = checkoutInfoRows.length;
    const paymentCounts = new Map();
    const fulfillmentCounts = new Map();
    let matchedPayment = 0;
    let matchedFulfillment = 0;
    for (const r of checkoutInfoRows) {
      const pt = normalizePaymentType(r.payment_type);
      if (pt) {
        matchedPayment += 1;
        paymentCounts.set(pt, (paymentCounts.get(pt) || 0) + 1);
      }
      const cm = r.checkout_method ? CHECKOUT_METHOD_DISPLAY[r.checkout_method] || r.checkout_method : null;
      if (cm) {
        matchedFulfillment += 1;
        fulfillmentCounts.set(cm, (fulfillmentCounts.get(cm) || 0) + 1);
      }
    }
    const paymentType = toTopSegments(
      Array.from(paymentCounts, ([label, value]) => ({ label, value })),
      "label",
      "value",
      6,
      SERIES_COLORS,
      OTHER_COLOR,
    );
    const fulfillmentMethod = toTopSegments(
      Array.from(fulfillmentCounts, ([label, value]) => ({ label, value })),
      "label",
      "value",
      6,
      SERIES_COLORS,
      OTHER_COLOR,
    );
    const checkoutCoverageNote =
      totalCheckoutOrders > 0 && (matchedPayment < totalCheckoutOrders || matchedFulfillment < totalCheckoutOrders)
        ? "Based on orders tracked by HMRPH's checkout system — TikTok/Shopee marketplace orders aren't tracked there, and are excluded rather than shown as unknown."
        : null;

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        range,
        current,
        generatedAt: new Date().toISOString(),
        checkoutCoverageNote,
      },
      channelComparison,
      categoryContribution,
      departmentContribution,
      paymentType,
      fulfillmentMethod,
    });
  } catch (err) {
    console.error("HRH Sales Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Sales Analytics",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
