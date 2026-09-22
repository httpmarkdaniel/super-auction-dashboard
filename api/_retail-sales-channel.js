import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See api/_retail-sales-overview.js's own comment for the full writeup —
// verified 2026-09-22 against the business's own YTD query.
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
  "HARRINGTON PIONEER",
  "HMR BULACAN",
  "MAIN",
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
// Dashboard-wide Date Range filter, current window only (this page has no
// comparison/delta) — see api/_retail-sales-overview.js's resolveRange for
// the full comment on why each preset resolves the way it does.
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

export async function handleRetailSalesChannel(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const range = req.query.range || "wtd";
    let current;
    try {
      current = resolveRange(range, req.query.from, req.query.to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const stores = resolveStores(resolveSegment(segment), req.query.store);

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
      meta: { range, current, segment, store: req.query.store || "", stores },
      channels,
      totalGmv,
      dataQuality: ["Channel comes directly from xv3.mart_net_sales' own sales_channel field — real raw values (WALK-IN, VIBER, FACEBOOK, HMRPH ONLINE, TIKTOK, SHOPEE, REFERRAL, CAROUSEL, etc.), not consolidated into fewer buckets."],
    });
  } catch (err) {
    console.error("[retail-sales-channel]", err);
    return res.status(500).json({ error: "Failed to load Retail Sales Channel data", message: err?.message || "" });
  }
}
