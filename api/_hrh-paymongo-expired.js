import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (Hobby plan 12-function cap) — api/hrh-sales-analytics.js
// dispatches here on `?report=paymongoExpired`.
//
// The CMS auto-cancels unpaid HRH Online orders as "Expired Order - No Payment
// for 1 day" and never saves PayMongo's own outcome (cms.orders
// transaction_status / transaction_response are empty for every pi_ order).
// Each of those orders does keep its PayMongo Payment Intent ID in
// cms.orders.payment_gateway_reference_code, so this asks PayMongo directly
// (GET /v1/payment_intents/{id}, secret key in PAYMONGO_SECRET_KEY, server
// side only) and turns status + last_payment_error into a readable reason.
const HRH_STORE = "HRH ONLINE";
const EXPIRED_REASON = "Expired Order - No Payment for 1 day";
const PAYMONGO_BASE = "https://api.paymongo.com/v1";
const CONCURRENCY = 8;

// Expired intents don't change any more, so results are kept per warm
// instance (Fluid Compute reuses instances) to avoid re-asking PayMongo.
const CACHE_TTL_MS = 6 * 3600 * 1000;
const intentCache = new Map();

const METHOD_LABEL = {
  gcash: "GCash",
  paymaya: "Maya",
  grab_pay: "GrabPay",
  card: "Card",
  billease: "Billease",
  dob: "Online Banking",
  brankas: "Online Banking (Brankas)",
  dob_ubp: "UnionBank",
  brankas_bdo: "BDO",
  brankas_landbank: "Landbank",
  brankas_metrobank: "Metrobank",
  qrph: "QR Ph",
  shopee_pay: "ShopeePay",
};
const methodLabel = (t) => METHOD_LABEL[t] || (t ? String(t) : null);

function pickError(e) {
  if (!e || typeof e !== "object") return { code: null, message: null };
  return {
    code: e.failed_code || e.code || e.sub_code || null,
    message: e.failed_message || e.message || e.detail || null,
  };
}

// PayMongo intent → one readable reason. Verified against live intents
// (2026-10-01): status is awaiting_payment_method / awaiting_next_action /
// processing / succeeded; each attempt is a payments[] entry with status
// "failed" + failed_code/failed_message (also mirrored in
// last_payment_error for card declines). failed_code "CLOSED" ("Payment
// checkout has expired.") = customer reached the e-wallet/bank page and
// never authorized — not a decline. Brankas (online banking) reports the
// same thing as "EXPIRED" ("Session expired before transaction
// completed."). Maya's PY0105 = insufficient wallet balance.
const CHECKOUT_EXPIRED_CODES = new Set(["CLOSED", "EXPIRED"]);
const DECLINE_LABEL = {
  processor_declined: "Declined by bank",
  generic_decline: "Declined",
  insufficient_funds: "Insufficient funds",
  card_expired: "Card expired",
  fraudulent: "Blocked as possible fraud",
  lost_card: "Card reported lost",
  stolen_card: "Card reported stolen",
  cvc_invalid: "Wrong CVC",
  "3ds_failed": "3D Secure check failed",
  PY0105: "Insufficient Maya balance",
};

function classify(attrs) {
  const payments = Array.isArray(attrs.payments) ? attrs.payments : [];
  const last = payments.length ? payments[payments.length - 1]?.attributes || {} : {};
  const lastErr = pickError(attrs.last_payment_error);
  const errorCode = last.failed_code || lastErr.code || null;
  const errorMessage = last.failed_message || lastErr.message || null;
  const method = methodLabel(last.source?.type || null);
  const status = attrs.status || null;

  let reason;
  if (status === "succeeded" || last.status === "paid") reason = "Paid on PayMongo, still cancelled by CMS";
  else if (status === "processing") reason = "Payment still processing at PayMongo";
  else if (CHECKOUT_EXPIRED_CODES.has(errorCode)) reason = "Opened checkout, let it expire";
  else if (errorCode || last.status === "failed") reason = "Payment declined";
  else if (status === "awaiting_next_action") reason = "Chose a method, didn't continue";
  else if (status === "awaiting_payment_method") reason = "Never started payment";
  else reason = "Unknown PayMongo status";

  return {
    status,
    reason,
    method,
    attempts: payments.length,
    errorCode,
    errorMessage,
    errorLabel: errorCode && !CHECKOUT_EXPIRED_CODES.has(errorCode) ? DECLINE_LABEL[errorCode] || errorCode : null,
  };
}

