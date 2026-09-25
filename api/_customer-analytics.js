import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
  // The unfiltered all-customer pass is a full-table aggregate; give it
  // headroom over the 30s default.
  request_timeout: 120000,
});

// Customer Analytics module (src/customer-analytics/) — dispatched from
// api/retail-analytics.js as report=caStores/caCustomers rather than its
// own top-level function, since the Hobby plan's 12-function cap is
// already fully used by api/*.js.
//
// All time, no date filter. One row per customer_name (mart_invoice_items
// has no stable cross-store customer id); a name seen with several emails/
// phones shows the ones from their most recent purchase. Every store that
// ever sold to a named customer is included, closed branches too
// (Fairview, Novaliches, ...). 'Sucat, Paranaque' (either casing) is
// merged into HMR SUCAT, same as the business's own customer query.
const STORE_EXPR = `if(upper(store_name) IN ('HMR SUCAT', 'SUCAT, PARANAQUE'), 'HMR SUCAT', store_name)`;

// Registered (named) customers only — walk-in / placeholder names can't be
// tracked across visits. Voided invoices/lines excluded.
const NAMED_WHERE = `
  invoice_item_is_voided = 0 AND invoice_is_voided = 0
  AND store_name IS NOT NULL AND store_name != 'HMR DEV RETAIL TEST STORE'
  AND customer_name IS NOT NULL AND trim(customer_name) != ''
  AND match(customer_name, '[a-zA-Z]')
  AND NOT match(lower(customer_name), 'walk[ -]?in')
  AND lower(trim(customer_name)) NOT IN ('n/a', 'na', 'walk', 'none')
`;

// Department / category / subcategory text match for the search bar.
const CAT_MATCH = `(
  positionCaseInsensitive(ifNull(department_name, ''), {cat:String}) > 0
  OR positionCaseInsensitive(ifNull(category_name, ''), {cat:String}) > 0
  OR positionCaseInsensitive(ifNull(sub_category_name, ''), {cat:String}) > 0
)`;

