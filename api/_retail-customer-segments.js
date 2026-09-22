import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

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
  "HMR CUBAO",
];
const WHOLESALE_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];
const HRH_ONLINE_STORE = "HRH ONLINE";
const SEGMENTS = {
  all: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE, ...WHOLESALE_STORES],
  retail: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE],
  wholesale: WHOLESALE_STORES,
};

// See api/_retail-sales-overview.js's own comment for the full writeup —
// "SUCAT, PARANAQUE"/"HARRINGTON PIONEER" are confirmed earlier names for
// HMR SUCAT/PIONEER, still present historically in mart_invoice_items.
const STORE_ALIASES = { "HMR SUCAT": ["SUCAT, PARANAQUE"], PIONEER: ["HARRINGTON PIONEER"] };
function expandStoreAliases(stores) {
  return stores.flatMap((s) => [s, ...(STORE_ALIASES[s] || [])]);
}
const STORE_NAME_EXPR = "multiIf(store_name = 'SUCAT, PARANAQUE', 'HMR SUCAT', store_name = 'HARRINGTON PIONEER', 'PIONEER', store_name)";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
// Dashboard-wide Date Range filter, current window only (this page's own
// weekly 3R trend below is a separate, fixed trailing computation,
// unaffected by this) — see api/_retail-sales-overview.js's resolveRange
// for the full comment on each preset.
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    return { from: fromParam <= toParam ? fromParam : toParam, to: fromParam <= toParam ? toParam : fromParam };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  }
  if (range === "prevMonth") {
    const to = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(to), to };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today };
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}
function resolveStores(segmentStores, storeParam) {
  if (storeParam && segmentStores.includes(storeParam)) return [storeParam];
  return segmentStores;
}

// New/Retained/Reactivated — same cohort methodology as
// src/hrh-online/ExecutiveOverview's own 3R analysis (api/_hrh-executive-
// overview.js), just scoped to this segment's store list instead of
// HMRPH ONLINE only, and driven by store_name IN (...) with no channel
// restriction (retail's own customer_name identity isn't channel-scoped
// the way HRH Online's is). Classification is evaluated as of the
// window's last calendar month, same "end-of-range snapshot" convention.
async function classifyCustomerSegments(stores, from, to) {
  const rows = await client
    .query({
      query: `
        WITH canonical AS (
          SELECT DISTINCT invoice_id, customer_name
          FROM xv3.mart_invoice_items
          WHERE store_name IN {stores:Array(String)}
            AND transaction_date BETWEEN {from:String} AND {to:String}
            AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
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
              AND customer_name IN (SELECT DISTINCT customer_name FROM canonical)
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
              AND m.customer_name IN (SELECT DISTINCT customer_name FROM canonical)
          )
          GROUP BY customer_name, toStartOfMonth(transaction_date)
        )
        SELECT
          cc.invoice_id AS invoice_id,
          cc.customer_name AS customer_name,
          multiIf(
            cc.customer_name IS NULL OR trim(cc.customer_name) = '' OR cc.customer_name IN ('n/a', 'WALK IN') OR NOT match(cc.customer_name, '[a-zA-Z]'), 'Unregistered',
            toStartOfMonth(cms.first_order_date) = cms.purchase_month, 'New',
            cms.first_previous_date IS NOT NULL AND dateDiff('month', cms.first_previous_date, cms.first_transaction_in_month) <= 2, 'Retained',
            cms.first_previous_date IS NOT NULL AND dateDiff('month', cms.first_previous_date, cms.first_transaction_in_month) > 2, 'Reactivated',
            'Unknown'
          ) AS segment
        FROM canonical cc
        LEFT JOIN customer_month_segment cms
          ON cc.customer_name = cms.customer_name
          AND cms.purchase_month = toStartOfMonth(toDate({to:String}))
      `,
      query_params: { stores, from, to },
      format: "JSONEachRow",
    })
    .then((r) => r.json());
  return rows;
}

