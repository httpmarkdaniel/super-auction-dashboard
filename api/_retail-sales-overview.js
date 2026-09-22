import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// See src/retail/segments.js for the full All/Retail/Wholesale writeup.
// Duplicated per this dashboard's per-file store/date-helper convention.
// Verified 2026-09-22 against the business's own YTD sales query (exact
// match: ₱961,774,257.55) — the real store universe includes 3 stores this
// list was previously missing entirely: HMR CUBAO (a real, active branch
// since 2020 — 96K+ transactions/₱52M YTD), HARRINGTON PIONEER (a distinct
// branch in Mandaluyong, NOT the same store as PIONEER despite the
// similar name — confirmed via xv3.stores' own address data), and MAIN (a
// legacy/system store bucket — xv3.stores shows division "Auction" and no
// real address, but it carries real historical revenue the business's own
// reporting includes). "SUCAT, PARANAQUE" (an old alias of HMR SUCAT) is
// deliberately NOT included — the business's own query excludes it too.
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
// Foot traffic only exists for these 10 walk-in branches — see
// api/_retail-foot-traffic.js's own comment for the full writeup.
const WALK_IN_STORES = [
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

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
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
function shiftYearsClampedISO(iso, deltaYears) {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y + deltaYears;
  const nd = Math.min(d, daysInMonth(ny, m));
  return `${ny}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}
function daysBetweenISO(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
// Dashboard-wide Date Range filter (WTD/MTD/YTD/Previous Week/Month/Year/
// Custom) — same resolveRange shape/semantics as every api/_hrh-*.js file
// (see api/_hrh-traffic-analytics.js's own resolveRange), replacing this
// page's old fixed Weekly/MTD toggle (view="mtd"|"weekly") now that the
// filter lives dashboard-wide in the Header instead of per-page. "mtd" is
// still a real preset (1st of month through today vs same elapsed span
// last month) — MTD Attainment below still only applies when this exact
// preset is selected, since there's no such thing as a "weekly" or
// arbitrary-range sales target in xv3.mart_sales_target.
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    const lengthDays = daysBetweenISO(from, to) + 1;
    const prevTo = addDaysISO(from, -1);
    const prevFrom = addDaysISO(prevTo, -(lengthDays - 1));
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }
  if (range === "mtd") {
    const to = today;
    const from = firstOfMonthISO(to);
    const prevAnchor = shiftMonthsClampedISO(to, -1);
    return { current: { from, to }, previous: { from: firstOfMonthISO(prevAnchor), to: prevAnchor } };
  }
  if (range === "ytd") {
    const to = today;
    const from = `${to.slice(0, 4)}-01-01`;
    const prevTo = shiftYearsClampedISO(to, -1);
    const prevFrom = `${Number(to.slice(0, 4)) - 1}-01-01`;
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    const from = addDaysISO(thisWeekMonday, -7);
    const to = addDaysISO(thisWeekMonday, -1);
    return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
  }
  if (range === "prevMonth") {
    const to = addDaysISO(firstOfMonthISO(today), -1);
    const from = firstOfMonthISO(to);
    const prevTo = addDaysISO(from, -1);
    const prevFrom = firstOfMonthISO(prevTo);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { current: { from: `${y}-01-01`, to: `${y}-12-31` }, previous: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` } };
  }
  // Default/"wtd": Monday of this week through today.
  const to = today;
  const from = mondayOfWeek(to);
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}
// Store drill-down, layered on top of the segment's own store list — only
// honored when the requested store is actually IN that list, so a
// mismatched segment/store combination (e.g. a stale `store` param after
// switching segment) can't silently leak stores outside the segment.
function resolveStores(segmentStores, storeParam) {
  if (storeParam && segmentStores.includes(storeParam)) return [storeParam];
  return segmentStores;
}

