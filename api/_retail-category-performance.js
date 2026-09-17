import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See src/retail/stores.js for the full investigation writeup. Duplicated
// per this dashboard's per-file store/date-helper convention.
const ALL_RETAIL_STORES = [
  "PIONEER",
  "NORTH CALOOCAN",
  "MABALACAT",
  "S AND C CAINTA",
  "HMR TAGAYTAY ROAD",
  "CEBU",
  "HMR SUCAT",
  "SUBIC MAIN",
  "HMR CAGAYAN DE ORO",
  "HPI CANLUBANG",
  "ENVIROCYCLE",
];
const ALL_STORES_OPTION = "All Stores";

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
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { current: { from, to } };
  }
  if (range === "mtd") return { current: { from: firstOfMonthISO(today), to: today } };
  if (range === "ytd") return { current: { from: `${today.slice(0, 4)}-01-01`, to: today } };
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
  return { current: { from: mondayOfWeek(today), to: today } }; // wtd (default)
}
function resolveStoreScope(store) {
  if (!store || store === ALL_STORES_OPTION) return { stores: ALL_RETAIL_STORES };
  if (!ALL_RETAIL_STORES.includes(store)) return null;
  return { stores: [store] };
}

const TOP_DEPTS_FOR_TREND = 5;
const TOP_SUBCATS_PER_DEPT = 15;

export async function handleRetailCategoryPerformance(req, res) {
  try {
    const { store = ALL_STORES_OPTION, from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    const scope = resolveStoreScope(store);
    if (!scope) return res.status(400).json({ error: "Invalid store", message: `Unknown store: ${store}` });
    const { stores } = scope;

    let current;
    try {
      ({ current } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    // Department totals first — the trend and sub-category queries below
    // both need to know which departments are "top" before they can be
    // scoped, so this one runs first rather than in the same Promise.all.
    const deptTotalRows = await client
      .query({
        query: `
          SELECT department_name, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv, uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
          FROM xv3.mart_net_sales
          WHERE store_name IN {stores:Array(String)}
            AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            AND net_sales_amount > 0
          GROUP BY department_name
          ORDER BY gmv DESC
        `,
        query_params: { stores, curFrom: current.from, curTo: current.to },
        format: "JSONEachRow",
      })
      .then((r) => r.json());

    const totalGmv = deptTotalRows.reduce((s, r) => s + toNum(r.gmv), 0);
    const departments = deptTotalRows.map((r) => ({
      department: r.department_name || "Uncategorized",
      gmv: toNum(r.gmv),
      transactions: toNum(r.transactions),
      sharePct: safeDivide(toNum(r.gmv), totalGmv) * 100,
    }));
    const topDeptNames = departments.slice(0, TOP_DEPTS_FOR_TREND).map((d) => d.department);

    const [trendRows, subcatRows] = await Promise.all([
      // Daily GMV trend for the top 5 departments only (by current-window
      // GMV) — a full per-department trend for all ~30 would be unreadable
      // as a multi-line chart anyway.
      topDeptNames.length
        ? client
            .query({
              query: `
                SELECT transaction_date AS d, department_name, sumIf(net_sales_amount, net_sales_amount > 0) AS gmv
                FROM xv3.mart_net_sales
                WHERE store_name IN {stores:Array(String)}
                  AND department_name IN {depts:Array(String)}
                  AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
                GROUP BY transaction_date, department_name
              `,
              query_params: { stores, depts: topDeptNames, curFrom: current.from, curTo: current.to },
              format: "JSONEachRow",
            })
            .then((r) => r.json())
        : Promise.resolve([]),
      // Top sub-categories (category_name) within EVERY department, for
      // the row-click drill-down — capped per department via row_number()
      // OVER, since department is the only real usable top-level grouping
      // (see stores.js/sales-analytics comment on category_name's ~2,000
      // fragmented raw values) but a department's own top sub-categories
      // are still informative once scoped to one department at a time.
      client
        .query({
          query: `
            SELECT department_name, category_name, gmv FROM (
              SELECT
                department_name,
                category_name,
                sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
                row_number() OVER (PARTITION BY department_name ORDER BY sumIf(net_sales_amount, net_sales_amount > 0) DESC) AS rn
              FROM xv3.mart_net_sales
              WHERE store_name IN {stores:Array(String)}
                AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              GROUP BY department_name, category_name
            )
            WHERE rn <= {topN:UInt8} AND gmv > 0
            ORDER BY department_name, gmv DESC
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, topN: TOP_SUBCATS_PER_DEPT },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const trendByDate = new Map();
    for (const r of trendRows) {
      const d = String(r.d).slice(0, 10);
      if (!trendByDate.has(d)) trendByDate.set(d, { date: d });
      trendByDate.get(d)[r.department_name] = toNum(r.gmv);
    }
    const departmentTrend = Array.from(trendByDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

    const subcategoriesByDept = new Map();
    for (const r of subcatRows) {
      const dept = r.department_name || "Uncategorized";
      if (!subcategoriesByDept.has(dept)) subcategoriesByDept.set(dept, []);
      subcategoriesByDept.get(dept).push({ category: r.category_name || "Uncategorized", gmv: toNum(r.gmv) });
    }

    return res.status(200).json({
      meta: { current, stores },
      kpis: {
        totalGmv: { value: totalGmv },
        totalDepartments: { value: departments.length },
        topDepartment: departments[0] ? { department: departments[0].department, sharePct: departments[0].sharePct } : null,
      },
      departments,
      topDepartmentNames: topDeptNames,
      departmentTrend,
      subcategoriesByDepartment: Object.fromEntries(subcategoriesByDept),
      dataQuality: [
        "Department is the usable grouping level — the underlying category_name field has ~2,000 fragmented raw values and isn't usable as a top-level breakdown on its own; it's shown here only as each department's own top sub-categories (drill-down), still scoped narrowly enough to be readable.",
        `Department Trend covers only the current top ${TOP_DEPTS_FOR_TREND} departments by sales — a 30-line chart wouldn't be readable.`,
      ],
    });
  } catch (err) {
    console.error("[retail-category-performance]", err);
    return res.status(500).json({ error: "Failed to load Retail Category Performance data", message: err?.message || "" });
  }
}
