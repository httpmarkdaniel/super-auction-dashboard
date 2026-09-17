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
function resolveView(view) {
  const today = manilaTodayISODate();
  if (view === "mtd") return { from: firstOfMonthISO(today), to: today };
  const thisWeekMonday = mondayOfWeek(today);
  return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}

export async function handleRetailSalesChannel(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const view = req.query.view === "mtd" ? "mtd" : "weekly";
    const stores = resolveSegment(segment);
    const current = resolveView(view);

    const rows = await client
      .query({
        query: `
          SELECT sales_channel,
            sumIf(net_sales_amount, net_sales_amount > 0) AS gmv,
            uniqExactIf(invoice_id, net_sales_amount > 0) AS transactions
          FROM xv3.mart_net_sales
          WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {from:String} AND {to:String}
          GROUP BY sales_channel
          ORDER BY gmv DESC
        `,
        query_params: { stores, from: current.from, to: current.to },
        format: "JSONEachRow",
      })
      .then((r) => r.json());

    const totalGmv = rows.reduce((s, r) => s + toNum(r.gmv), 0);
    const channels = rows.map((r) => ({
      channel: r.sales_channel || "Unknown",
      gmv: toNum(r.gmv),
      transactions: toNum(r.transactions),
      sharePct: safeDivide(toNum(r.gmv), totalGmv) * 100,
      abs: safeDivide(toNum(r.gmv), toNum(r.transactions)),
    }));

    return res.status(200).json({
      meta: { view, current, segment, stores },
      channels,
      totalGmv,
      dataQuality: ["Channel comes directly from xv3.mart_net_sales' own sales_channel field — real raw values (WALK-IN, VIBER, FACEBOOK, HMRPH ONLINE, TIKTOK, SHOPEE, REFERRAL, CAROUSEL, etc.), not consolidated into fewer buckets."],
    });
  } catch (err) {
    console.error("[retail-sales-channel]", err);
    return res.status(500).json({ error: "Failed to load Retail Sales Channel data", message: err?.message || "" });
  }
}
