import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) —
// dispatched from api/hrh-sales-analytics.js via ?report=pickupDelivery.
//
// Pickup vs Delivery is checkout_method on xv3.mart_xv3_order_report —
// same field already used by Orders & Fulfillment's "Cancelled by
// Fulfillment Method" and Returns' "Returns by Fulfillment Method".
// GMV/category/payment-type come from xv3.mart_net_sales (sale-side,
// net_sales_amount > 0), joined to checkout_method by order_no ->
// order_number (direct match only — same field, no probable-matching
// here; unmatched sales, mostly TikTok/Shopee which never populate
// order_report, show as "Unknown" rather than a guess).
//
// investigated: xv3.mart_order_fulfilment_journey (courier_service IS
// NULL as a pickup proxy) was considered and rejected — only ~55% of its
// rows even match back to order_report, and courier_service NULL isn't
// exact (17 of 902 null-courier rows are actually Delivery in a Sep
// sample). checkout_method is the direct, authoritative field.
const HRH_STORE = "HRH ONLINE";
const CHANNEL_MAP = {
  "All Channels": ["HMRPH ONLINE", "TIKTOK", "SHOPEE"],
  "HMRPH Online": ["HMRPH ONLINE"],
  TikTok: ["TIKTOK"],
  Shopee: ["SHOPEE"],
};
const METHODS = ["Pickup", "Delivery", "Unknown"];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function manilaTodayISODate() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { from, to };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: mondayOfWeek(today), to: today }; // wtd (default)
}
// Payment type free text has a few case variants ("GCash" / "Gcash")
// that are the same method — grouped case-insensitively, but displayed
// using whichever casing was seen FIRST rather than forcing Title Case
// (blanket title-casing would mangle already-correct strings like "BPI"
// -> "Bpi" or "Debit/Credit Card" -> "Debit/credit Card", most of which
// have only one real casing in the data).
function makePaymentTypeNormalizer() {
  const seen = new Map();
  return (raw) => {
    if (!raw) return "Unknown";
    const key = raw.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, raw.trim());
    return seen.get(key);
  };
}