const SORTS = {
  sales: "sales",
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

async function query(sql, params) {
  const r = await client.query({ query: sql, query_params: params, format: "JSONEachRow" });
  return r.json();
}

// Store dropdown — every store with named-customer history.
export async function handleCaStores(req, res) {
  try {
    const rows = await query(
      `SELECT ${STORE_EXPR} AS store, uniqExact(customer_name) AS customers, toString(max(toDate(transaction_date))) AS last_sale
      FROM xv3.mart_invoice_items
      WHERE ${NAMED_WHERE}
      GROUP BY store
      ORDER BY store`,
      {}
    );
    return res.status(200).json({ stores: rows.map((r) => ({ store: r.store, customers: toNum(r.customers), lastSale: r.last_sale })) });
  } catch (err) {
    console.error("[customer-analytics:stores]", err);
    return res.status(500).json({ error: "Failed to load stores", message: err?.message || "" });
  }
}

// Customer list — paged + sorted server side (the full list is 380k+
// customers). Filters:
//   store = customers whose All Store Visited includes it (metrics still
//           use every purchase, at every store)
//   cat   = customers who ever bought an item whose department, category
//           or subcategory contains the text
//   q     = name / email / phone contains the text
//   type  = New (1 purchase, i.e. one invoice, all time) | Returning (2+)
// Totals and New/Returning counts come back for the same filters minus
// `type`, so the tabs always show both counts.
//
// Two phases, because the text-heavy columns (last item, top category/
// store/SC, email, phone) are far too slow to compute for every customer
// just to show one page: (1) a light per-customer pass (sales, visits,
// first/last date) for counts, sorting and paging, then (2) the full
// detail row for only the customers on the requested page.
export async function handleCaCustomers(req, res) {
  try {
    const store = String(req.query.store || "").trim().slice(0, 80);
    const cat = String(req.query.cat || "").trim().slice(0, 80);
    const q = String(req.query.q || "").trim().slice(0, 80);
    const type = req.query.type === "New" || req.query.type === "Returning" ? req.query.type : "";
    const sortCol = SORTS[req.query.sort] || SORTS.sales;
    const dir = req.query.dir === "asc" ? "ASC" : "DESC";
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 5000);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const params = { store, cat, q, type, limit: pageSize, offset: (page - 1) * pageSize };

    // Narrow to matching customers first so a store/search pick doesn't
    // aggregate the whole customer base; each matching customer's FULL
    // history (every store, every category) is still aggregated.
    const customerFilter = `
      AND ({store:String} = '' OR customer_name IN (
        SELECT DISTINCT customer_name FROM xv3.mart_invoice_items WHERE ${NAMED_WHERE} AND ${STORE_EXPR} = {store:String}
      ))
      AND ({cat:String} = '' OR customer_name IN (
        SELECT DISTINCT customer_name FROM xv3.mart_invoice_items WHERE ${NAMED_WHERE} AND ${CAT_MATCH}
      ))
      AND ({q:String} = '' OR positionCaseInsensitive(customer_name, {q:String}) > 0
        OR positionCaseInsensitive(ifNull(customer_email, ''), {q:String}) > 0
        OR positionCaseInsensitive(ifNull(customer_phone, ''), {q:String}) > 0)
    `;
    const lightSQL = (tail) => `
      WITH toDate(now('Asia/Manila')) AS today
      SELECT * FROM (
        SELECT *,
          count() OVER () AS total_customers,
          countIf(customer_type = 'New') OVER () AS new_customers,
          countIf(customer_type = 'Returning') OVER () AS returning_customers,
          sum(sales) OVER () AS total_sales
        FROM (
          SELECT customer_name,
            toFloat64(sum(invoice_item_sold_amount)) AS sales,
            uniqExact(invoice_id) AS visits,
            min(toDate(transaction_date)) AS first_order,
            max(toDate(transaction_date)) AS last_visit,
            dateDiff('day', last_visit, today) AS days_inactive,
            if(visits >= 2, 'Returning', 'New') AS customer_type
          FROM xv3.mart_invoice_items
          WHERE ${NAMED_WHERE} ${customerFilter}
          GROUP BY customer_name
        )
      )
      ${tail}
    `;

    const light = await query(
      lightSQL(`WHERE {type:String} = '' OR customer_type = {type:String}
        ORDER BY ${sortCol} ${dir}, customer_name ASC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}`),
      params
    );
    // The window totals ride on each row, so an empty page (a tab with no
    // customers, or past the end) needs one row without the tab filter /
    // offset just to read them.
    const first = light.length ? light[0] : (await query(lightSQL("LIMIT 1"), params))[0] || {};

    const names = light.map((r) => r.customer_name);
    const details = names.length
      ? await query(
          `SELECT customer_name,
            argMax(customer_email, transaction_date) AS email,
            argMax(customer_phone, transaction_date) AS phone,
            argMax(product_name, transaction_date) AS last_item,
            topK(1)(category_name)[1] AS top_category,
            arrayStringConcat(arraySort(groupUniqArray(${STORE_EXPR})), ', ') AS all_stores,
            topK(1)(${STORE_EXPR})[1] AS top_store,
            topK(1)(sales_associate_name)[1] AS top_sc
          FROM xv3.mart_invoice_items
          WHERE ${NAMED_WHERE} AND customer_name IN {names:Array(String)}
          GROUP BY customer_name`,
          { names }
        )
      : [];
    const detailByName = new Map(details.map((d) => [d.customer_name, d]));
    const rows = light.map((r) => ({ ...r, ...(detailByName.get(r.customer_name) || {}) }));

    const newCustomers = toNum(first.new_customers);
    const returningCustomers = toNum(first.returning_customers);
    const totalRows = type === "New" ? newCustomers : type === "Returning" ? returningCustomers : toNum(first.total_customers);

    return res.status(200).json({
      meta: { store, cat, q, type, page, pageSize },
      totalRows,
      totalCustomers: toNum(first.total_customers),
      newCustomers,
      returningCustomers,
      totalSales: toNum(first.total_sales),
      rows: rows.map((r) => ({
        customerName: r.customer_name,
        email: cleanContact(r.email),
        phone: cleanContact(r.phone),
        firstOrder: String(r.first_order || "").slice(0, 10),
        lastVisit: String(r.last_visit || "").slice(0, 10),
        daysInactive: toNum(r.days_inactive),
        lastItem: r.last_item || "",
        topCategory: r.top_category || "",
        allStores: r.all_stores || "",
        topStore: r.top_store || "",
        topSc: r.top_sc || "",
        visits: toNum(r.visits),
        sales: toNum(r.sales),
        customerType: r.customer_type,
      })),
    });
  } catch (err) {
    console.error("[customer-analytics:customers]", err);
    return res.status(500).json({ error: "Failed to load customers", message: err?.message || "" });
  }
}
