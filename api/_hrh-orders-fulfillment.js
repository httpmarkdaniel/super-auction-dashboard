import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions.
// api/hrh-sales-analytics.js dispatches here on `?report=ordersFulfillment`.
//
// ---------------------------------------------------------------------
// METHODOLOGY — ported from the HMR MART / HMRPH ONLINE Sep 2026 MTD
// report (source of truth for every definition below). Two real source
// tables:
//   xv3.mart_xv3_order_report — orders, cancellations, customer/checkout
//     detail. One row per order, occasional exact-duplicate CDC rows
//     (deduped below via GROUP BY order_number). No sales_channel column
//     at all — verified against live data that store_name = 'HRH ONLINE'
//     alone reproduces the report's HMRPH-ONLINE-only order counts exactly
//     (88 distinct orders, Sep 1-10 2026), meaning this table only ever
//     contains HMRPH Online's own website orders; TikTok/Shopee orders
//     never enter it. That's why this whole page is scoped to HMRPH
//     Online only (see CHANNEL SCOPE below) — there is no equivalent
//     order/cancellation source for the other two channels to validate
//     this methodology against.
//   xv3.mart_net_sales — invoices (transaction_type = 'sale'), used only
//     to determine FULFILLMENT. order_status on the order table is
//     explicitly NOT used for that — it can sit at "Paid" or "Processing"
//     long after an order has actually been invoiced and sold.
// ---------------------------------------------------------------------
const HRH_STORE = "HRH ONLINE";
const HMRPH_CHANNEL = "HMRPH ONLINE";
// Returns (mart_net_sales) has a real sales_channel column covering all 3
// channels, unlike the order/cancellation source table above — same map
// as api/hrh-executive-overview.js's CHANNEL_MAP.
const CHANNEL_MAP = {
  "All Channels": ["HMRPH ONLINE", "TIKTOK", "SHOPEE"],
  "HMRPH Online": ["HMRPH ONLINE"],
  TikTok: ["TIKTOK"],
  Shopee: ["SHOPEE"],
};

// Dev/test exclusions — centralized here and reused by both Orders &
// Fulfillment and Executive Overview (see computeHmrphOnlineLifecycle
// below, imported by api/hrh-executive-overview.js). Reusable rule, not
// hardcoded to specific September order numbers: any cancellation by
// customer_id 70700 tagged "Dev test"/"Devtest"/"devtest", any
// cancellation reason "FOR TESTING", or any order under customer name
// "TEST ACCOUNT" or "JOHN DOE" (cancelled or not — blanket-excluded
// regardless of outcome; "JOHN DOE" is customer_id 70700's own display
// name, confirmed dev/test — see order 250960, previously the one real
// order left under that account, now excluded like the rest).
const DEV_TEST_CUSTOMER_ID = 70700;
const DEV_TEST_CANCEL_REASONS = new Set(["dev test", "devtest"]);
const DEV_TEST_CUSTOMER_NAMES = new Set(["TEST ACCOUNT", "JOHN DOE"]);
const FOR_TESTING_REASON = "for testing";

function isDevTestOrder(o) {
  const name = (o.customer_name || "").trim().toUpperCase();
  if (DEV_TEST_CUSTOMER_NAMES.has(name)) return true;
  if (o.order_status !== "Cancelled") return false;
  const reason = (o.cancellation_reason || "").trim().toLowerCase();
  if (Number(o.customer_id) === DEV_TEST_CUSTOMER_ID && DEV_TEST_CANCEL_REASONS.has(reason)) return true;
  if (reason === FOR_TESTING_REASON) return true;
  return false;
}

// Cancellation Reasons — 7 categories, built from the free-text
// cancellation_reason field (~30 distinct raw values customers can pick
// from). Keyword-matched against the categories' own descriptions in the
// methodology report rather than an exhaustive enumeration of every raw
// string (that full list wasn't in the report) — see dataQuality caveats
// in the response for this limitation.
function categorizeCancellationReason(reason) {
  const r = (reason || "").toLowerCase().trim();
  if (!r) return "No Reason Logged";
  if (r.includes("expired")) return "System-Initiated (Expired)";
  if (r.includes("change") && r.includes("mind")) return "Changed Mind / No Longer Needed";
  if (r.includes("no longer need") || (r.includes("need") && (r.includes("didn") || r.includes("don")))) {
    return "Changed Mind / No Longer Needed";
  }
  if (r.includes("payment") || r.includes("gcash") || r.includes("insufficient") || r.includes("cod")) return "Payment Issues";
  if (r.includes("website") || r.includes("technical") || r.includes("checkout") || r.includes("login") || r.includes("cart") || r.includes("glitch") || r.includes("site error")) {
    return "Technical / Website Issues";
  }
  if (r.includes("duplicate") || r.includes("add item") || r.includes("promo") || r.includes("modif")) return "Order Modification";
  return "Other / Miscellaneous";
}

// "Customer-initiated" (methodology's own footnote definition): cancelled
// with a stated reason OTHER than an "Expired Order" auto-cancel — as
// opposed to System-Initiated (Expired) and No Reason Logged.
// 2026-09-15 update: the methodology report originally excluded these from
// Real Orders Received (treating them as not-real-demand). That produced
// two different "cancelled" numbers across Executive Overview (27.4%,
// narrower) and Orders & Fulfillment's Cancellation Rate KPI (33.9%,
// broader) for the same period, which read as a bug rather than a
// deliberate methodology split. Per explicit user decision, this
// distinction is now cosmetic only (still used to categorize/label a
// cancellation) — ALL real cancellations, of either kind, count as real
// orders received and count toward Cancelled everywhere. See
// allRealCancelled/realOrdersReceived below.
function isCustomerInitiatedCancellation(category) {
  return category !== "System-Initiated (Expired)" && category !== "No Reason Logged";
}

