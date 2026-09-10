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
    // comparison table). Return Rate = distinct return invoices (a row with
    // net_sales_amount < 0, i.e. transaction_type = 'return') / Orders,
    // computed directly from mart_net_sales — covers every channel, unlike
    // Cancellation Rate below which depends on a much narrower table. A
    // return's invoice_no does NOT match its original sale's invoice_no
    // (verified: zero overlap), so this reads as "return incidence relative
    // to order volume" rather than "% of orders that got returned".
    const channelRows = await (
      await client.query({
        query: `
          SELECT
            sales_channel AS ch,
            sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
            sum(net_sales_amount) AS nmv,
            sumIf(net_quantity, net_sales_amount > 0) AS units,
            uniqExactIf(invoice_id, net_sales_amount > 0) AS orders,
            countDistinctIf(invoice_no, net_sales_amount < 0) AS return_invoices
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

    // Cancellation Rate — "True Cancellation" count from cms.mart_cms_order_report_detailed,
    // reclassifying a naive order_status = 'Cancelled' count: a cancelled
    // item that the SAME customer (matched by email, or by phone number when
    // email is blank) re-ordered afterward is a "Re-ordered" swap, not a
    // real lost sale — only the remainder counts as a "True Cancellation".
    // This table has NO sales_channel column and — verified this session —
    // NEVER carries a single TikTok/Shopee row for ANY store (it is HMRPH's
    // own storefront checkout system's export, not a marketplace ledger), so
    // this is computed ONCE for the whole store, not per channel, and only
    // ever attributed to the HMRPH Online row below; TikTok/Shopee report
    // Cancellation Rate as null ("N/A"), never a fabricated 0%.
    //
    // Windowed on order_created_at, NOT transaction_date — verified every
    // single 'Cancelled' row for this store has transaction_date = NULL
    // (that field is only ever populated once a sale actually posts, which
    // never happens for a cancelled order), so filtering on transaction_date
    // silently dropped 100% of cancellations (this is what produced a
    // fabricated 0% for the current month — a real bug, now fixed, not the
    // "cancellations lag order placement" timing effect it looked like).
    // Classification itself is intentionally UNSCOPED by store/date (matches
    // the reference query exactly) — a customer's reorder used to reclassify
    // a cancellation may itself fall outside this window or store, and
    // narrowing the match search would wrongly turn real "Re-ordered" swaps
    // into "True Cancellation"s. Only the FINAL count is filtered to this
    // store + window, via a LEFT JOIN back onto every row (cancelled or not)
    // of the base table, same shape as the reference query's virtual_table.
    const cancellationRows = await (
      await client.query({
        query: `
          WITH cancelled_items AS (
            SELECT order_number, sku AS item_key, lower(trim(email)) AS email,
              replaceRegexpAll(contact_number, '[^0-9]', '') AS mobile_no, order_created_at AS cancelled_created_at
            FROM cms.mart_cms_order_report_detailed
            WHERE order_status = 'Cancelled' AND sku IS NOT NULL AND trim(sku) != ''
          ),
          successful_items AS (
            SELECT order_number, sku AS item_key, lower(trim(email)) AS email,
              replaceRegexpAll(contact_number, '[^0-9]', '') AS mobile_no, order_created_at AS successful_created_at
            FROM cms.mart_cms_order_report_detailed
            WHERE order_status != 'Cancelled' AND sku IS NOT NULL AND trim(sku) != ''
          ),
          item_matches AS (
            SELECT
              c.order_number AS cancelled_order_number,
              c.item_key,
              argMinIf(s.order_number, s.successful_created_at, s.order_number IS NOT NULL) AS reorder_order_number
            FROM cancelled_items c
            LEFT JOIN successful_items s
              ON ((c.email != '' AND s.email = c.email) OR (c.email = '' AND c.mobile_no != '' AND s.mobile_no = c.mobile_no))
              AND s.item_key = c.item_key
              AND s.successful_created_at > c.cancelled_created_at
            GROUP BY c.order_number, c.item_key
          ),
          classification AS (
            SELECT cancelled_order_number AS order_number, item_key,
              multiIf(reorder_order_number IS NOT NULL, 'Re-ordered', 'True Cancellation') AS cancellation_type
            FROM item_matches
          )
          SELECT c.cancellation_type AS cancellation_type, uniqExact(b.order_number) AS orders
          FROM cms.mart_cms_order_report_detailed b
          LEFT JOIN classification c ON b.order_number = c.order_number AND b.sku = c.item_key
          WHERE b.store_name = {store:String}
            AND b.order_created_at >= {curFromDt:String} AND b.order_created_at < {curToExclusiveDt:String}
            AND c.cancellation_type IS NOT NULL
          GROUP BY cancellation_type
        `,
        query_params: {
          store: HRH_STORE,
          curFromDt: `${current.from} 00:00:00`,
          curToExclusiveDt: `${addDaysISO(current.to, 1)} 00:00:00`,
        },
        format: "JSONEachRow",
      })
    ).json();
    const trueCancellations = toNum(cancellationRows.find((r) => r.cancellation_type === "True Cancellation")?.orders);

    // Denominator for Cancellation Rate is intentionally this SAME table's
    // total distinct order_number (not the mart_net_sales Orders count used
    // for every other column) — cms.mart_cms_order_report_detailed tracks
    // ALL order attempts (including ones that never became a completed
    // sale), keyed on order_created_at, a genuinely different population
    // from mart_net_sales' completed-sale, transaction_date-keyed Orders.
    // Dividing the True Cancellation count by a differently-scoped
    // denominator would produce an incoherent rate, not just an
    // apples-to-oranges one.
    const cmsTotalOrdersRows = await (
      await client.query({
        query: `
          SELECT uniqExact(order_number) AS total
          FROM cms.mart_cms_order_report_detailed
          WHERE store_name = {store:String}
            AND order_created_at >= {curFromDt:String} AND order_created_at < {curToExclusiveDt:String}
        `,
        query_params: {
          store: HRH_STORE,
          curFromDt: `${current.from} 00:00:00`,
          curToExclusiveDt: `${addDaysISO(current.to, 1)} 00:00:00`,
        },
        format: "JSONEachRow",
      })
    ).json();
    const cmsTotalOrders = toNum(cmsTotalOrdersRows[0]?.total);

    const channelComparison = allChannels.map((ch) => {
      const r = channelRows.find((row) => row.ch === ch) || {};
      const gmv = toNum(r.gmv);
      const nmv = toNum(r.nmv);
      const units = toNum(r.units);
      const orders = toNum(r.orders);
      const returnInvoices = toNum(r.return_invoices);
      return {
        channel: CHANNEL_DISPLAY[ch] || ch,
        gmv,
        nmv,
        orders,
        units,
        aov: safeDivide(gmv, orders),
        // Only HMRPH Online is ever covered by the cms.mart_cms_order_report_detailed
        // cancellation classification (see comment above) — TikTok/Shopee
        // always report null ("N/A"), never a fabricated 0%. Denominator is
        // cmsTotalOrders (same table/population as the numerator), not the
        // mart_net_sales `orders` count above — see comment on cmsTotalOrders.
        cancellationRate: ch === "HMRPH ONLINE" && cmsTotalOrders > 0 ? (trueCancellations / cmsTotalOrders) * 100 : null,
        returnRate: orders > 0 ? (returnInvoices / orders) * 100 : null,
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