// Store -> region — see src/retail/storeRegions.js for the full writeup
// (a maintained static mapping, not a live query — xv3.stores' own
// address fields only cover 9 of 11 stores). Duplicated here per this
// dashboard's no-shared-import-across-frontend/backend convention.
const STORE_REGIONS = {
  PIONEER: "NCR",
  "HMR SUCAT": "NCR",
  "NORTH CALOOCAN": "NCR",
  MABALACAT: "Central Luzon",
  "S AND C CAINTA": "CALABARZON",
  "SUBIC MAIN": "Central Luzon",
  "HMR TAGAYTAY ROAD": "CALABARZON",
  CEBU: "Central Visayas",
  "HMR CAGAYAN DE ORO": "Northern Mindanao",
  "HMR CUBAO": "NCR",
  "HARRINGTON PIONEER": "NCR",
  "HMR BULACAN": "Central Luzon",
  "HPI CANLUBANG": "CALABARZON",
  ENVIROCYCLE: "CALABARZON",
  "HRH ONLINE": "Online",
};

export async function handleRetailSalesOverview(req, res) {
  try {
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const range = req.query.range || "wtd";
    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, req.query.from, req.query.to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const stores = resolveStores(resolveSegment(segment), req.query.store);
    const walkInStores = stores.filter((s) => WALK_IN_STORES.includes(s));

    // MTD Attainment needs a target — only queried when the "mtd" preset is
    // selected (the reference report only ever shows Attainment for that
    // preset, since there's no such thing as a "weekly" or arbitrary-range
    // target in xv3.mart_sales_target).
    const [kpiRows, targetRows, storeRows, channelRows, productRows, recencyRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
              sumIf(net_quantity, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_rev,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn,
              sumIf(net_quantity, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      range === "mtd"
        ? client
            .query({
              query: `SELECT sum(daily_target) AS target FROM xv3.mart_sales_target WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}`,
              query_params: { stores, curFrom: current.from, curTo: current.to },
              format: "JSONEachRow",
            })
            .then((r) => r.json())
        : Promise.resolve([{ target: 0 }]),
      // Per-store revenue (current + comparison) — for "Top Performing
      // Store" / "Steepest Decline" in At a Glance.
      client
        .query({
          query: `
            SELECT store_name,
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_rev
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)}
              AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Top Channel (current window).
      client
        .query({
          query: `
            SELECT sales_channel, sum(net_sales_amount) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY sales_channel ORDER BY gmv DESC LIMIT 1
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Top Product (current window).
      client
        .query({
          query: `
            SELECT product_name, sum(net_sales_amount) AS gmv
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
            GROUP BY product_name ORDER BY gmv DESC LIMIT 1
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // New vs Returning revenue split — via mart_invoice_items'
      // customer_recency field ("Repeat buyer" / "One time customer" /
      // "No name"), a real precomputed classification rather than a
      // fabricated split. This is coarser than the full New/Retained/
      // Reactivated cohort analysis on the Customer (3R) tab (which
      // reuses HRH Online's own established cohort methodology) — used
      // here only for the At a Glance quick-reference card.
      client
        .query({
          query: `
            SELECT customer_recency, sum(invoice_item_sold_amount) AS amount
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
            GROUP BY customer_recency
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const kpi = kpiRows[0] || {};
    const curRev = toNum(kpi.cur_rev);
    const curTxn = toNum(kpi.cur_txn);
    const curUnits = toNum(kpi.cur_units);
    const prevRev = toNum(kpi.prev_rev);
    const prevTxn = toNum(kpi.prev_txn);
    const prevUnits = toNum(kpi.prev_units);
    const curAbs = safeDivide(curRev, curTxn);
    const prevAbs = safeDivide(prevRev, prevTxn);
    const target = toNum(targetRows[0]?.target);
    const attainment = range === "mtd" && target > 0 ? safeDivide(curRev, target) * 100 : null;

    const storeDeltas = storeRows.map((r) => ({ store: r.store_name, cur: toNum(r.cur_rev), prev: toNum(r.prev_rev), deltaPct: pctDelta(toNum(r.cur_rev), toNum(r.prev_rev)) }));
    const withDelta = storeDeltas.filter((s) => s.deltaPct !== null);
    const topStore = withDelta.length ? [...withDelta].sort((a, b) => b.deltaPct - a.deltaPct)[0] : null;
    const worstStore = withDelta.length ? [...withDelta].sort((a, b) => a.deltaPct - b.deltaPct)[0] : null;

    const topChannel = channelRows[0] ? { channel: channelRows[0].sales_channel, gmv: toNum(channelRows[0].gmv) } : null;
    const topProduct = productRows[0] ? { product: productRows[0].product_name, gmv: toNum(productRows[0].gmv) } : null;

    const recencyMap = new Map(recencyRows.map((r) => [r.customer_recency, toNum(r.amount)]));
    const returningRevenue = recencyMap.get("Repeat buyer") || 0;
    const newRevenue = recencyMap.get("One time customer") || 0;
    const namedTotal = returningRevenue + newRevenue;

    // Second wave — the mockup's extra sections (hero stats, KPI grid,
    // trend chart, channel/category/region/hour breakdowns, inventory,
    // top products), all for the SAME current window as above. Kept as a
    // separate Promise.all rather than folded into the first one purely
    // for readability — nothing here depends on the first wave's results.
    const [
      trendRows,
      channelMixRows,
      categoryRows,
      hourRows,
      footTrafficRows,
      customerCountRows,
      inventorySnapshotRows,
      inventoryAgeRows,
      topProductRows,
    ] = await Promise.all([
      client
        .query({
          query: `SELECT transaction_date AS d, sum(net_sales_amount) AS rev, sum(net_quantity) AS units FROM xv3.mart_net_sales WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} GROUP BY transaction_date ORDER BY d`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT sales_channel, sum(net_sales_amount) AS gmv FROM xv3.mart_net_sales WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} GROUP BY sales_channel ORDER BY gmv DESC`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT category_name, sum(net_sales_amount) AS gmv, sum(net_quantity) AS units FROM xv3.mart_net_sales WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} GROUP BY category_name ORDER BY gmv DESC LIMIT 8`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT toHour(created_time) AS h, sum(net_sales_amount) AS gmv FROM xv3.mart_net_sales WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} GROUP BY h ORDER BY h`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Total foot traffic — scoped to the 10 walk-in branches only (see
      // api/_retail-foot-traffic.js's own comment); empty/zero when the
      // selected segment/store has no walk-in overlap (e.g. Wholesale).
      walkInStores.length
        ? client
            .query({
              query: `SELECT sum(traffic_count) AS traffic FROM xv3.mart_foot_traffic_masterlist WHERE store_name IN {stores:Array(String)} AND date BETWEEN {curFrom:String} AND {curTo:String}`,
              query_params: { stores: walkInStores, curFrom: current.from, curTo: current.to },
              format: "JSONEachRow",
            })
            .then((r) => r.json())
        : Promise.resolve([{ traffic: 0 }]),
      // Total/New/Returning Customers — via mart_invoice_items'
      // customer_recency (same coarse 2-way real classification used
      // above for the At a Glance revenue split, applied here to
      // customer COUNTS instead). The full New/Retained/Reactivated
      // cohort breakdown lives on the dedicated Customer (3R) tab.
      client
        .query({
          query: `SELECT customer_recency, uniqExact(customer_name) AS n FROM xv3.mart_invoice_items WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} AND invoice_item_is_voided = 0 AND invoice_is_voided = 0 AND customer_name IS NOT NULL AND trim(customer_name) != '' AND customer_name NOT IN ('n/a', 'WALK IN') AND match(customer_name, '[a-zA-Z]') GROUP BY customer_recency`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Inventory snapshot — a CURRENT point-in-time read (item_qty is
      // "on hand right now", not scoped to the current/previous date
      // window). Low stock threshold (<=2 units) and the 180-day
      // recency filter on Out of Stock are both grounded in the real
      // item_qty distribution investigated 2026-09-18 (p75 of in-stock
      // items = 2 units; without the recency filter, "Out of Stock"
      // would include millions of long-discontinued historical SKUs
      // this table also tracks, not just the active catalog).
      client
        .query({
          query: `
            SELECT
              sumIf(item_qty, item_qty > 0) AS units_on_hand,
              sumIf(item_qty * current_srp, item_qty > 0) AS inventory_value,
              countIf(item_qty > 0 AND item_qty <= 2) AS low_stock_items,
              countIf(item_qty = 0 AND date_received >= today() - 180) AS out_of_stock_items
            FROM xv3.mart_level_of_inventory
            WHERE store_name IN {stores:Array(String)}
          `,
          query_params: { stores },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT
              multiIf(
                dateDiff('day', date_received, today()) <= 30, '0-30 days',
                dateDiff('day', date_received, today()) <= 60, '31-60 days',
                dateDiff('day', date_received, today()) <= 90, '61-90 days',
                dateDiff('day', date_received, today()) <= 180, '91-180 days',
                '180+ days'
              ) AS bucket,
              sum(item_qty) AS units,
              sum(item_qty * current_srp) AS value
            FROM xv3.mart_level_of_inventory
            WHERE store_name IN {stores:Array(String)} AND item_qty > 0 AND date_received IS NOT NULL
            GROUP BY bucket
          `,
          query_params: { stores },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT product_name, department_name, sum(net_sales_amount) AS gmv, sum(net_quantity) AS units FROM xv3.mart_net_sales WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {curFrom:String} AND {curTo:String} GROUP BY product_name, department_name ORDER BY gmv DESC LIMIT 8`,
          query_params: { stores, curFrom: current.from, curTo: current.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const salesTrend = trendRows.map((r) => ({ date: String(r.d).slice(0, 10), revenue: toNum(r.rev), units: toNum(r.units) }));

    const channelTotal = channelMixRows.reduce((s, r) => s + toNum(r.gmv), 0);
    const TOP_CHANNELS = 4;
    const salesByChannel = channelMixRows.slice(0, TOP_CHANNELS).map((r) => ({ channel: r.sales_channel || "Unknown", gmv: toNum(r.gmv), sharePct: safeDivide(toNum(r.gmv), channelTotal) * 100 }));
    const otherChannelGmv = channelMixRows.slice(TOP_CHANNELS).reduce((s, r) => s + toNum(r.gmv), 0);
    if (otherChannelGmv > 0) salesByChannel.push({ channel: "Other", gmv: otherChannelGmv, sharePct: safeDivide(otherChannelGmv, channelTotal) * 100 });

    const categoryTotal = categoryRows.reduce((s, r) => s + toNum(r.gmv), 0);
    const topCategories = categoryRows.map((r) => ({ category: r.category_name || "Uncategorized", gmv: toNum(r.gmv), units: toNum(r.units), sharePct: safeDivide(toNum(r.gmv), categoryTotal) * 100 }));

    const topStores = [...storeDeltas].sort((a, b) => b.cur - a.cur).slice(0, 8);

    // MAIN is deliberately excluded here — it has no real address in
    // xv3.stores (division "Auction", no location), so there's no honest
    // region to assign it to. Its revenue still counts everywhere else on
    // this page (headline KPIs, Top Stores, etc.), just not in this one
    // region breakdown.
    const regionTotals = new Map();
    let regionTotal = 0;
    for (const s of storeDeltas) {
      if (s.store === "MAIN") continue;
      const region = STORE_REGIONS[s.store] || "Other";
      regionTotals.set(region, (regionTotals.get(region) || 0) + s.cur);
      regionTotal += s.cur;
    }
    const salesByRegion = Array.from(regionTotals, ([region, gmv]) => ({ region, gmv, sharePct: safeDivide(gmv, regionTotal) * 100 })).sort((a, b) => b.gmv - a.gmv);

    const salesByHour = Array.from({ length: 24 }, (_, h) => {
      const row = hourRows.find((r) => toNum(r.h) === h);
      return { hour: h, gmv: row ? toNum(row.gmv) : 0 };
    });

    const footTraffic = toNum(footTrafficRows[0]?.traffic);
    const custByRecency = new Map(customerCountRows.map((r) => [r.customer_recency, toNum(r.n)]));
    const newCustomers = custByRecency.get("One time customer") || 0;
    const returningCustomers = custByRecency.get("Repeat buyer") || 0;
    const totalCustomers = newCustomers + returningCustomers;

    const inv = inventorySnapshotRows[0] || {};
    const unitsOnHand = toNum(inv.units_on_hand);
    const inventoryValue = toNum(inv.inventory_value);
    const lowStockItems = toNum(inv.low_stock_items);
    const outOfStockItems = toNum(inv.out_of_stock_items);
    const sellThroughPct = unitsOnHand + curUnits > 0 ? safeDivide(curUnits, curUnits + unitsOnHand) * 100 : null;

    const AGE_BUCKET_ORDER = ["0-30 days", "31-60 days", "61-90 days", "91-180 days", "180+ days"];
    const ageByBucket = new Map(inventoryAgeRows.map((r) => [r.bucket, { units: toNum(r.units), value: toNum(r.value) }]));
    const totalAgeUnits = inventoryAgeRows.reduce((s, r) => s + toNum(r.units), 0);
    const inventoryAge = AGE_BUCKET_ORDER.map((bucket) => {
      const b = ageByBucket.get(bucket) || { units: 0, value: 0 };
      return { bucket, units: b.units, value: b.value, sharePct: safeDivide(b.units, totalAgeUnits) * 100 };
    });

    const topProducts = topProductRows.map((r) => ({ product: r.product_name, department: r.department_name || "Uncategorized", gmv: toNum(r.gmv), units: toNum(r.units) }));

    // Insights — same "auto-derived facts, not editorial recommendations"
    // principle as Notable Changes above, restyled as icon cards on the
    // frontend.
    const insights = [];
    const revDelta = pctDelta(curRev, prevRev);
    if (revDelta !== null) {
      insights.push({
        icon: revDelta >= 0 ? "up" : "down",
        title: `Sales ${revDelta >= 0 ? "increased" : "decreased"} by ${Math.abs(revDelta).toFixed(1)}%`,
        description: `Total sales ${revDelta >= 0 ? "grew" : "fell"} by ₱${Math.abs(curRev - prevRev).toLocaleString("en-PH", { maximumFractionDigits: 0 })} compared to the previous period.`,
      });
    }
    if (topCategories[0]) {
      insights.push({
        icon: "cart",
        title: `${topCategories[0].category} leads`,
        description: `${topCategories[0].sharePct.toFixed(1)}% share of total sales, ${toNum(topCategories[0].units).toLocaleString("en-PH")} units.`,
      });
    }
    if (outOfStockItems > 0 || lowStockItems > 0) {
      insights.push({
        icon: "warn",
        title: `${(outOfStockItems + lowStockItems).toLocaleString("en-PH")} SKUs need inventory attention`,
        description: `${outOfStockItems.toLocaleString("en-PH")} recently-stocked items are now out of stock, ${lowStockItems.toLocaleString("en-PH")} more are at 2 units or fewer.`,
      });
    }
    if (topChannel && salesByChannel[0]) {
      insights.push({
        icon: "announce",
        title: `${topChannel.channel} is the top channel`,
        description: `₱${topChannel.gmv.toLocaleString("en-PH", { maximumFractionDigits: 0 })} this period, ${salesByChannel[0].sharePct.toFixed(1)}% of channel-attributed sales.`,
      });
    }

    // Notable Changes — a short, factual, auto-derived list (NOT the
    // reference mock's hand-written "Recommended Actions" — those are
    // editorial judgment calls that can't be honestly generated from a
    // query, so this dashboard states what changed and leaves the
    // "what to do about it" to the reader).
    const notableChanges = [];
    if (topStore) notableChanges.push(`${topStore.store} had the strongest ${range === "mtd" ? "vs-last-month" : "vs previous period"} change: ${topStore.deltaPct >= 0 ? "+" : ""}${topStore.deltaPct.toFixed(1)}%.`);
    if (worstStore && worstStore.store !== topStore?.store) {
      notableChanges.push(`${worstStore.store} had the steepest decline: ${worstStore.deltaPct.toFixed(1)}%.`);
    }
    if (topChannel) notableChanges.push(`${topChannel.channel} was the top sales channel this period.`);
    if (topProduct) notableChanges.push(`${topProduct.product} was the top-selling product this period.`);

    return res.status(200).json({
      meta: { range, current, previous, segment, store: req.query.store || "", stores },
      kpis: {
        revenue: { value: curRev, previous: prevRev, delta: pctDelta(curRev, prevRev) },
        transactions: { value: curTxn, previous: prevTxn, delta: pctDelta(curTxn, prevTxn) },
        units: { value: curUnits, previous: prevUnits, delta: pctDelta(curUnits, prevUnits) },
        abs: { value: curAbs, previous: prevAbs, delta: pctDelta(curAbs, prevAbs) },
        attainment: range === "mtd" ? { value: attainment, target } : null,
      },
      atAGlance: {
        topStore,
        worstStore,
        topChannel,
        topProduct,
        newVsReturning: namedTotal > 0 ? { newPct: safeDivide(newRevenue, namedTotal) * 100, returningPct: safeDivide(returningRevenue, namedTotal) * 100 } : null,
      },
      notableChanges,
      insights,
      hero: {
        totalSales: { value: curRev, delta: pctDelta(curRev, prevRev) },
        unitsSold: { value: curUnits, delta: pctDelta(curUnits, prevUnits) },
        sellThroughPct,
      },
      moreKpis: {
        footTraffic,
        hasFootTraffic: walkInStores.length > 0,
        totalCustomers,
        newCustomers,
        returningCustomers,
      },
      salesTrend,
      salesByChannel,
      topCategories,
      topStores,
      salesByRegion,
      salesByHour,
      inventoryOverview: { inventoryValue, unitsOnHand, lowStockItems, outOfStockItems },
      inventoryAge,
      topProducts,
      dataQuality: [
        "Every revenue/units figure on this page (KPIs, Sales Trend, Sales by Channel, Top Categories, Sales by Region, Sales by Hour, Top Selling Products) is NET of returns/refunds/voids — verified 2026-09-22 that these all now reconcile to the same total (previously, several of these breakdowns excluded negative-amount rows while the headline KPI didn't, so their totals didn't match it).",
        "Foot Traffic (KPI grid) is scoped to the 10 walk-in branches only (see the Foot Traffic tab's own data quality note) — Wholesale, HRH Online, HARRINGTON PIONEER, MAIN, and HMR BULACAN have no foot-traffic tracking, so it reads 0 when the selected segment/store has no walk-in overlap (e.g. Wholesale).",
        "New vs Returning Revenue (At a Glance) uses xv3.mart_invoice_items' own customer_recency field (Repeat buyer / One time customer / No name) — a coarser 2-way split than the full New/Retained/Reactivated cohort analysis on the Customer (3R) tab, used here only for a quick-reference figure.",
        "Notable Changes/Insights are auto-derived facts (what changed, by how much) — not editorial recommendations, since those require business judgment a query can't honestly produce.",
        "Sales by Region uses a maintained store→region lookup (src/retail/storeRegions.js), not a live query — xv3.stores' own address data doesn't cover every store. MAIN is deliberately excluded from this one breakdown (its revenue still counts everywhere else on this page) since xv3.stores has no real address for it to assign an honest region.",
        "The store universe includes HARRINGTON PIONEER (a distinct Mandaluyong branch, not the same store as PIONEER) and MAIN (a legacy/system store bucket — xv3.stores shows it under division \"Auction\" with no real address, but it carries real revenue). Both are verified 2026-09-22 against the business's own YTD sales query. Neither has foot-traffic or sales-target data, so they don't appear on the Foot Traffic tab or in MTD Attainment.",
        "Sales by Payment Method is intentionally NOT included — the only table with a real payment-method field (xv3.mart_xv3_order_report) covers just ~4% of this store scope's actual transaction volume (verified 2026-09-18: 83K order rows vs ~2M real POS transactions), so a breakdown from it would misrepresent how customers actually pay.",
        "Inventory figures (value, units on hand, low/out-of-stock, aging, gross margin) are a CURRENT point-in-time snapshot from xv3.mart_level_of_inventory, independent of the Weekly/MTD toggle above (which only affects sales figures).",
        "Gross Margin is intentionally NOT included — investigated 2026-09-18 via current inventory (current_srp vs item_cost); a small number of extreme-volume SKUs (e.g. one product with item_cost double its current_srp, at ~39,000 units) have an implausible cost-exceeds-price relationship that single-handedly drove the network-wide aggregate negative. This looks like a source-data entry error (cost/price swapped or stale) rather than real economics, so showing it would mislead rather than inform.",
        "Sell-Through Rate = units sold this period ÷ (units sold + current units on hand) — a standard approximation using current stock as a stand-in for period-start inventory, not exact.",
        "\"Products to Watch\" (days-of-supply) from the reference layout is NOT included — investigated 2026-09-18 and found the product-name join between sales and inventory data only matches cleanly for a small fraction of items, too weak to trust per-product.",
      ],
    });
  } catch (err) {
    console.error("[retail-sales-overview]", err);
    return res.status(500).json({ error: "Failed to load Retail Sales Overview data", message: err?.message || "" });
  }
}