export async function handleRetailCustomerSegments(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const range = req.query.range || "wtd";
    let current;
    try {
      current = resolveRange(range, req.query.from, req.query.to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const stores = expandStoreAliases(resolveStores(resolveSegment(segment), req.query.store));
    const today = manilaTodayISODate();

    // classification (current window) + revenue-by-invoice (current
    // window, all invoices incl. unregistered/no-name) + per-store
    // classification (current window) + 4-week trend classification are
    // 4 independent-ish pulls; the classification itself is one query,
    // reused for both the network-wide and per-store breakdowns below.
    const [classification, revenueRows, weeklyClassifications, topCustomerRows] = await Promise.all([
      classifyCustomerSegments(stores, current.from, current.to),
      client
        .query({
          query: `SELECT invoice_id, ${STORE_NAME_EXPR} AS store_name, sum(invoice_item_sold_amount) AS amount FROM xv3.mart_invoice_items WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String} AND invoice_item_is_voided = 0 AND invoice_is_voided = 0 GROUP BY invoice_id, ${STORE_NAME_EXPR}`,
          query_params: { stores, from: current.from, to: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // 4-week trend — one classification call per week (last 4 full
      // Mon-Sun weeks), reusing the same function.
      Promise.all(
        [3, 2, 1, 0].map((weeksAgo) => {
          const weekStart = addDaysISO(mondayOfWeek(today), -7 * (weeksAgo + 1));
          const weekEnd = addDaysISO(weekStart, 6);
          return classifyCustomerSegments(stores, weekStart, weekEnd).then((rows) => ({ weekStart, weekEnd, rows }));
        })
      ),
      // Top 10 customers by spend, current window — real name/spend/store,
      // "New/Returning" from customer_recency (not the full 3R label,
      // kept simple for this one summary table).
      client
        .query({
          query: `
            SELECT customer_name, any(customer_recency) AS recency, sum(invoice_item_sold_amount) AS spend, argMax(${STORE_NAME_EXPR}, invoice_item_sold_amount) AS top_store
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
              AND customer_name IS NOT NULL AND trim(customer_name) != '' AND customer_name NOT IN ('n/a', 'WALK IN') AND match(customer_name, '[a-zA-Z]')
            GROUP BY customer_name
            ORDER BY spend DESC
            LIMIT 10
          `,
          query_params: { stores, from: current.from, to: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const revenueByInvoice = new Map(revenueRows.map((r) => [r.invoice_id, { amount: toNum(r.amount), store: r.store_name }]));
    const classByInvoice = new Map(classification.map((r) => [r.invoice_id, { segment: r.segment, customerName: r.customer_name }]));

    // "Customers" per segment is a DISTINCT customer_name count, not a
    // transaction/invoice count — one repeat customer with 3 invoices this
    // week is still 1 customer, matching the reference table's own
    // "Customers" column semantics.
    const segTotals = {
      New: { rev: 0, invoices: 0, customerSet: new Set() },
      Retained: { rev: 0, invoices: 0, customerSet: new Set() },
      Reactivated: { rev: 0, invoices: 0, customerSet: new Set() },
      Unregistered: { rev: 0, invoices: 0, customerSet: new Set() },
    };
    const byStore = new Map();
    for (const [invoiceId, info] of revenueByInvoice) {
      const cls = classByInvoice.get(invoiceId);
      const seg = cls?.segment || "Unregistered";
      if (!segTotals[seg]) segTotals[seg] = { rev: 0, invoices: 0, customerSet: new Set() };
      segTotals[seg].rev += info.amount;
      segTotals[seg].invoices += 1;
      if (cls?.customerName) segTotals[seg].customerSet.add(cls.customerName);
      if (!byStore.has(info.store)) byStore.set(info.store, { New: new Set(), Retained: new Set(), Reactivated: new Set(), Unregistered: new Set() });
      const storeBucket = byStore.get(info.store);
      if (!storeBucket[seg]) storeBucket[seg] = new Set();
      storeBucket[seg].add(cls?.customerName || invoiceId);
    }

    const namedTotal = segTotals.New.rev + segTotals.Retained.rev + segTotals.Reactivated.rev;

    // Weekly trend needs REVENUE per segment per week, not just invoice
    // classification — fetch each week's invoice amounts too (reuses the
    // same store scope, small per-week queries).
    const weeklyRevenue = await Promise.all(
      weeklyClassifications.map(async ({ weekStart, weekEnd, rows }) => {
        const amountRows = await client
          .query({
            query: `SELECT invoice_id, sum(invoice_item_sold_amount) AS amount FROM xv3.mart_invoice_items WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String} AND invoice_item_is_voided = 0 AND invoice_is_voided = 0 GROUP BY invoice_id`,
            query_params: { stores, from: weekStart, to: weekEnd },
            format: "JSONEachRow",
          })
          .then((r) => r.json());
        const segMap = new Map(rows.map((r) => [r.invoice_id, r.segment]));
        const totals = { New: 0, Retained: 0, Reactivated: 0 };
        for (const r of amountRows) {
          const seg = segMap.get(r.invoice_id);
          if (totals[seg] !== undefined) totals[seg] += toNum(r.amount);
        }
        return { weekStart, weekEnd, ...totals };
      })
    );

    const storeSegTable = Array.from(byStore, ([store, sets]) => ({ store, New: sets.New.size, Retained: sets.Retained.size, Reactivated: sets.Reactivated.size, Unregistered: sets.Unregistered.size })).sort(
      (a, b) => b.New + b.Retained + b.Reactivated - (a.New + a.Retained + a.Reactivated)
    );

    const topCustomers = topCustomerRows.map((r) => ({
      customer: r.customer_name,
      spend: toNum(r.spend),
      store: r.top_store,
      type: r.recency === "Repeat buyer" ? "Returning" : "New",
    }));

    return res.status(200).json({
      meta: { range, current, segment, store: req.query.store || "", stores },
      segments: {
        New: { revenue: segTotals.New.rev, customers: segTotals.New.customerSet.size, sharePct: safeDivide(segTotals.New.rev, namedTotal) * 100 },
        Retained: { revenue: segTotals.Retained.rev, customers: segTotals.Retained.customerSet.size, sharePct: safeDivide(segTotals.Retained.rev, namedTotal) * 100 },
        Reactivated: { revenue: segTotals.Reactivated.rev, customers: segTotals.Reactivated.customerSet.size, sharePct: safeDivide(segTotals.Reactivated.rev, namedTotal) * 100 },
        Unregistered: { revenue: segTotals.Unregistered.rev, transactions: segTotals.Unregistered.invoices },
      },
      namedTotalRevenue: namedTotal,
      weeklyTrend: weeklyRevenue,
      storeSegTable,
      topCustomers,
      dataQuality: [
        "3R classification (New/Retained/Reactivated) only covers invoices with a real customer name — anonymous/unregistered walk-in transactions have no way to be tagged and are shown separately, not silently dropped. This is why totals here don't match Sales Overview's revenue total.",
        "Same cohort methodology as HRH Online's own Executive Overview (New = first-ever purchase this month; Retained = repeat within 2 months of the prior purchase; Reactivated = repeat after a 2+ month gap), scoped to this segment's stores instead of HMRPH Online only.",
        "Top 10 Customers' New/Returning label uses mart_invoice_items' own customer_recency field (a simpler 2-way split), not the full 3R classification above.",
      ],
    });
  } catch (err) {
    console.error("[retail-customer-segments]", err);
    return res.status(500).json({ error: "Failed to load Retail Customer Segments data", message: err?.message || "" });
  }
}
