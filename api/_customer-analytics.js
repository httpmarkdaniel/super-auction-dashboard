import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Customer Analytics module (src/customer-analytics/) — dispatched from
// api/retail-analytics.js as report=caStores/caOverview/caCustomers/
// caOverlap rather than its own top-level function, since the Hobby plan's
// 12-function cap is already fully used by api/*.js.
//
// Identity is customer_name (same as every other customer view in this
// dashboard — mart_invoice_items has no stable cross-store customer id).
// One row per name: a name that appears with several emails/phones is ONE
// customer here, showing the email/phone from their most recent purchase.
//
// Store scope is EVERY store that ever sold to a named customer, closed
// branches included (Fairview, Novaliches, Market Market, ...), so
// all-time questions like "who shopped at both Fairview and Novaliches"
// work. 'Sucat, Paranaque' (either casing) is merged into HMR SUCAT, same
// as the business's own customer query.
const STORE_EXPR = `if(upper(store_name) IN ('HMR SUCAT', 'SUCAT, PARANAQUE'), 'HMR SUCAT', store_name)`;

// Registered (named) customers only — walk-in / placeholder names can't be
// tracked across visits. Voided invoices/lines excluded throughout.
const NAMED_WHERE = `
  invoice_item_is_voided = 0 AND invoice_is_voided = 0
  AND store_name IS NOT NULL AND store_name != 'HMR DEV RETAIL TEST STORE'
  AND customer_name IS NOT NULL AND trim(customer_name) != ''
  AND match(customer_name, '[a-zA-Z]')
  AND NOT match(lower(customer_name), 'walk[ -]?in')
  AND lower(trim(customer_name)) NOT IN ('n/a', 'na', 'walk', 'none')
`;

// Lifecycle segment, as of today — same definition as the business's own
// Superset customer list: New = first purchase this month; Retained =
// bought this month AND in one of the previous 2 months; Reactivated =
// bought this month but not the previous 2; Inactive = no purchase in 60+
// days; Slipped = everything else (last purchase 1–60 days ago, not this
// month). Expects first_order/last_visit/m0/m1/m2/today in scope.
const SEGMENT_EXPR = `multiIf(
  toStartOfMonth(first_order) = toStartOfMonth(today), 'New',
  m0 > 0 AND (m1 > 0 OR m2 > 0), 'Retained',
  m0 > 0, 'Reactivated',
  dateDiff('day', last_visit, today) > 60, 'Inactive',
  'Slipped'
)`;

export const SEGMENT_KEYS = ["New", "Retained", "Reactivated", "Slipped", "Inactive"];

const SORTS = {
  sales: "lifetime_sales",
  lastVisit: "last_visit",
  daysInactive: "days_inactive",
  visits: "visits",
  name: "customer_name",
  firstOrder: "first_order",
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
// Placeholder contact values ("na", "N/A", "-", "none") read as blank.
function cleanContact(v) {
  const s = String(v || "").trim();
  return /^(n\/?a|none|null|-+|\.+|0+)$/i.test(s) ? "" : s;
}
function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function parseStores(param) {
  if (!param) return [];
  return String(param)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60);
}

async function query(sql, params) {
  const r = await client.query({ query: sql, query_params: params, format: "JSONEachRow" });
  return r.json();
}

