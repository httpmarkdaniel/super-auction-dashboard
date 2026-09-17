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
];
const WHOLESALE_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];
const HRH_ONLINE_STORE = "HRH ONLINE";
const SEGMENTS = {
  all: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE, ...WHOLESALE_STORES],
  retail: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE],
  wholesale: WHOLESALE_STORES,
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
function firstOfMonthISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function mondayOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}

export async function handleRetailTrend(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const stores = resolveSegment(segment);
    const today = manilaTodayISODate();

    // Day-click item detail — a separate lightweight branch, fetched
    // on-demand per clicked day rather than pre-loading every day's item
    // detail (expensive and mostly unused).
    if (req.query.day) {
      const day = req.query.day;
      const rows = await client
        .query({
          query: `
            SELECT product_name, groupArray(store_name || '(' || toString(qty) || ')') AS store_qty, any(sales_channel) AS channel, sum(sales) AS sales, sum(qty) AS total_qty
            FROM (
              SELECT product_name, store_name, sales_channel,
                sumIf(net_sales_amount, net_sales_amount > 0) AS sales,
                sumIf(net_quantity, net_sales_amount > 0) AS qty
              FROM xv3.mart_net_sales
              WHERE store_name IN {stores:Array(String)} AND transaction_date = {day:String} AND net_sales_amount > 0
              GROUP BY product_name, store_name, sales_channel
            )
            GROUP BY product_name
            ORDER BY sales DESC
            LIMIT 15
          `,
          query_params: { stores, day },
          format: "JSONEachRow",
        })
        .then((r) => r.json());
      const items = rows.map((r) => ({ product: r.product_name, stores: (r.store_qty || []).join(", "), channel: r.channel, sales: toNum(r.sales), qty: toNum(r.total_qty) }));
      return res.status(200).json({ day, items });
    }

    const monthStart = firstOfMonthISO(today);
    const fourWeeksAgoMonday = addDaysISO(mondayOfWeek(today), -28);

    const [dailyRows, weeklyRows] = await Promise.all([
      // Daily (This Month) — revenue/transactions/units per day, 1st of
      // the month through today.
      client
        .query({
          query: `
            SELECT transaction_date AS d,
              sum(net_sales_amount) AS revenue,
              uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions,
              sumIf(net_quantity, net_sales_amount > 0) AS units
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {today:String}
            GROUP BY transaction_date
          `,
          query_params: { stores, from: monthStart, today },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Weekly (Last 4 Weeks) — revenue per full Mon-Sun week, the 4 most
      // recent completed weeks.
      client
        .query({
          query: `
            SELECT toMonday(transaction_date) AS weekStart, sum(net_sales_amount) AS revenue
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
            GROUP BY weekStart
            ORDER BY weekStart
          `,
          query_params: { stores, from: fourWeeksAgoMonday, to: addDaysISO(mondayOfWeek(today), -1) },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const dailyByDate = new Map(dailyRows.map((r) => [String(r.d).slice(0, 10), r]));
    const daily = [];
    for (let d = monthStart; d <= today; d = addDaysISO(d, 1)) {
      const row = dailyByDate.get(d);
      daily.push({ date: d, revenue: row ? toNum(row.revenue) : 0, transactions: row ? toNum(row.transactions) : 0, units: row ? toNum(row.units) : 0 });
    }

    const weekly = weeklyRows.map((r) => {
      const weekStart = String(r.weekStart).slice(0, 10);
      return { weekStart, weekEnd: addDaysISO(weekStart, 6), revenue: toNum(r.revenue) };
    });

    return res.status(200).json({
      meta: { segment, stores, monthStart, today },
      daily,
      weekly,
    });
  } catch (err) {
    console.error("[retail-trend]", err);
    return res.status(500).json({ error: "Failed to load Retail Trend data", message: err?.message || "" });
  }
}
