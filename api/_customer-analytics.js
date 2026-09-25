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

// Marketing dashboard (src/customer-analytics/) — dispatched from
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

// Search bar: customers who ever bought from a department, category OR
// subcategory whose name matches the text — scanned in xv3.mart_net_sales
// (its customer column is literally named `ct.customer_name`). A name
// matches when it contains every search word; words are stemmed to a
// plural-tolerant prefix (see searchStems) so "furnitures" still matches
// FURNITURE.
const CAT_MATCH = `(
  arrayAll(w -> positionCaseInsensitive(ifNull(department_name, ''), w) > 0, {catWords:Array(String)})
  OR arrayAll(w -> positionCaseInsensitive(ifNull(category_name, ''), w) > 0, {catWords:Array(String)})
  OR arrayAll(w -> positionCaseInsensitive(ifNull(sub_category_name, ''), w) > 0, {catWords:Array(String)})
)`;
const CAT_CUSTOMERS = `SELECT DISTINCT \`ct.customer_name\` FROM xv3.mart_net_sales
  WHERE ${CAT_MATCH} AND transaction_date BETWEEN toDate({from:String}) AND toDate({to:String})`;

// "furnitures" -> "furniture", "batteries" -> "batter" (matches BATTERY
// and BATTERIES), "boxes" -> "box", "glasses" -> "glass". Substring match
// on the stem, so singular and plural both hit.
function searchStems(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9&']+/)
    .filter(Boolean)
    .map((w) => {
      if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3);
      if (w.length > 4 && /(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      return w;
    })
    .slice(0, 6);
}

// Marketing lifecycle segments, evaluated as of the END of the selected
// period (its month = "current month", M; M-1 and M-2 = the two before):
//   New         first purchase ever is in M
//   Retained    bought in M AND (bought in M-1 OR M-2)
//   Reactivated bought in M but zero sales in both M-1 and M-2
//   Slipped     zero sales in M AND last visit within 60 days of period end
//   Inactive    zero sales in M AND last visit more than 60 days before
// Checked in that order, first match wins.
export const SEGMENT_KEYS = ["New", "Retained", "Reactivated", "Slipped", "Inactive"];

function manilaToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function isISODate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

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
//   from/to = period (YYYY-MM-DD; omitted = all time up to today). The
//             list is customers who bought in the period; sales, visits,
//             stores, last item, category etc. count that period only.
//             First Order Date is first-ever, and the segment looks at the
//             months around the period's end (see SEGMENT_KEYS).
//   store   = customers whose All Store Visited (in the period) includes it
//   cat     = customers who bought (in the period) from a matching
//             department, category or subcategory (see CAT_MATCH)
//   q       = name / email / phone contains the text
//   segment = one of SEGMENT_KEYS
// Totals and per-segment counts come back for the same filters minus
// `segment`, so the tabs always show every count.
//
// Two phases, because the text-heavy columns (last item, top category/
// store/SC, email, phone) are far too slow to compute for every customer
// just to show one page: (1) a light per-customer pass (sales, visits,
// dates, segment) for counts, sorting and paging, then (2) the full
// detail row for only the customers on the requested page.
export async function handleCaCustomers(req, res) {
  try {
    const today = manilaToday();
    let to = isISODate(req.query.to) ? req.query.to : today;
    if (to > today) to = today;
    let from = isISODate(req.query.from) ? req.query.from : "2000-01-01";
    if (from > to) from = to;
    const store = String(req.query.store || "").trim().slice(0, 80);
    const cat = String(req.query.cat || "").trim().slice(0, 80);
    const q = String(req.query.q || "").trim().slice(0, 80);
    const segment = SEGMENT_KEYS.includes(req.query.segment) ? req.query.segment : "";
    const sortCol = SORTS[req.query.sort] || SORTS.sales;
    const dir = req.query.dir === "asc" ? "ASC" : "DESC";
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 5000);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const catWords = searchStems(cat);
    const params = { from, to, store, catWords, q, segment, limit: pageSize, offset: (page - 1) * pageSize };

    // Narrow to matching customers first so a store/search pick doesn't
    // aggregate the whole customer base.
    const customerFilter = `
      AND ({store:String} = '' OR customer_name IN (
        SELECT DISTINCT customer_name FROM xv3.mart_invoice_items
        WHERE ${NAMED_WHERE} AND ${STORE_EXPR} = {store:String}
          AND toDate(transaction_date) BETWEEN toDate({from:String}) AND toDate({to:String})
      ))
      AND (length({catWords:Array(String)}) = 0 OR customer_name IN (${CAT_CUSTOMERS}))
      AND ({q:String} = '' OR positionCaseInsensitive(customer_name, {q:String}) > 0
        OR positionCaseInsensitive(ifNull(customer_email, ''), {q:String}) > 0
        OR positionCaseInsensitive(ifNull(customer_phone, ''), {q:String}) > 0)
    `;
    // History up to the period end is aggregated (the segment needs the
    // first-ever purchase and the two months before the period's month,
    // which can fall before `from`); `inr` marks lines inside the period.
    const lightSQL = (tail) => `
      WITH toDate({to:String}) AS asof, toStartOfMonth(asof) AS m0,
        addMonths(m0, -1) AS m1, addMonths(m0, -2) AS m2
      SELECT * FROM (
        SELECT *,
          count() OVER () AS total_customers,
          countIf(segment = 'New') OVER () AS n_new,
          countIf(segment = 'Retained') OVER () AS n_retained,
          countIf(segment = 'Reactivated') OVER () AS n_reactivated,
          countIf(segment = 'Slipped') OVER () AS n_slipped,
          countIf(segment = 'Inactive') OVER () AS n_inactive
        FROM (
          SELECT customer_name,
            toFloat64(sumIf(amt, inr)) AS sales,
            uniqExactIf(invoice_id, inr) AS visits,
            min(d) AS first_order,
            max(d) AS last_visit,
            dateDiff('day', last_visit, asof) AS days_inactive,
            sumIf(amt, d >= m0) AS s0,
            sumIf(amt, toStartOfMonth(d) = m1) AS s1,
            sumIf(amt, toStartOfMonth(d) = m2) AS s2,
            multiIf(
              toStartOfMonth(first_order) = m0, 'New',
              s0 > 0 AND (s1 > 0 OR s2 > 0), 'Retained',
              s0 > 0, 'Reactivated',
              days_inactive <= 60, 'Slipped',
              'Inactive'
            ) AS segment
          FROM (
            SELECT customer_name, toDate(transaction_date) AS d, invoice_id, invoice_item_sold_amount AS amt,
              d >= toDate({from:String}) AS inr
            FROM xv3.mart_invoice_items
            WHERE ${NAMED_WHERE} AND toDate(transaction_date) <= toDate({to:String}) ${customerFilter}
          )
          GROUP BY customer_name
          HAVING countIf(inr) > 0
        )
      )
      ${tail}
    `;

    const light = await query(
      lightSQL(`WHERE {segment:String} = '' OR segment = {segment:String}
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
            AND toDate(transaction_date) BETWEEN toDate({from:String}) AND toDate({to:String})
          GROUP BY customer_name`,
          { names, from, to }
        )
      : [];
    const detailByName = new Map(details.map((d) => [d.customer_name, d]));

    // "Why matched" — when a department/category/subcategory search is on,
    // each page row also gets WHAT they bought (in the period) that matched
    // it: the matching dept › category › subcategory paths, matching item
    // count and sales, and the latest matching item. Same match rule as
    // the filter itself (CAT_MATCH), in the same table (mart_net_sales).
    const catActive = catWords.length > 0;
    const matches =
      catActive && names.length
        ? await query(
            `SELECT \`ct.customer_name\` AS customer_name,
              count() AS match_items,
              toFloat64(sum(net_sales_amount)) AS match_sales,
              argMax(product_name, transaction_date) AS match_last_item,
              toString(max(transaction_date)) AS match_last_date,
              topK(3)(concat(ifNull(department_name, '—'), ' › ', ifNull(category_name, '—'), ' › ', ifNull(sub_category_name, '—'))) AS match_paths,
              uniqExact(concat(ifNull(department_name, ''), '|', ifNull(category_name, ''), '|', ifNull(sub_category_name, ''))) AS match_path_count
            FROM xv3.mart_net_sales
            WHERE \`ct.customer_name\` IN {names:Array(String)} AND ${CAT_MATCH}
              AND transaction_date BETWEEN toDate({from:String}) AND toDate({to:String})
            GROUP BY customer_name`,
            { names, catWords, from, to }
          )
        : [];
    const matchByName = new Map(matches.map((m) => [m.customer_name, m]));
    const rows = light.map((r) => ({ ...r, ...(detailByName.get(r.customer_name) || {}), match: matchByName.get(r.customer_name) || null }));

    const segments = {
      New: toNum(first.n_new),
      Retained: toNum(first.n_retained),
      Reactivated: toNum(first.n_reactivated),
      Slipped: toNum(first.n_slipped),
      Inactive: toNum(first.n_inactive),
    };
    const totalCustomers = toNum(first.total_customers);
    const totalRows = segment ? segments[segment] : totalCustomers;

    return res.status(200).json({
      meta: { from: req.query.from ? from : "", to, asOf: to, store, cat, catActive, q, segment, page, pageSize },
      totalRows,
      totalCustomers,
      segments,
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
        segment: r.segment,
        match: r.match
          ? {
              items: toNum(r.match.match_items),
              sales: toNum(r.match.match_sales),
              lastItem: r.match.match_last_item || "",
              lastDate: String(r.match.match_last_date || "").slice(0, 10),
              paths: r.match.match_paths || [],
              pathCount: toNum(r.match.match_path_count),
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[customer-analytics:customers]", err);
    return res.status(500).json({ error: "Failed to load customers", message: err?.message || "" });
  }
}