// Per-customer, all-time aggregate. `sel` = selected stores ([] = all).
// `scopeSel` = 1 computes every metric from the selected stores' purchases
// only (All Store Visited always lists every store regardless); 0 computes
// them from all stores. `matchAll` = 1 keeps customers who bought at EVERY
// selected store, 0 at ANY of them.
function customerAggSQL() {
  return `
    WITH toDate(now('Asia/Manila')) AS today,
    agg AS (
      SELECT
        customer_name,
        argMax(customer_email, d) AS email,
        argMax(customer_phone, d) AS phone,
        arrayStringConcat(arraySort(groupUniqArray(store)), ', ') AS all_stores,
        uniqExact(store) AS store_count,
        uniqExactIf(store, in_sel) AS sel_store_count,
        minIf(d, s) AS first_order,
        maxIf(d, s) AS last_visit,
        argMaxIf(product_name, d, s) AS last_item,
        topKIf(1)(category_name, s)[1] AS top_category,
        topKIf(1)(store, s)[1] AS top_store,
        topKIf(1)(sales_associate_name, s)[1] AS top_sc,
        toFloat64(sumIf(amt, s)) AS lifetime_sales,
        uniqExactIf(invoice_id, s) AS visits,
        toFloat64(sumIf(amt, s AND d >= toStartOfMonth(today))) AS m0,
        toFloat64(sumIf(amt, s AND toStartOfMonth(d) = toStartOfMonth(addMonths(today, -1)))) AS m1,
        toFloat64(sumIf(amt, s AND toStartOfMonth(d) = toStartOfMonth(addMonths(today, -2)))) AS m2
      FROM (
        SELECT
          customer_name, customer_email, customer_phone,
          toDate(transaction_date) AS d, invoice_id,
          invoice_item_sold_amount AS amt,
          product_name, category_name, sales_associate_name,
          ${STORE_EXPR} AS store,
          (length({sel:Array(String)}) = 0 OR has({sel:Array(String)}, store)) AS in_sel,
          if({scopeSel:UInt8} = 1, in_sel, 1) AS s
        FROM xv3.mart_invoice_items
        WHERE ${NAMED_WHERE}
          -- Pre-filter to customers who ever bought at a selected store,
          -- so a store pick doesn't aggregate the whole customer base.
          AND (length({sel:Array(String)}) = 0 OR customer_name IN (
            SELECT DISTINCT customer_name FROM xv3.mart_invoice_items
            WHERE ${NAMED_WHERE} AND has({sel:Array(String)}, ${STORE_EXPR})
          ))
      )
      GROUP BY customer_name
      HAVING sel_store_count >= if({matchAll:UInt8} = 1, greatest(length({sel:Array(String)}), 1), 1)
    ),
    seg AS (
      SELECT *, ${SEGMENT_EXPR} AS segment, dateDiff('day', last_visit, today) AS days_inactive
      FROM agg
    )
  `;
}

function customerParams(req) {
  const sel = parseStores(req.query.stores);
  return {
    sel,
    scopeSel: req.query.scope === "all" ? 0 : 1,
    matchAll: req.query.match === "all" ? 1 : 0,
  };
}

// Store list for the pickers — every store with named-customer history,
// newest-selling first, with first/last sale so closed branches read as
// closed instead of looking like dead filters.
export async function handleCaStores(req, res) {
  try {
    const rows = await query(
      `
      SELECT ${STORE_EXPR} AS store, uniqExact(customer_name) AS customers,
        toString(min(toDate(transaction_date))) AS first_sale, toString(max(toDate(transaction_date))) AS last_sale
      FROM xv3.mart_invoice_items
      WHERE ${NAMED_WHERE}
      GROUP BY store
      ORDER BY last_sale DESC, customers DESC
    `,
      {}
    );
    return res.status(200).json({
      stores: rows.map((r) => ({ store: r.store, customers: toNum(r.customers), firstSale: r.first_sale, lastSale: r.last_sale })),
    });
  } catch (err) {
    console.error("[customer-analytics:stores]", err);
    return res.status(500).json({ error: "Failed to load stores", message: err?.message || "" });
  }
}