export async function handlePickupDelivery(req, res) {
  try {
    const channel = req.query.channel || "All Channels";
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    let range_;
    try {
      range_ = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const salesRows = await (
      await client.query({
        query: `
          SELECT order_no, invoice_id, transaction_date, net_sales_amount, category_name
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)}
            AND transaction_type = 'sale' AND net_sales_amount > 0
            AND transaction_date BETWEEN {from:String} AND {to:String}
        `,
        query_params: { store: HRH_STORE, channels, from: range_.from, to: range_.to },
        format: "JSONEachRow",
      })
    ).json();

    const orderNos = [...new Set(salesRows.map((r) => r.order_no).filter(Boolean))];
    let checkoutByOrder = new Map();
    if (orderNos.length) {
      const checkoutRows = await (
        await client.query({
          query: `
            SELECT order_number, any(checkout_method) AS checkout_method, any(payment_type) AS payment_type
            FROM xv3.mart_xv3_order_report
            WHERE order_number IN ({ids:Array(String)})
            GROUP BY order_number
          `,
          query_params: { ids: orderNos },
          format: "JSONEachRow",
        })
      ).json();
      checkoutByOrder = new Map(checkoutRows.map((r) => [r.order_number, { method: r.checkout_method || "Unknown", paymentType: r.payment_type }]));
    }

    const normalizePaymentType = makePaymentTypeNormalizer();
    const byMethod = new Map(METHODS.map((m) => [m, { orders: new Set(), gmv: 0 }]));
    const byMethodPaymentType = new Map(METHODS.map((m) => [m, new Map()]));
    const byMethodCategory = new Map(METHODS.map((m) => [m, new Map()]));
    const byDate = new Map();

    for (const r of salesRows) {
      const match = checkoutByOrder.get(r.order_no);
      const method = match?.method && METHODS.includes(match.method) ? match.method : "Unknown";
      const amount = toNum(r.net_sales_amount);
      const invoiceKey = r.invoice_id ?? `no-invoice-${r.order_no}`;

      const bucket = byMethod.get(method);
      bucket.orders.add(invoiceKey);
      bucket.gmv += amount;

      const paymentType = normalizePaymentType(match?.paymentType);
      const ptMap = byMethodPaymentType.get(method);
      ptMap.set(paymentType, (ptMap.get(paymentType) || 0) + amount);

      const category = r.category_name || "Uncategorized";
      const catMap = byMethodCategory.get(method);
      catMap.set(category, (catMap.get(category) || 0) + amount);

      const date = r.transaction_date ? String(r.transaction_date).slice(0, 10) : null;
      if (date) {
        if (!byDate.has(date)) byDate.set(date, { date, pickupGmv: 0, deliveryGmv: 0, pickupOrders: new Set(), deliveryOrders: new Set() });
        const dBucket = byDate.get(date);
        if (method === "Pickup") {
          dBucket.pickupGmv += amount;
          dBucket.pickupOrders.add(invoiceKey);
        } else if (method === "Delivery") {
          dBucket.deliveryGmv += amount;
          dBucket.deliveryOrders.add(invoiceKey);
        }
      }
    }

    const totalGmv = METHODS.reduce((s, m) => s + byMethod.get(m).gmv, 0);
    const totalOrders = METHODS.reduce((s, m) => s + byMethod.get(m).orders.size, 0);

    const methodSummary = METHODS.map((m) => {
      const b = byMethod.get(m);
      return {
        method: m,
        orders: b.orders.size,
        gmv: b.gmv,
        aov: safeDivide(b.gmv, b.orders.size),
        sharePct: safeDivide(b.gmv, totalGmv) * 100,
      };
    });

    const paymentTypeByMethod = {};
    for (const m of METHODS) {
      paymentTypeByMethod[m] = Array.from(byMethodPaymentType.get(m), ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    }
    const categoryByMethod = {};
    for (const m of METHODS) {
      categoryByMethod[m] = Array.from(byMethodCategory.get(m), ([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
    }

    const trend = Array.from(byDate.values())
      .map((d) => ({
        date: d.date,
        pickupGmv: d.pickupGmv,
        deliveryGmv: d.deliveryGmv,
        pickupOrders: d.pickupOrders.size,
        deliveryOrders: d.deliveryOrders.size,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const pickup = methodSummary.find((m) => m.method === "Pickup");
    const delivery = methodSummary.find((m) => m.method === "Delivery");
    const unknown = methodSummary.find((m) => m.method === "Unknown");

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        range,
        current: { from: range_.from, to: range_.to },
        methodologyNote:
          "Pickup vs Delivery is checkout_method on xv3.mart_xv3_order_report, joined to sales in xv3.mart_net_sales by order_no (direct match only). Sales with no matching order (mostly TikTok/Shopee, which never populate that table) show as Unknown, not guessed.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        pickupOrders: { value: pickup.orders },
        deliveryOrders: { value: delivery.orders },
        pickupGmv: { value: pickup.gmv },
        deliveryGmv: { value: delivery.gmv },
        pickupAov: { value: pickup.aov },
        deliveryAov: { value: delivery.aov },
      },
      methodSummary,
      paymentTypeByMethod,
      categoryByMethod,
      trend,
      dataQuality: [
        `${unknown.orders} of ${totalOrders} orders (${safeDivide(unknown.orders, totalOrders) * 100 < 1 ? "<1" : (safeDivide(unknown.orders, totalOrders) * 100).toFixed(1)}%) couldn't be matched to a checkout_method — mostly TikTok/Shopee sales, which don't flow through xv3.mart_xv3_order_report at all (verified elsewhere), plus a small number of HMRPH Online invoices with no order_no populated. Shown as "Unknown", not guessed as Pickup or Delivery.`,
        "This uses direct order_no matching only (no probable/fuzzy matching), unlike Orders & Fulfillment's completion-rate logic — Pickup/Delivery is a reporting split here, not a fulfillment-completion determination, so the stricter direct match is enough and keeps this page independent of that page's methodology.",
        "Payment type case variants (e.g. \"GCash\" / \"Gcash\") are merged case-insensitively, displayed using whichever casing appeared first.",
      ],
    });
  } catch (err) {
    console.error("HRH Pickup & Delivery API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Pickup & Delivery data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