async function fetchIntent(pi, auth) {
  const hit = intentCache.get(pi);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const resp = await fetch(`${PAYMONGO_BASE}/payment_intents/${encodeURIComponent(pi)}`, {
    headers: { accept: "application/json", authorization: auth },
  });
  let value;
  if (resp.ok) {
    const body = await resp.json();
    value = classify(body?.data?.attributes || {});
  } else {
    let detail = "";
    try {
      detail = (await resp.json())?.errors?.[0]?.detail || "";
    } catch {
      /* non-JSON error body */
    }
    value = { status: null, reason: `PayMongo lookup failed (HTTP ${resp.status})`, lookupError: detail || null };
  }
  if (resp.ok) intentCache.set(pi, { at: Date.now(), value });
  return value;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function handlePaymongoExpired(req, res) {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "PAYMONGO_SECRET_KEY is not set" });
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  // ?orders=250788,250789,… — PayMongo outcome for specific order numbers
  // (used by the Cancellation Reasons drilldown, so it follows whatever
  // orders that table already shows, including future periods).
  if (req.query.orders) {
    const nums = [...new Set(String(req.query.orders).split(",").map((x) => x.trim()).filter((x) => /^\d{1,20}$/.test(x)))].slice(0, 500);
    if (!nums.length) return res.status(200).json({ byOrder: {} });
    try {
      const piRows = await (
        await client.query({
          query: `
            SELECT order_number, argMax(payment_gateway_reference_code, _airbyte_extracted_at) AS pi
            FROM cms.orders WHERE order_number IN ({nums:Array(String)}) GROUP BY order_number
          `,
          query_params: { nums },
          format: "JSONEachRow",
        })
      ).json();
      const piByOrder = new Map(piRows.map((r) => [String(r.order_number), String(r.pi || "")]));
      const results = await mapLimit(nums, CONCURRENCY, async (n) => {
        const pi = piByOrder.get(n) || "";
        return [n, pi.startsWith("pi_") ? await fetchIntent(pi, auth) : { status: null, reason: "Not paid through PayMongo" }];
      });
      res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
      return res.status(200).json({ byOrder: Object.fromEntries(results) });
    } catch (err) {
      return res.status(500).json({ error: "Couldn't load PayMongo outcomes", message: err.message });
    }
  }

  const { from = "2000-01-01", to = "2100-01-01" } = req.query;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(from) || !isoDate.test(to)) return res.status(400).json({ error: "from/to must be YYYY-MM-DD" });

  try {
    const orders = await (
      await client.query({
        query: `
          WITH m AS (
            SELECT order_number, any(reference_code) AS ref, any(payment_type) AS payment_type,
                   any(checkout_method) AS checkout_method,
                   formatDateTime(any(order_created_at), '%Y-%m-%d %H:%i:%S') AS created_at,
                   formatDateTime(any(cancelled_date), '%Y-%m-%d %H:%i:%S') AS cancelled_at,
                   toFloat64(sum(price)) AS items_total, toFloat64(ifNull(any(shipping_fee), 0)) AS ship,
                   toFloat64(ifNull(any(discount_amount), 0)) AS disc
            FROM cms.mart_cms_order_report_detailed
            WHERE store_name = {store:String} AND cancellation_reason = {reason:String}
              AND toDate(order_created_at) BETWEEN {from:String} AND {to:String}
            GROUP BY order_number
          ),
          o AS (
            SELECT reference_code, argMax(payment_gateway_reference_code, _airbyte_extracted_at) AS pi
            FROM cms.orders WHERE reference_code IN (SELECT ref FROM m) GROUP BY reference_code
          )
          SELECT m.order_number, m.ref AS reference_code, ifNull(o.pi, '') AS payment_intent_id, m.payment_type,
                 m.checkout_method, m.created_at, m.cancelled_at,
                 round(m.items_total + m.ship - m.disc, 2) AS amount
          FROM m LEFT JOIN o ON o.reference_code = m.ref
          ORDER BY m.created_at DESC
        `,
        query_params: { store: HRH_STORE, reason: EXPIRED_REASON, from, to },
        format: "JSONEachRow",
      })
    ).json();

    const rows = await mapLimit(orders, CONCURRENCY, async (o) => {
      const pi = String(o.payment_intent_id || "");
      const pm = pi.startsWith("pi_")
        ? await fetchIntent(pi, auth)
        : { status: null, reason: "No PayMongo Payment Intent on the order" };
      return { ...o, amount: Number(o.amount) || 0, paymongo: pm };
    });

    const byReason = new Map();
    for (const r of rows) {
      const k = r.paymongo.reason;
      const b = byReason.get(k) || { reason: k, orders: 0, amount: 0 };
      b.orders += 1;
      b.amount += r.amount;
      byReason.set(k, b);
    }
    const summary = [...byReason.values()].sort((a, b) => b.orders - a.orders);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ from, to, total: rows.length, summary, rows });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't load PayMongo outcomes", message: err.message });
  }
}