// Customer Explorer — paged per-customer table plus segment counts for the
// same store selection (ignoring the segment/search filters so the chips
// always show the full picture).
export async function handleCaCustomers(req, res) {
  try {
    const base = customerParams(req);
    const segment = SEGMENT_KEYS.includes(req.query.segment) ? req.query.segment : "";
    const q = String(req.query.q || "").trim().slice(0, 80);
    const sortCol = SORTS[req.query.sort] || SORTS.sales;
    const dir = req.query.dir === "asc" ? "ASC" : "DESC";
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 5000);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const params = { ...base, segment, q, limit: pageSize, offset: (page - 1) * pageSize };

    const filterWhere = `
      ({segment:String} = '' OR segment = {segment:String})
      AND ({q:String} = '' OR positionCaseInsensitive(customer_name, {q:String}) > 0
        OR positionCaseInsensitive(ifNull(email, ''), {q:String}) > 0
        OR positionCaseInsensitive(ifNull(phone, ''), {q:String}) > 0)
    `;

    const [rows, summary] = await Promise.all([
      query(
        `${customerAggSQL()}
        SELECT customer_name, email, phone, toString(first_order) AS first_order, toString(last_visit) AS last_visit,
          days_inactive, last_item, top_category, all_stores, store_count, top_store, top_sc,
          lifetime_sales, visits, segment, count() OVER () AS total_rows
        FROM seg
        WHERE ${filterWhere}
        ORDER BY ${sortCol} ${dir}, customer_name ASC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
        params
      ),
      query(
        `${customerAggSQL()}
        SELECT segment, count() AS customers, sum(lifetime_sales) AS sales
        FROM seg
        GROUP BY segment`,
        params
      ),
    ]);

    const segments = Object.fromEntries(SEGMENT_KEYS.map((k) => [k, { customers: 0, sales: 0 }]));
    for (const r of summary) segments[r.segment] = { customers: toNum(r.customers), sales: toNum(r.sales) };
    const totalCustomers = SEGMENT_KEYS.reduce((s, k) => s + segments[k].customers, 0);

    // count() OVER () is only present when the page has rows — an
    // out-of-range page still needs a real total, so fall back to the
    // summary (exact when no segment/search filter is active).
    const totalRows = rows.length ? toNum(rows[0].total_rows) : segment || q ? 0 : totalCustomers;

    return res.status(200).json({
      meta: { stores: base.sel, scope: base.scopeSel ? "selected" : "all", match: base.matchAll ? "all" : "any", segment, q, page, pageSize },
      totalRows,
      totalCustomers,
      segments,
      rows: rows.map((r) => ({
        customerName: r.customer_name,
        email: cleanContact(r.email),
        phone: cleanContact(r.phone),
        firstOrder: r.first_order,
        lastVisit: r.last_visit,
        daysInactive: toNum(r.days_inactive),
        lastItem: r.last_item || "",
        topCategory: r.top_category || "",
        allStores: r.all_stores || "",
        storeCount: toNum(r.store_count),
        topStore: r.top_store || "",
        topSc: r.top_sc || "",
        lifetimeSales: toNum(r.lifetime_sales),
        visits: toNum(r.visits),
        segment: r.segment,
      })),
    });
  } catch (err) {
    console.error("[customer-analytics:customers]", err);
    return res.status(500).json({ error: "Failed to load customers", message: err?.message || "" });
  }
}

// Overview — date-ranged KPIs (current vs comparison period), a fixed
// trailing-12-month trend, the as-of-today lifecycle snapshot, a per-store
// table and top customers. `store` (optional, single) scopes everything;
// "new" means first purchase within that scope (first at that store when
// one is picked, first at any HMR store otherwise).
export async function handleCaOverview(req, res) {
  try {
    const { from, to, cfrom, cto } = req.query;
    if (![from, to, cfrom, cto].every(isISODate)) {
      return res.status(400).json({ error: "Invalid date range", message: "from, to, cfrom and cto must be YYYY-MM-DD" });
    }
    const sel = req.query.store ? [String(req.query.store)] : [];
    const params = { from, to, cfrom, cto, sel, scopeSel: 1, matchAll: 0 };

    const namedCTE = `
      named AS (
        SELECT customer_name AS c, toDate(transaction_date) AS d, invoice_id, toFloat64(invoice_item_sold_amount) AS amt, ${STORE_EXPR} AS store
        FROM xv3.mart_invoice_items
        WHERE ${NAMED_WHERE}
          AND (length({sel:Array(String)}) = 0 OR has({sel:Array(String)}, ${STORE_EXPR}))
      ),
      firsts AS (SELECT c, min(d) AS f FROM named GROUP BY c)
    `;

    const [kpiRows, totalSalesRows, trendRows, snapshotRows, bandRows, storeRows, topRows] = await Promise.all([
      query(
        `WITH ${namedCTE}
        SELECT p, uniqExact(c) AS active, uniqExactIf(c, f >= pfrom) AS new_customers,
          sum(amt) AS sales, uniqExact(invoice_id) AS invoices
        FROM (
          SELECT n.c AS c, n.invoice_id AS invoice_id, n.amt AS amt, fi.f AS f,
            if(n.d BETWEEN toDate({from:String}) AND toDate({to:String}), 'cur', 'prev') AS p,
            if(p = 'cur', toDate({from:String}), toDate({cfrom:String})) AS pfrom
          FROM named n INNER JOIN firsts fi ON n.c = fi.c
          WHERE n.d BETWEEN toDate({from:String}) AND toDate({to:String})
             OR n.d BETWEEN toDate({cfrom:String}) AND toDate({cto:String})
        )
        GROUP BY p`,
        params
      ),
      // All sales incl. walk-in/unnamed, for "share of sales from
      // registered customers".
      query(
        `SELECT if(toDate(transaction_date) BETWEEN toDate({from:String}) AND toDate({to:String}), 'cur', 'prev') AS p,
          toFloat64(sum(invoice_item_sold_amount)) AS sales
        FROM xv3.mart_invoice_items
        WHERE invoice_item_is_voided = 0 AND invoice_is_voided = 0
          AND store_name IS NOT NULL AND store_name != 'HMR DEV RETAIL TEST STORE'
          AND (length({sel:Array(String)}) = 0 OR has({sel:Array(String)}, ${STORE_EXPR}))
          AND (toDate(transaction_date) BETWEEN toDate({from:String}) AND toDate({to:String})
            OR toDate(transaction_date) BETWEEN toDate({cfrom:String}) AND toDate({cto:String}))
        GROUP BY p`,
        params
      ),
      query(
        `WITH ${namedCTE}
        SELECT toString(toStartOfMonth(n.d)) AS month, uniqExact(n.c) AS active,
          uniqExactIf(n.c, toStartOfMonth(fi.f) = toStartOfMonth(n.d)) AS new_customers, sum(n.amt) AS sales
        FROM named n INNER JOIN firsts fi ON n.c = fi.c
        WHERE n.d >= toStartOfMonth(addMonths(toDate(now('Asia/Manila')), -11))
        GROUP BY month ORDER BY month`,
        params
      ),
      query(`${customerAggSQL()} SELECT segment, count() AS customers FROM seg GROUP BY segment`, params),
      query(
        `${customerAggSQL()}
        SELECT multiIf(days_inactive <= 30, '0–30 days', days_inactive <= 60, '31–60 days', days_inactive <= 180, '61–180 days',
          days_inactive <= 365, '6–12 months', days_inactive <= 730, '1–2 years', '2+ years') AS band,
          count() AS customers, sum(lifetime_sales) AS sales
        FROM seg GROUP BY band`,
        params
      ),
      query(
        `WITH ${namedCTE},
        store_firsts AS (SELECT c, store, min(d) AS f FROM named GROUP BY c, store)
        SELECT n.store AS store, uniqExact(n.c) AS active, uniqExactIf(n.c, sf.f >= toDate({from:String})) AS new_to_store,
          sum(n.amt) AS sales, uniqExact(n.invoice_id) AS invoices
        FROM named n INNER JOIN store_firsts sf ON n.c = sf.c AND n.store = sf.store
        WHERE n.d BETWEEN toDate({from:String}) AND toDate({to:String})
        GROUP BY store ORDER BY active DESC`,
        params
      ),
      query(
        `WITH ${namedCTE}
        SELECT c AS customer_name, sum(amt) AS sales, uniqExact(invoice_id) AS invoices, topK(1)(store)[1] AS top_store, toString(max(d)) AS last_visit
        FROM named
        WHERE d BETWEEN toDate({from:String}) AND toDate({to:String})
        GROUP BY c ORDER BY sales DESC LIMIT 10`,
        params
      ),
    ]);

    function period(p) {
      const k = kpiRows.find((r) => r.p === p) || {};
      const t = totalSalesRows.find((r) => r.p === p) || {};
      const active = toNum(k.active);
      const sales = toNum(k.sales);
      const invoices = toNum(k.invoices);
      const newCustomers = toNum(k.new_customers);
      const totalSales = toNum(t.sales);
      return {
        activeCustomers: active,
        newCustomers,
        returningCustomers: active - newCustomers,
        namedSales: sales,
        totalSales,
        namedSalesSharePct: totalSales ? (sales / totalSales) * 100 : null,
        avgSpendPerCustomer: active ? sales / active : null,
        visitsPerCustomer: active ? invoices / active : null,
      };
    }

    const snapshot = Object.fromEntries(SEGMENT_KEYS.map((k) => [k, 0]));
    for (const r of snapshotRows) snapshot[r.segment] = toNum(r.customers);
    const BAND_ORDER = ["0–30 days", "31–60 days", "61–180 days", "6–12 months", "1–2 years", "2+ years"];
    const bands = BAND_ORDER.map((band) => {
      const r = bandRows.find((x) => x.band === band);
      return { band, customers: toNum(r?.customers), sales: toNum(r?.sales) };
    });

    return res.status(200).json({
      meta: { from, to, cfrom, cto, store: sel[0] || "" },
      current: period("cur"),
      previous: period("prev"),
      trend: trendRows.map((r) => ({
        month: r.month,
        active: toNum(r.active),
        newCustomers: toNum(r.new_customers),
        returningCustomers: toNum(r.active) - toNum(r.new_customers),
        sales: toNum(r.sales),
      })),
      snapshot,
      bands,
      stores: storeRows.map((r) => ({
        store: r.store,
        activeCustomers: toNum(r.active),
        newToStore: toNum(r.new_to_store),
        sales: toNum(r.sales),
        avgSpend: toNum(r.active) ? toNum(r.sales) / toNum(r.active) : 0,
        visitsPerCustomer: toNum(r.active) ? toNum(r.invoices) / toNum(r.active) : 0,
      })),
      topCustomers: topRows.map((r) => ({
        customerName: r.customer_name,
        sales: toNum(r.sales),
        invoices: toNum(r.invoices),
        topStore: r.top_store,
        lastVisit: r.last_visit,
      })),
    });
  } catch (err) {
    console.error("[customer-analytics:overview]", err);
    return res.status(500).json({ error: "Failed to load Customer Analytics overview", message: err?.message || "" });
  }
}

// Store Overlap — for every pair of stores, how many customers bought at
// both. window=12m limits to purchases in the last 12 months; default is
// all time. Stores below `min` customers in the window are dropped so the
// matrix stays readable.
export async function handleCaOverlap(req, res) {
  try {
    const recent = req.query.window === "12m" ? 1 : 0;
    const minCustomers = Math.max(parseInt(req.query.min, 10) || 500, 1);
    const pairs = await query(
      `
      WITH cs AS (
        SELECT DISTINCT customer_name AS c, ${STORE_EXPR} AS store
        FROM xv3.mart_invoice_items
        WHERE ${NAMED_WHERE}
          AND ({recent:UInt8} = 0 OR toDate(transaction_date) >= addMonths(toDate(now('Asia/Manila')), -12))
      ),
      sizes AS (SELECT store, count() AS n FROM cs GROUP BY store HAVING n >= {minCustomers:UInt32}),
      kept AS (SELECT c, store FROM cs WHERE store IN (SELECT store FROM sizes))
      SELECT a.store AS a, b.store AS b, count() AS shared
      FROM kept a INNER JOIN kept b ON a.c = b.c
      GROUP BY a, b
    `,
      { recent, minCustomers }
    );
    const sizeMap = new Map();
    for (const p of pairs) if (p.a === p.b) sizeMap.set(p.a, toNum(p.shared));
    const stores = Array.from(sizeMap, ([store, customers]) => ({ store, customers })).sort((x, y) => y.customers - x.customers);
    return res.status(200).json({
      meta: { window: recent ? "12m" : "all", min: minCustomers },
      stores,
      pairs: pairs.filter((p) => p.a !== p.b).map((p) => ({ a: p.a, b: p.b, shared: toNum(p.shared) })),
    });
  } catch (err) {
    console.error("[customer-analytics:overlap]", err);
    return res.status(500).json({ error: "Failed to load store overlap", message: err?.message || "" });
  }
}