function normalizeName(name) {
  return (name || "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Payment-type breakdown for a group of orders (Cancellation/Return
// Reasons tables) — count per real payment_type value, sorted most-common
// first, blank/null grouped into "Unknown" rather than silently dropped.
function paymentTypeBreakdown(orders, field = "payment_type") {
  const byType = new Map();
  for (const o of orders) {
    const type = o[field] && String(o[field]).trim() ? String(o[field]).trim() : "Unknown";
    byType.set(type, (byType.get(type) || 0) + 1);
  }
  return Array.from(byType, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
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
function daysBetween(aIso, bIso) {
  return Math.round((new Date(`${bIso}T00:00:00Z`) - new Date(`${aIso}T00:00:00Z`)) / 86400000);
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
  // Full prior calendar week/month/year — NOT "to date" (see the shared
  // preset added to src/hrh-online/dateRange.js): Previous Week is
  // Monday-Sunday of the week before this one; Previous Month is the 1st
  // through the last day of the month before this one; Previous Year is
  // Jan 1 - Dec 31 of last year.
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  }
  if (range === "prevMonth") {
    const lastDayPrevMonth = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(lastDayPrevMonth), to: lastDayPrevMonth };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today }; // wtd (default)
}

// "Compare to" — same Day/Week/Month comparison-window logic as
// api/_hrh-customer-analytics.js's resolveComparisonWindow, duplicated
// here per this codebase's convention (each api/hrh-*.js file keeps its
// own small self-contained date helpers rather than importing them, so
// no file can accidentally change another page's behavior).
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
function resolveComparisonWindow(current, compareTo) {
  const { from, to } = current;
  if (compareTo === "day") return { from: addDaysISO(from, -1), to: addDaysISO(to, -1) };
  if (compareTo === "month") return { from: shiftMonthsClampedISO(from, -1), to: shiftMonthsClampedISO(to, -1) };
  return { from: addDaysISO(from, -7), to: addDaysISO(to, -7) }; // "week" (default)
}
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------------
// Core methodology, shared by Orders & Fulfillment and Executive
// Overview's lifecycle card (imported there) so the two pages can never
// drift onto different definitions for the same date range.
// ---------------------------------------------------------------------
export async function computeHmrphOnlineLifecycle(from, to) {
  // Probable-match candidate pool window — only depends on the function's
  // own from/to (not on any query result), so it's computed up front
  // rather than after directFulfilled/needsProbable like before.
  const extendedFrom = addDaysISO(from, -1);
  const extendedTo = addDaysISO(to, 11);

  // orderRows / directMatchRows / blankOrderInvoiceRows are 3 fully
  // independent queries — directMatchRows only needs the fixed store/
  // channel, blankOrderInvoiceRows only needs from/to (via extendedFrom/
  // extendedTo above), neither depends on orderRows or on each other's
  // results — fired together instead of one round-trip at a time. (The
  // duplicate-check itemRows query further below is NOT included here: it
  // genuinely needs order_ids derived from orderRows' own classification,
  // so it has to wait for that first.)
  const [orderRows, directMatchRows, blankOrderInvoiceRows] = await Promise.all([
    client
      .query({
        query: `
          SELECT
            order_number,
            any(order_status) AS order_status,
            any(payment_status) AS payment_status,
            any(payment_type) AS payment_type,
            any(customer_name) AS customer_name,
            any(customer_id) AS customer_id,
            any(net_total) AS net_total,
            any(created_at) AS order_created_at,
            any(cancellation_reason) AS cancellation_reason,
            any(checkout_method) AS checkout_method,
            any(order_id) AS order_id
          FROM xv3.mart_xv3_order_report
          WHERE store_name = {store:String}
            AND toDate(created_at) BETWEEN {from:String} AND {to:String}
          GROUP BY order_number
        `,
        query_params: { store: HRH_STORE, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // Fulfilled — order_no matched directly in xv3.mart_net_sales, OR a
    // probable match (customer name + date window + fee-adjusted amount
    // gap) for invoices with no order_no populated. order_status is never
    // used for this determination.
    client
      .query({
        query: `
          SELECT DISTINCT order_no
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND sales_channel = {channel:String} AND transaction_type = 'sale'
            AND order_no IS NOT NULL AND order_no != ''
        `,
        query_params: { store: HRH_STORE, channel: HMRPH_CHANNEL },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // Probable-match candidate pool: invoices with no order_no, in an
    // extended window (order date -1 to +11 days) so a valid invoice just
    // outside the selected range can still resolve an order inside it.
    client
      .query({
        query: `
          SELECT
            invoice_no,
            any(transaction_date) AS invoice_transaction_date,
            any(customer_firstname) AS fn,
            any(customer_lastname) AS ln,
            sum(net_sales_amount) AS amount
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND sales_channel = {channel:String} AND transaction_type = 'sale'
            AND (order_no IS NULL OR order_no = '')
            AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY invoice_no
        `,
        query_params: { store: HRH_STORE, channel: HMRPH_CHANNEL, from: extendedFrom, to: extendedTo },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);
  const directMatchedSet = new Set(directMatchRows.map((r) => r.order_no));
  const candidatesByName = new Map();
  for (const inv of blankOrderInvoiceRows) {
    const name = normalizeName(`${inv.fn || ""} ${inv.ln || ""}`);
    if (!candidatesByName.has(name)) candidatesByName.set(name, []);
    candidatesByName.get(name).push({
      invoiceNo: inv.invoice_no,
      date: inv.invoice_transaction_date ? String(inv.invoice_transaction_date).slice(0, 10) : null,
      amount: toNum(inv.amount),
      used: false,
    });
  }

  const rawDedupedCount = orderRows.length;

  const devTestOrders = [];
  const stayingCancelled = []; // System-Initiated (Expired) + No Reason Logged
  const customerInitiatedCancelled = []; // stated non-expiry reason — see 2026-09-15 note above: also counts as real, also inside Real Orders Received
  const nonCancelled = [];

  for (const o of orderRows) {
    o.net_total = toNum(o.net_total);
    o.created_at = o.order_created_at ? String(o.order_created_at).slice(0, 10) : null;
    if (isDevTestOrder(o)) {
      devTestOrders.push(o);
      continue;
    }
    if (o.order_status === "Cancelled") {
      const category = categorizeCancellationReason(o.cancellation_reason);
      o.category = category;
      if (isCustomerInitiatedCancellation(category)) customerInitiatedCancelled.push(o);
      else stayingCancelled.push(o);
    } else {
      nonCancelled.push(o);
    }
  }

  // Orders Received — Duplicate Check: same customer_id + same calendar
  // day + same item ordered more than once (validated via
  // sales_order_item, not assumed from order count alone) — normal
  // multi-item/multi-day shopping by the same customer is NOT collapsed.
  let duplicateRetryOrders = [];
  const orderIds = nonCancelled.map((o) => toNum(o.order_id)).filter((id) => id > 0);
  if (orderIds.length) {
    const itemRows = await (
      await client.query({
        query: `SELECT order_id, groupUniqArray(name) AS items FROM xv3.sales_order_item WHERE order_id IN ({ids:Array(Int64)}) GROUP BY order_id`,
        query_params: { ids: orderIds },
        format: "JSONEachRow",
      })
    ).json();
    const itemsByOrderId = new Map(itemRows.map((r) => [String(r.order_id), r.items || []]));
    const byCustDay = new Map();
    for (const o of nonCancelled) {
      const key = `${o.customer_id}|${o.created_at}`;
      if (!byCustDay.has(key)) byCustDay.set(key, []);
      byCustDay.get(key).push(o);
    }
    const dupSet = new Set();
    for (const group of byCustDay.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const itemsA = itemsByOrderId.get(String(group[i].order_id)) || [];
          const itemsB = itemsByOrderId.get(String(group[j].order_id)) || [];
          if (itemsA.some((x) => itemsB.includes(x))) {
            dupSet.add(group[i].order_number);
            dupSet.add(group[j].order_number);
          }
        }
      }
    }
    duplicateRetryOrders = nonCancelled.filter((o) => dupSet.has(o.order_number));
  }
  const dupSetFinal = new Set(duplicateRetryOrders.map((o) => o.order_number));
  const realNonCancelled = nonCancelled.filter((o) => !dupSetFinal.has(o.order_number));

  // 2026-09-15, reverted same day: briefly included customerInitiatedCancelled
  // here too, then reverted per explicit user decision after cross-checking
  // against Sales Analytics' cms.mart_cms_order_report_detailed-based
  // "Cancellation Rate" (see api/hrh-sales-analytics.js's own 2026-09-15
  // note) — that table's "True Cancellation" count (customer never
  // reordered the same item) landed on the SAME number as this table's
  // stayingCancelled for the same period, which the user took as
  // confirmation that stayingCancelled is the right "real" cancellation
  // figure and customerInitiatedCancelled is closer to "cancelled, but
  // then reordered" — excluded from Real Orders Received again.
  const realOrdersReceived = realNonCancelled.length + stayingCancelled.length;

  // Same population as realOrdersReceived, just split by checkout_method
  // (present on every orderRows row, see the `any(checkout_method)` above)
  // -- added so a caller like Pickup & Delivery can show a real, method-
  // scoped Orders Received instead of silently reusing the combined total
  // for every method filter (verified bug: switching the page's Pickup/
  // Delivery pill left this number unchanged).
  const realOrdersReceivedByMethod = {};
  for (const o of [...realNonCancelled, ...stayingCancelled]) {
    const m = o.checkout_method || "Unknown";
    realOrdersReceivedByMethod[m] = (realOrdersReceivedByMethod[m] || 0) + 1;
  }

  // directMatchedSet/candidatesByName already computed above from the
  // parallel-fetched directMatchRows/blankOrderInvoiceRows.
  const directFulfilled = [];
  const needsProbable = [];
  for (const o of realNonCancelled) {
    if (directMatchedSet.has(o.order_number)) directFulfilled.push(o);
    else needsProbable.push(o);
  }

  const probableFulfilled = [];
  const noInvoiceUnresolved = [];
  const ambiguousUnresolved = [];
  for (const o of needsProbable) {
    const name = normalizeName(o.customer_name);
    const pool = candidatesByName.get(name) || [];
    const qualifying = pool.filter((c) => {
      if (c.used || !c.date) return false;
      const dayDiff = daysBetween(o.created_at, c.date);
      return dayDiff >= -1 && dayDiff <= 10 && c.amount <= o.net_total && o.net_total - c.amount <= 500;
    });
    if (qualifying.length === 1) {
      qualifying[0].used = true;
      probableFulfilled.push({ ...o, probableInvoice: qualifying[0].invoiceNo });
    } else if (qualifying.length > 1) {
      // Methodology: ambiguous nearby matches for the same customer are
      // not force-matched.
      ambiguousUnresolved.push(o);
    } else {
      noInvoiceUnresolved.push(o);
    }
  }

  const fulfilled = directFulfilled.length + probableFulfilled.length;
  const stillAwaiting = noInvoiceUnresolved.length + ambiguousUnresolved.length;
  const allRealCancelled = stayingCancelled.length + customerInitiatedCancelled.length;

  return {
    from,
    to,
    rawDedupedCount,
    devTestOrders,
    duplicateRetryOrders,
    customerInitiatedCancelled,
    stayingCancelled,
    allRealCancelled,
    realOrdersReceived,
    realOrdersReceivedByMethod,
    directFulfilled,
    probableFulfilled,
    fulfilled,
    noInvoiceUnresolved,
    ambiguousUnresolved,
    stillAwaiting,
  };
}

// Return Reasons — 10 categories, built from invoice_remarks (free text,
// inconsistent RET/REF prefixes and spelling) — same keyword-matching
// approach as cancellation reasons, against the methodology report's own
// 10-category list.
function categorizeReturnReason(remarks) {
  const r = (remarks || "").toLowerCase().trim();
  if (!r) return "No Reason Logged";
  if (r.includes("cancel")) return "Cancelled by Customer";
  if (r.includes("refuse") || r.includes("consignee") || r.includes("closed") || r.includes("no answer") || r.includes("didn't pick") || r.includes("didnt pick")) {
    return "Refused / Could Not Deliver (Consignee)";
  }
  if (r.includes("not working") || r.includes("defective") || r.includes("deffective") || r.includes("not functional") || r.includes("not properly functional") || r.includes("weak battery") || r.includes("not original")) {
    return "Not Working / Defective";
  }
  if (r.includes("damag") || r.includes("broken")) return "Damaged Items";
  if (r.includes("no actual item") || r.includes("shortage")) return "No Actual Items (Shortage)";
  if (r.includes("wrong size")) return "Wrong Size";
  if (r.includes("wrong item") || r.includes("wrong description") || r.includes("order error") || r.includes("do not fit") || r.includes("doesn't fit") || r.includes("doesnt fit")) {
    return "Wrong Item / Order Error";
  }
  if (r.includes("address")) return "Address Issue";
  return "Other / Miscellaneous";
}

// ---------------------------------------------------------------------
// Returns tab — xv3.mart_net_sales, transaction_type = 'return'. Unlike
// the Fulfillment/Cancellation lifecycle above, mart_net_sales has a real
// sales_channel column that covers TikTok/Shopee too, so Returns respects
// the page's Channel filter properly instead of being fixed to HMRPH
// Online. Independent from the order/cancellation lifecycle (returns are
// post-fulfillment sales reversals, methodology explicitly keeps them out
// of Cancelled).
// ---------------------------------------------------------------------
export async function computeReturnsAnalysis(from, to, channels) {
  // salesRows / returnRows / dailySalesRows are 3 fully independent
  // queries (different transaction_type/grouping over the same date
  // range, nothing depends on another's result) — fired together instead
  // of one round-trip at a time. checkoutRows/replacementCandidates
  // (below) genuinely DO depend on returnRows (order_no/product_name), so
  // they stay in their own later wave.
  const [salesRows, returnRows, dailySalesRows] = await Promise.all([
    client
      .query({
        query: `
          SELECT uniqExact(invoice_id) AS cnt, sum(net_sales_amount) AS amt
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)} AND transaction_type = 'sale'
            AND transaction_date BETWEEN {from:String} AND {to:String}
        `,
        query_params: { store: HRH_STORE, channels, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    client
      .query({
        query: `
          SELECT
            invoice_no, invoice_id, order_no, transaction_date, net_sales_amount,
            invoice_remarks, product_name, customer_firstname, customer_lastname
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)} AND transaction_type = 'return'
            AND transaction_date BETWEEN {from:String} AND {to:String}
          ORDER BY transaction_date
        `,
        query_params: { store: HRH_STORE, channels, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
    // Daily Sales — for the Returns by Period trend below (moved up here
    // from where it used to be fetched, at the very end of this function,
    // since it doesn't depend on anything computed from returnRows either).
    client
      .query({
        query: `
          SELECT transaction_date AS d, uniqExact(invoice_id) AS cnt, sum(net_sales_amount) AS amt
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)} AND transaction_type = 'sale'
            AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY transaction_date
        `,
        query_params: { store: HRH_STORE, channels, from, to },
        format: "JSONEachRow",
      })
      .then((r) => r.json()),
  ]);
  const salesCount = toNum(salesRows[0]?.cnt);
  const salesValue = toNum(salesRows[0]?.amt);

  // Returns by Fulfillment Method / Payment Type — order_no -> checkout_method
  // / payment_type, same linking gap as unresolved orders elsewhere
  // (blank/unmatched order_no shows as "Unknown", not guessed).
  const orderNos = [...new Set(returnRows.map((r) => r.order_no).filter(Boolean))];
  // "Did Returned Items Get Replaced?" — matched to a LATER sale by the
  // same normalized customer name for the exact same product_name, within
  // 30 days of the return (product_name is already on mart_net_sales, no
  // need for a separate item-name join).
  const productNames = [...new Set(returnRows.map((r) => r.product_name).filter(Boolean))];
  const [checkoutRows, replacementCandidates] = await Promise.all([
    orderNos.length
      ? client
          .query({
            query: `SELECT order_number, any(checkout_method) AS checkout_method, any(payment_type) AS payment_type FROM xv3.mart_xv3_order_report WHERE order_number IN ({ids:Array(String)}) GROUP BY order_number`,
            query_params: { ids: orderNos },
            format: "JSONEachRow",
          })
          .then((r) => r.json())
      : Promise.resolve([]),
    productNames.length
      ? client
          .query({
            query: `
              SELECT transaction_date, product_name, customer_firstname, customer_lastname
              FROM xv3.mart_net_sales
              WHERE store_name = {store:String} AND sales_channel IN {channels:Array(String)} AND transaction_type = 'sale'
                AND product_name IN ({names:Array(String)})
                AND transaction_date BETWEEN {from:String} AND {toExt:String}
            `,
            query_params: { store: HRH_STORE, channels, names: productNames, from, toExt: addDaysISO(to, 30) },
            format: "JSONEachRow",
          })
          .then((r) => r.json())
      : Promise.resolve([]),
  ]);
  const checkoutByOrderNo = new Map(checkoutRows.map((r) => [r.order_number, r.checkout_method]));
  const paymentTypeByOrderNo = new Map(checkoutRows.map((r) => [r.order_number, r.payment_type]));
  const candidatesByNameProduct = new Map();
  for (const c of replacementCandidates) {
    const key = `${normalizeName(`${c.customer_firstname || ""} ${c.customer_lastname || ""}`)}|${c.product_name}`;
    if (!candidatesByNameProduct.has(key)) candidatesByNameProduct.set(key, []);
    candidatesByNameProduct.get(key).push(String(c.transaction_date).slice(0, 10));
  }

  const CATEGORY_ORDER = [
    "Cancelled by Customer",
    "Refused / Could Not Deliver (Consignee)",
    "Not Working / Defective",
    "Damaged Items",
    "No Actual Items (Shortage)",
    "Wrong Item / Order Error",
    "Wrong Size",
    "Address Issue",
    "No Reason Logged",
    "Other / Miscellaneous",
  ];
  const byCategory = new Map(CATEGORY_ORDER.map((c) => [c, { count: 0, value: 0, orders: [] }]));
  const byMethod = new Map();
  let replacedCount = 0;

  const returnOrders = returnRows.map((r) => {
    const amount = Math.abs(toNum(r.net_sales_amount));
    const category = categorizeReturnReason(r.invoice_remarks);
    const method = checkoutByOrderNo.get(r.order_no) || "Unknown";
    const paymentType = paymentTypeByOrderNo.get(r.order_no) || "Unknown";
    const returnDate = String(r.transaction_date).slice(0, 10);
    const key = `${normalizeName(`${r.customer_firstname || ""} ${r.customer_lastname || ""}`)}|${r.product_name}`;
    const laterSaleDates = candidatesByNameProduct.get(key) || [];
    const replaced = laterSaleDates.some((d) => {
      const diff = daysBetween(returnDate, d);
      return diff > 0 && diff <= 30;
    });
    if (replaced) replacedCount += 1;

    const catBucket = byCategory.get(category) || byCategory.get("Other / Miscellaneous");
    catBucket.count += 1;
    catBucket.value += amount;
    catBucket.orders.push({ payment_type: paymentType });
    const methodBucket = byMethod.get(method) || { count: 0, value: 0 };
    methodBucket.count += 1;
    methodBucket.value += amount;
    byMethod.set(method, methodBucket);

    return {
      invoiceNo: r.invoice_no,
      paymentType,
      customer: `${r.customer_firstname || ""} ${r.customer_lastname || ""}`.trim(),
      productName: r.product_name,
      returnDate,
      amount,
      checkoutMethod: method,
      category,
      remarks: r.invoice_remarks,
      replaced,
    };
  });

  const returnsCount = returnRows.length;
  const returnsValue = returnOrders.reduce((s, o) => s + o.amount, 0);

  // dailySalesRows already fetched above (same parallel wave as salesRows/returnRows).
  const dailySales = new Map(dailySalesRows.map((r) => [String(r.d).slice(0, 10), { count: toNum(r.cnt), value: toNum(r.amt) }]));

  const dailyMap = new Map();
  for (const r of returnRows) {
    const d = String(r.transaction_date).slice(0, 10);
    if (!dailyMap.has(d)) dailyMap.set(d, { count: 0, value: 0 });
    const bucket = dailyMap.get(d);
    bucket.count += 1;
    bucket.value += Math.abs(toNum(r.net_sales_amount));
  }
  const allDates = new Set([...dailyMap.keys(), ...dailySales.keys()]);
  const trend = Array.from(allDates, (date) => ({
    date,
    salesCount: dailySales.get(date)?.count || 0,
    salesValue: dailySales.get(date)?.value || 0,
    returns: dailyMap.get(date)?.count || 0,
    returnsValue: dailyMap.get(date)?.value || 0,
  })).sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    kpis: {
      totalSalesInvoiced: { value: salesCount, sub: formatPesoPlain(salesValue) },
      totalReturns: { value: returnsCount, sub: formatPesoPlain(returnsValue) },
      returnRateByCount: { value: safeDivide(returnsCount, salesCount) * 100 },
      returnRateByValue: { value: safeDivide(returnsValue, salesValue) * 100 },
    },
    trend,
    byFulfillmentMethod: Array.from(byMethod, ([method, v]) => ({ method, count: v.count, value: v.value, sharePct: safeDivide(v.count, returnsCount) * 100 })).sort(
      (a, b) => b.count - a.count
    ),
    reasons: CATEGORY_ORDER.map((c) => ({
      category: c,
      count: byCategory.get(c).count,
      value: byCategory.get(c).value,
      paymentTypes: paymentTypeBreakdown(byCategory.get(c).orders),
    })),
    orders: returnOrders,
    replacement: {
      totalReturns: returnsCount,
      replacedCount,
      replacedSharePct: safeDivide(replacedCount, returnsCount) * 100,
    },
  };
}
function formatPesoPlain(n) {
  return `₱${toNum(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function handleOrdersFulfillment(req, res) {
  try {
    const channel = req.query.channel || "All Channels";
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const compareTo = ["day", "week", "month"].includes(req.query.compareTo) ? req.query.compareTo : "week";

    let range_;
    try {
      range_ = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const comparison = resolveComparisonWindow(range_, compareTo);

    // CHANNEL SCOPE: the Fulfillment/Cancellation methodology (order_report
    // + net_sales order_no linkage) is verified only for HMRPH Online.
    // TikTok/Shopee orders don't flow through xv3.mart_xv3_order_report at
    // all (no equivalent source validated), so those two tabs report that
    // limitation rather than fabricating a lifecycle. Returns is NOT
    // limited this way — mart_net_sales has a real sales_channel column —
    // so it's computed for whatever channel scope is selected regardless.
    const fulfillmentUnsupported = channel === "TikTok" || channel === "Shopee";

    // Every scorecard on this page now compares against a previous period
    // (same "Compare to" Day/Week/Month control as Customer Analytics/
    // Executive Overview) — computeHmrphOnlineLifecycle/computeReturnsAnalysis
    // are plain (from, to) functions already, so the previous period is
    // just a second call with a shifted window, run in the same Promise.all
    // rather than a second round-trip.
    const [m, returns, mPrev, returnsPrev] = await Promise.all([
      fulfillmentUnsupported ? Promise.resolve(null) : computeHmrphOnlineLifecycle(range_.from, range_.to),
      computeReturnsAnalysis(range_.from, range_.to, channels),
      fulfillmentUnsupported ? Promise.resolve(null) : computeHmrphOnlineLifecycle(comparison.from, comparison.to),
      computeReturnsAnalysis(comparison.from, comparison.to, channels),
    ]);

    // Returns' KPIs get their previous/delta merged in here so both the
    // early "unsupported channel" return below and the normal response
    // further down share the exact same shape.
    const returnsWithComparison = {
      ...returns,
      kpis: {
        totalSalesInvoiced: {
          ...returns.kpis.totalSalesInvoiced,
          previous: returnsPrev.kpis.totalSalesInvoiced.value,
          delta: pctDelta(returns.kpis.totalSalesInvoiced.value, returnsPrev.kpis.totalSalesInvoiced.value),
        },
        totalReturns: {
          ...returns.kpis.totalReturns,
          previous: returnsPrev.kpis.totalReturns.value,
          delta: pctDelta(returns.kpis.totalReturns.value, returnsPrev.kpis.totalReturns.value),
        },
        returnRateByCount: {
          ...returns.kpis.returnRateByCount,
          previous: returnsPrev.kpis.returnRateByCount.value,
          delta: pctDelta(returns.kpis.returnRateByCount.value, returnsPrev.kpis.returnRateByCount.value),
        },
        returnRateByValue: {
          ...returns.kpis.returnRateByValue,
          previous: returnsPrev.kpis.returnRateByValue.value,
          delta: pctDelta(returns.kpis.returnRateByValue.value, returnsPrev.kpis.returnRateByValue.value),
        },
      },
    };

    if (fulfillmentUnsupported) {
      res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
      return res.status(200).json({
        meta: {
          channel,
          range,
          current: { from: range_.from, to: range_.to },
          previous: { from: comparison.from, to: comparison.to },
          compareTo,
          unsupportedChannel: true,
          limitationNote:
            "This methodology (order-to-invoice fulfillment matching) is validated for HMRPH Online only — TikTok and Shopee orders don't flow through the same order/cancellation source table, so no equivalent lifecycle can be computed for them here without separate validation. Returns below still reflects this channel.",
          generatedAt: new Date().toISOString(),
        },
        kpis: null,
        lifecycle: null,
        fulfillmentTrend: [],
        cancellations: null,
        cancellationByPeriodDaily: [],
        unresolvedOrders: [],
        returns: returnsWithComparison,
        dataQuality: [],
      });
    }

    const completionRate = safeDivide(m.fulfilled, m.realOrdersReceived) * 100;
    const prevCompletionRate = safeDivide(mPrev.fulfilled, mPrev.realOrdersReceived) * 100;

    // Fulfillment Status Breakdown — reconciles exactly to Real Orders
    // Received (Fulfilled + Cancelled + Still Awaiting). "Cancelled" here
    // is stayingCancelled only (System-Initiated Expired + No Reason
    // Logged) — reverted 2026-09-15 (see realOrdersReceived's own note in
    // computeHmrphOnlineLifecycle above) after cross-checking against Sales
    // Analytics' independently-sourced "True Cancellation" count, which
    // landed on this same narrower number for the same period. Matches
    // Executive Overview's Order Lifecycle donut and the Cancellation Rate
    // KPI below — all three always agree. The 4 customer-initiated/
    // "Re-ordered" cancellations excluded from this figure are still shown
    // in the Cancelled Orders KPI's own breakdown (see cancelledOrders
    // below), not silently dropped.
    const lifecycle = [
      { label: "Fulfilled", value: m.fulfilled },
      { label: "Cancelled", value: m.stayingCancelled.length },
      { label: "Still Awaiting Fulfillment / No Invoice", value: m.stillAwaiting },
    ];

    // Cancellation Reasons / Cancelled Orders by Fulfillment Method — 2026-09-15,
    // reverted to stayingCancelled ("True Cancellation") ONLY, per explicit
    // user request — same 17-total population as everywhere else on this
    // page, not the broader 21 (which also includes the 4 re-ordered/
    // customer-initiated ones). Consequence, disclosed rather than hidden:
    // customerInitiatedCancelled is BY DEFINITION every category other than
    // "System-Initiated (Expired)"/"No Reason Logged" (see
    // isCustomerInitiatedCancellation above), so the other 5 of the 7
    // reason categories (Payment Issues, Technical/Website, Changed Mind,
    // Order Modification, Other/Misc) will always show 0 here now — those
    // reasons only ever occur among the excluded 4.
    const allRealCancelledOrders = m.stayingCancelled;

    // Cancelled Orders by Period — daily Raw Orders Placed / Real Cancelled
    // (count + value), for the frontend to bucket by day/week/month based
    // on the selected range's length. Raw Orders Placed reuses the exact
    // same canonical deduped order population computeHmrphOnlineLifecycle
    // already classified above (every order falls into exactly one of
    // these sub-arrays — verified: their combined length always equals
    // rawDedupedCount) rather than re-querying or reclassifying anything.
    const allRawOrders = [
      ...m.devTestOrders,
      ...m.stayingCancelled,
      ...m.customerInitiatedCancelled,
      ...m.duplicateRetryOrders,
      ...m.directFulfilled,
      ...m.probableFulfilled,
      ...m.noInvoiceUnresolved,
      ...m.ambiguousUnresolved,
    ];
    const rawByDate = new Map();
    for (const o of allRawOrders) {
      rawByDate.set(o.created_at, (rawByDate.get(o.created_at) || 0) + 1);
    }
    // Cancelled here is stayingCancelled ("True Cancellation") only, same
    // narrower figure as Cancelled Orders/Fulfillment Status Breakdown/
    // Cancellation Rate elsewhere on this page — NOT allRealCancelledOrders
    // (which also includes the 4 re-ordered/customer-initiated ones). This
    // daily/weekly/monthly trend must reconcile to the same total the rest
    // of the page shows, not a broader one.
    const cancelledByDate = new Map();
    for (const o of m.stayingCancelled) {
      const bucket = cancelledByDate.get(o.created_at) || { count: 0, value: 0 };
      bucket.count += 1;
      bucket.value += o.net_total;
      cancelledByDate.set(o.created_at, bucket);
    }
    const allCancelDates = new Set([...rawByDate.keys(), ...cancelledByDate.keys()]);
    const cancellationByPeriodDaily = Array.from(allCancelDates, (date) => ({
      date,
      rawOrdersPlaced: rawByDate.get(date) || 0,
      cancelledCount: cancelledByDate.get(date)?.count || 0,
      cancelledValue: cancelledByDate.get(date)?.value || 0,
    })).sort((a, b) => (a.date < b.date ? -1 : 1));

    const CATEGORY_ORDER = [
      "System-Initiated (Expired)",
      "Payment Issues",
      "Technical / Website Issues",
      "Changed Mind / No Longer Needed",
      "Order Modification",
      "No Reason Logged",
      "Other / Miscellaneous",
    ];
    const byCategory = new Map(CATEGORY_ORDER.map((c) => [c, { count: 0, value: 0, orders: [] }]));
    for (const o of allRealCancelledOrders) {
      const bucket = byCategory.get(o.category) || byCategory.get("Other / Miscellaneous");
      bucket.count += 1;
      bucket.value += o.net_total;
      bucket.orders.push(o);
    }
    // Cancelled Orders by Fulfillment Method — Pickup vs Delivery share of
    // the same ALL-real-cancellations population as the reasons breakdown
    // above (methodology's own "Cancelled Orders by Fulfillment Method"
    // table), from checkout_method on the order itself.
    const byCheckoutMethod = new Map();
    for (const o of allRealCancelledOrders) {
      const method = o.checkout_method || "Unknown";
      const bucket = byCheckoutMethod.get(method) || { count: 0, value: 0 };
      bucket.count += 1;
      bucket.value += o.net_total;
      byCheckoutMethod.set(method, bucket);
    }
    const cancelledByFulfillmentMethod = Array.from(byCheckoutMethod, ([method, v]) => ({
      method,
      count: v.count,
      value: v.value,
      sharePct: safeDivide(v.count, allRealCancelledOrders.length) * 100,
    })).sort((a, b) => b.count - a.count);

    // Which item(s) were on each cancelled order — computeHmrphOnlineLifecycle's
    // own orderRows query is order-level only (GROUP BY order_number), so
    // item names aren't available there; joined here via xv3.sales_order_item
    // (order_id -> item name(s)), same table/pattern already used above for
    // the duplicate-retry check.
    const cancelledOrderIds = allRealCancelledOrders.map((o) => toNum(o.order_id)).filter((id) => id > 0);
    let cancelledItemsByOrderId = new Map();
    if (cancelledOrderIds.length) {
      const cancelledItemRows = await (
        await client.query({
          query: `SELECT order_id, groupUniqArray(name) AS items FROM xv3.sales_order_item WHERE order_id IN ({ids:Array(Int64)}) GROUP BY order_id`,
          query_params: { ids: cancelledOrderIds },
          format: "JSONEachRow",
        })
      ).json();
      cancelledItemsByOrderId = new Map(cancelledItemRows.map((r) => [toNum(r.order_id), r.items || []]));
    }

    // Order-level detail for the Cancellation Reasons drilldown (click a
    // category row, see its orders) — same fields already computed above,
    // no new calculation.
    const cancellationsOrders = allRealCancelledOrders.map((o) => ({
      orderNumber: o.order_number,
      customer: o.customer_name,
      orderDate: o.created_at,
      amount: o.net_total,
      checkoutMethod: o.checkout_method || "Unknown",
      paymentType: o.payment_type || "Unknown",
      items: cancelledItemsByOrderId.get(toNum(o.order_id)) || [],
      category: o.category,
      cancellationReason: o.cancellation_reason,
    }));

    const cancellations = {
      total: allRealCancelledOrders.length,
      reasons: CATEGORY_ORDER.map((c) => ({
        category: c,
        count: byCategory.get(c).count,
        value: byCategory.get(c).value,
        paymentTypes: paymentTypeBreakdown(byCategory.get(c).orders),
      })),
      byFulfillmentMethod: cancelledByFulfillmentMethod,
      orders: cancellationsOrders,
    };

    // Raw Cancelled / Dev-test-Cancelled — for the Cancelled Orders
    // breakdown modal (Raw − Dev/test = Real, same shape as Real Orders
    // Received's own breakdown). devTestOrders can include non-cancelled
    // TEST ACCOUNT orders too, so this filters to just the cancelled ones.
    const devTestCancelledCount = m.devTestOrders.filter((o) => o.order_status === "Cancelled").length;
    // Deliberately NOT allRealCancelledOrders.length (now 17, True
    // Cancellation only) — this feeds the Cancelled Orders modal's own
    // "Raw Cancelled (all, incl. dev/test)" → "Real Cancelled — All Types"
    // (21) → "Re-ordered" → "True Cancellation" (17) chain, which needs the
    // broader 21 as its own intermediate step, not the already-narrowed 17.
    const rawCancelledCount = m.allRealCancelled + devTestCancelledCount;
    // Reverted 2026-09-15 (see realOrdersReceived's note above) — rate is
    // stayingCancelled ("True Cancellation" equivalent) over realOrdersReceived,
    // matching the Fulfillment Status Breakdown and Executive Overview.
    const cancellationRate = safeDivide(m.stayingCancelled.length, m.realOrdersReceived) * 100;
    const prevCancellationRate = safeDivide(mPrev.stayingCancelled.length, mPrev.realOrdersReceived) * 100;

    // System-Initiated Share / No Reason Logged — reuses byCategory (built
    // above from the same allRealCancelledOrders/stayingCancelled
    // population as everywhere else on this page) rather than re-deriving
    // the frontend used to compute this client-side from
    // cancellations.reasons; moved server-side so it can carry a real
    // previous-period comparison the same way every other scorecard here
    // does. Previous period re-categorizes mPrev.stayingCancelled the same
    // way (each order already carries its own .category from
    // computeHmrphOnlineLifecycle's classification loop).
    const curSystemInitiatedShare = safeDivide(byCategory.get("System-Initiated (Expired)").count, allRealCancelledOrders.length) * 100;
    const curCancelNoReasonCount = byCategory.get("No Reason Logged").count;
    const prevSystemInitiatedCount = mPrev.stayingCancelled.filter((o) => o.category === "System-Initiated (Expired)").length;
    const prevCancelNoReasonCount = mPrev.stayingCancelled.filter((o) => o.category === "No Reason Logged").length;
    const prevSystemInitiatedShare = safeDivide(prevSystemInitiatedCount, mPrev.stayingCancelled.length) * 100;

    // Still Awaiting Fulfillment, split by payment_status — same shape as
    // the methodology's "Paid, no invoice" / "Pending (COD), no invoice"
    // breakdown, from orders already classified as unresolved above.
    const allUnresolved = [...m.noInvoiceUnresolved, ...m.ambiguousUnresolved];
    const sumAmount = (arr) => arr.reduce((s, o) => s + o.net_total, 0);
    const paidUnresolved = allUnresolved.filter((o) => o.payment_status === "Paid");
    const pendingUnresolved = allUnresolved.filter((o) => o.payment_status !== "Paid");

    // Fulfillment Trend — daily Real Received / Fulfilled / Cancelled,
    // reusing the same orders already fetched above (no extra query).
    const allRealOrders = [
      ...m.directFulfilled.map((o) => ({ ...o, bucket: "fulfilled" })),
      ...m.probableFulfilled.map((o) => ({ ...o, bucket: "fulfilled" })),
      ...m.noInvoiceUnresolved.map((o) => ({ ...o, bucket: "awaiting" })),
      ...m.ambiguousUnresolved.map((o) => ({ ...o, bucket: "awaiting" })),
      ...m.stayingCancelled.map((o) => ({ ...o, bucket: "cancelled" })),
    ];
    const byDate = new Map();
    for (const o of allRealOrders) {
      const d = o.created_at;
      if (!byDate.has(d)) byDate.set(d, { date: d, received: 0, fulfilled: 0, cancelled: 0, awaiting: 0 });
      const row = byDate.get(d);
      row.received += 1;
      row[o.bucket] += 1;
    }
    const fulfillmentTrend = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

    // Unresolved Orders — post-reconciliation only (both direct AND
    // probable matching failed); ambiguous multi-candidate cases are
    // flagged as such rather than silently force-matched.
    //
    // payment_status = Pending means COD — these orders are expected to
    // sit with no invoice yet because HRH Online confirms COD orders by
    // phone before handing them to the courier (business-confirmed, not
    // a data gap), so they're labeled distinctly from a genuinely stuck
    // order (e.g. Paid with no invoice for a while, like order 250960).
    const unresolvedOrders = [
      ...m.noInvoiceUnresolved.map((o) => ({
        orderNumber: o.order_number,
        orderStatus: o.order_status,
        paymentStatus: o.payment_status,
        customer: o.customer_name,
        orderDate: o.created_at,
        amount: o.net_total,
        probableInvoice: null,
        reason:
          o.payment_status === "Pending"
            ? "COD — awaiting phone confirmation before courier handoff"
            : "No invoice or probable match found",
      })),
      ...m.ambiguousUnresolved.map((o) => ({
        orderNumber: o.order_number,
        orderStatus: o.order_status,
        paymentStatus: o.payment_status,
        customer: o.customer_name,
        orderDate: o.created_at,
        amount: o.net_total,
        probableInvoice: null,
        reason: "Ambiguous — multiple possible invoice matches for this customer, not force-matched",
      })),
    ].sort((a, b) => (a.orderDate < b.orderDate ? -1 : 1));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel: "HMRPH Online",
        range,
        current: { from: range_.from, to: range_.to },
        previous: { from: comparison.from, to: comparison.to },
        compareTo,
        methodologyNote:
          "Fulfillment is determined from invoices in xv3.mart_net_sales (direct order_no match, or a probable match by customer name + date + fee-adjusted amount), never from order_status — see dataQuality for known matching caveats.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        realOrdersReceived: {
          value: m.realOrdersReceived,
          previous: mPrev.realOrdersReceived,
          delta: pctDelta(m.realOrdersReceived, mPrev.realOrdersReceived),
          sub: `${m.rawDedupedCount} raw deduped`,
          raw: m.rawDedupedCount,
          devTestExcluded: m.devTestOrders.length,
          customerInitiatedExcluded: m.customerInitiatedCancelled.length,
          duplicateRetriesExcluded: m.duplicateRetryOrders.length,
        },
        fulfilledOrders: { value: m.fulfilled, previous: mPrev.fulfilled, delta: pctDelta(m.fulfilled, mPrev.fulfilled) },
        completionRate: { value: completionRate, previous: prevCompletionRate, delta: pctDelta(completionRate, prevCompletionRate) },
        cancelledOrders: {
          // "Cancelled" (the headline figure and rate) is stayingCancelled
          // only — see cancellationRate's note above. allRealCancelled (both
          // types combined) and reordered (customerInitiatedCancelled alone)
          // are exposed here too so the breakdown modal can show the full
          // "21 total, 4 re-ordered, 17 True Cancellation" picture rather
          // than silently hiding the excluded 4.
          value: m.stayingCancelled.length,
          previous: mPrev.stayingCancelled.length,
          delta: pctDelta(m.stayingCancelled.length, mPrev.stayingCancelled.length),
          allRealCancelled: m.allRealCancelled,
          reordered: m.customerInitiatedCancelled.length,
          raw: rawCancelledCount,
          devTestExcluded: devTestCancelledCount,
          cancellationRate,
        },
        // Own top-level entry (rather than only nested in cancelledOrders)
        // so the Cancellation tab's "Cancellation Rate" scorecard gets its
        // own previous/delta, same as every other card on this page.
        cancellationRate: { value: cancellationRate, previous: prevCancellationRate, delta: pctDelta(cancellationRate, prevCancellationRate) },
        stillAwaitingFulfillment: {
          value: m.stillAwaiting,
          previous: mPrev.stillAwaiting,
          delta: pctDelta(m.stillAwaiting, mPrev.stillAwaiting),
          paid: { count: paidUnresolved.length, value: sumAmount(paidUnresolved) },
          pending: { count: pendingUnresolved.length, value: sumAmount(pendingUnresolved) },
        },
        // Moved server-side (previously computed client-side from
        // cancellations.reasons) so both can carry a real previous-period
        // comparison like every other scorecard here.
        systemInitiatedShare: {
          value: curSystemInitiatedShare,
          previous: prevSystemInitiatedShare,
          delta: pctDelta(curSystemInitiatedShare, prevSystemInitiatedShare),
        },
        cancelNoReasonCount: {
          value: curCancelNoReasonCount,
          previous: prevCancelNoReasonCount,
          delta: pctDelta(curCancelNoReasonCount, prevCancelNoReasonCount),
        },
      },
      lifecycle,
      fulfillmentTrend,
      cancellations,
      cancellationByPeriodDaily,
      unresolvedOrders,
      returns: returnsWithComparison,
      dataQuality: [
        `Real Orders Received (${m.realOrdersReceived}) = ${m.rawDedupedCount} raw deduped orders − ${m.devTestOrders.length} dev/test-tagged − ${m.customerInitiatedCancelled.length} confirmed customer-initiated cancellations − ${m.duplicateRetryOrders.length} genuine duplicate retries.`,
        `"Cancelled" (${m.stayingCancelled.length}) is System-Initiated (Expired) + No Reason Logged only — used consistently for the "Cancelled Orders" KPI, the Fulfillment Status Breakdown, the Cancellation Rate, Cancellation Reasons, Cancelled Orders by Fulfillment Method, and Executive Overview's Order Lifecycle donut, so all of these always reconcile to the same number. The ${m.customerInitiatedCancelled.length} confirmed customer-initiated cancellations (stated reason, e.g. changed mind, payment issue — cross-checked against Sales Analytics' independent "Re-ordered" classification, which landed on the same count for the same period) are excluded from all of these and from Real Orders Received, same as dev/test orders and duplicate retries — shown separately in the Cancelled Orders KPI's own breakdown (allRealCancelled/reordered) rather than silently dropped. Consequence: 5 of Cancellation Reasons' 7 categories (everything except System-Initiated (Expired) and No Reason Logged) will always show 0 — those reasons only ever occur among the excluded 4.`,
        "Some invoices have no order_no populated — resolved via probable matching (customer name + date + fee-adjusted amount); a small number remain genuinely unmatched or ambiguous (see Unresolved Orders).",
        "Unresolved COD (payment_status = Pending) orders are expected to have no invoice yet — HRH Online confirms COD orders by phone before handing them to the courier, so these aren't a data gap the way an unresolved Paid order is.",
        "Name-based matching is unreliable for customers with many orders/invoices in a short window — ambiguous cases are left unresolved rather than force-matched.",
        "Cancellation reason categorization is keyword-based against the methodology's 7-category descriptions, not an exhaustive enumeration of every raw dropdown value.",
        "This is a live warehouse — counts can shift slightly between queries as new transactions land.",
      ],
    });
  } catch (err) {
    console.error("HRH Orders & Fulfillment API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Orders & Fulfillment data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
