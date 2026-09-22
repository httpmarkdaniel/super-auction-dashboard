import { createClient } from "@clickhouse/client";
import { computeStoreQuadrant } from "./_retail-store-quadrant.js";
import { computeProductVelocity } from "./_retail-product-velocity.js";

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
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function formatPeso(n) {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}
function formatCompactPeso(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₱${(n / 1_000).toFixed(0)}K`;
  return formatPeso(n);
}
function formatNum(n) {
  return Math.round(n).toLocaleString("en-PH");
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
// Same dashboard-wide Date Range preset shape as every other retail
// report — see api/_retail-sales-overview.js's resolveRange for the full
// comment on each preset.
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
  const to = today;
  const from = mondayOfWeek(to);
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
}
function resolveSegment(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}

// ---------------------------------------------------------------------
// Fixed, deterministic threshold rules — same spirit as the Auction
// dashboard's own Operational Flags: every flag below is a fixed
// threshold over a real, already-computed field, never an AI judgment
// call or narrative recommendation.
// ---------------------------------------------------------------------
const STORE_REVENUE_CRITICAL_PCT = -20;
const STORE_REVENUE_HIGH_PCT = -10;
const STORE_TRAFFIC_HIGH_PCT = -15;
const STORE_TRAFFIC_MEDIUM_PCT = -8;
const STORE_CONVERSION_HIGH_PP = -5;
const STORE_CONVERSION_MEDIUM_PP = -2;
const CHANNEL_TXN_HIGH_PCT = -20;
const CHANNEL_TXN_MEDIUM_PCT = -10;
const CUSTOMER_COUNT_HIGH_PCT = -20;
const CUSTOMER_COUNT_MEDIUM_PCT = -10;
const AGED_INVENTORY_THRESHOLD = 500_000;
const REPLENISHMENT_RISK_TOP_N = 3;
const OUT_OF_STOCK_HIGH_COUNT = 20;

let nextId = 1;
function issue(fields) {
  return { id: nextId++, ...fields };
}

export async function handleRetailNeedsAttention(req, res) {
  try {
    nextId = 1;
    const segment = req.query.segment && SEGMENTS[req.query.segment] ? req.query.segment : "all";
    const range = req.query.range || "wtd";
    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, req.query.from, req.query.to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const stores = resolveSegment(segment);

    const [storeRevRows, quadrant, velocity, invSnapshotRows, channelRows, customerRows, agedRows] = await Promise.all([
      client
        .query({
          query: `
            SELECT store_name,
              sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_rev,
              sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_rev
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY store_name
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      computeStoreQuadrant(range, req.query.from, req.query.to),
      computeProductVelocity(stores),
      client
        .query({
          query: `SELECT countIf(item_qty = 0 AND date_received >= today() - 180) AS out_of_stock FROM xv3.mart_level_of_inventory WHERE store_name IN {stores:Array(String)}`,
          query_params: { stores },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT sales_channel,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_txn,
              uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_txn
            FROM xv3.mart_net_sales
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            GROUP BY sales_channel
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `
            SELECT customer_recency,
              uniqExactIf(customer_name, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_n,
              uniqExactIf(customer_name, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_n
            FROM xv3.mart_invoice_items
            WHERE store_name IN {stores:Array(String)} AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
              AND invoice_item_is_voided = 0 AND invoice_is_voided = 0
              AND customer_name IS NOT NULL AND trim(customer_name) != '' AND customer_name NOT IN ('n/a', 'WALK IN') AND match(customer_name, '[a-zA-Z]')
            GROUP BY customer_recency
          `,
          query_params: { stores, curFrom: current.from, curTo: current.to, prevFrom: previous.from, prevTo: previous.to },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      client
        .query({
          query: `SELECT sum(item_qty * current_srp) AS value FROM xv3.mart_level_of_inventory WHERE store_name IN {stores:Array(String)} AND item_qty > 0 AND date_received IS NOT NULL AND dateDiff('day', date_received, today()) > 180`,
          query_params: { stores },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const issues = [];

    // --- STORE: revenue decline ---
    for (const r of storeRevRows) {
      const curRev = toNum(r.cur_rev);
      const prevRev = toNum(r.prev_rev);
      const deltaPct = pctDelta(curRev, prevRev);
      if (deltaPct === null || deltaPct > STORE_REVENUE_HIGH_PCT) continue;
      const critical = deltaPct <= STORE_REVENUE_CRITICAL_PCT;
      issues.push(
        issue({
          priority: critical ? "Critical" : "High",
          area: "Store",
          entity: r.store_name,
          issue: `Revenue down ${Math.abs(deltaPct).toFixed(1)}%`,
          currentMetric: formatPeso(curRev),
          benchmark: `${formatPeso(prevRev)} previous`,
          businessImpact: `${curRev >= prevRev ? "+" : "-"}${formatCompactPeso(Math.abs(curRev - prevRev))}`,
          recommendedAction: "Investigate traffic and conversion together",
          status: critical ? "Critical" : "Investigate",
        })
      );
    }

    // --- STORE: traffic and conversion decline (10 walk-in branches) ---
    for (const r of quadrant.table) {
      if (r.trafficGrowthPct <= STORE_TRAFFIC_MEDIUM_PCT) {
        issues.push(
          issue({
            priority: r.trafficGrowthPct <= STORE_TRAFFIC_HIGH_PCT ? "High" : "Medium",
            area: "Store",
            entity: r.store,
            issue: `Foot traffic down ${Math.abs(r.trafficGrowthPct).toFixed(1)}%`,
            currentMetric: formatNum(r.currentTraffic),
            benchmark: "vs previous period",
            businessImpact: "Lost sales opportunity",
            recommendedAction: "Review local marketing and store visibility",
            status: "Investigate",
          })
        );
      }
      if (r.conversionGrowthPct <= STORE_CONVERSION_MEDIUM_PP) {
        issues.push(
          issue({
            priority: r.conversionGrowthPct <= STORE_CONVERSION_HIGH_PP ? "High" : "Medium",
            area: "Store",
            entity: r.store,
            issue: `Conversion down ${Math.abs(r.conversionGrowthPct).toFixed(1)}pp`,
            currentMetric: `${r.currentConversionPct.toFixed(1)}%`,
            benchmark: `${(r.currentConversionPct - r.conversionGrowthPct).toFixed(1)}% previous`,
            businessImpact: "Lost sales opportunity",
            recommendedAction: "Review traffic quality and store operations",
            status: "Investigate",
          })
        );
      }
    }

    // --- PRODUCT: replenishment risk (top N by sales value) ---
    velocity.items
      .filter((p) => p.status === "Replenishment Risk")
      .slice(0, REPLENISHMENT_RISK_TOP_N)
      .forEach((p) => {
        issues.push(
          issue({
            priority: "High",
            area: "Product",
            entity: p.product,
            issue: `${p.daysOfSupply.toFixed(0)} days of supply`,
            currentMetric: `${formatNum(p.currentStock)} units`,
            benchmark: "10-day minimum",
            businessImpact: "Stockout risk",
            recommendedAction: "Replenish / review incoming stock",
            status: "Action Required",
          })
        );
      });

    // --- PRODUCT: out-of-stock aggregate ---
    const outOfStock = toNum(invSnapshotRows[0]?.out_of_stock);
    if (outOfStock > 0) {
      issues.push(
        issue({
          priority: outOfStock >= OUT_OF_STOCK_HIGH_COUNT ? "High" : "Medium",
          area: "Product",
          entity: "Recently-active SKUs",
          issue: `${formatNum(outOfStock)} products out of stock`,
          currentMetric: formatNum(outOfStock),
          benchmark: "0 target",
          businessImpact: "Stockout risk",
          recommendedAction: "Review incoming stock and reorder points",
          status: "Action Required",
        })
      );
    }

    // --- CHANNEL: transaction decline ---
    for (const r of channelRows) {
      const curTxn = toNum(r.cur_txn);
      const prevTxn = toNum(r.prev_txn);
      const deltaPct = pctDelta(curTxn, prevTxn);
      if (deltaPct === null || deltaPct > CHANNEL_TXN_MEDIUM_PCT) continue;
      issues.push(
        issue({
          priority: deltaPct <= CHANNEL_TXN_HIGH_PCT ? "High" : "Medium",
          area: "Channel",
          entity: r.sales_channel || "Unknown",
          issue: `Transactions down ${Math.abs(deltaPct).toFixed(1)}%`,
          currentMetric: formatNum(curTxn),
          benchmark: `${formatNum(prevTxn)} previous`,
          businessImpact: "Revenue risk",
          recommendedAction: "Review campaign and engagement activity",
          status: "Monitor",
        })
      );
    }

    // --- CUSTOMER: new/retained/reactivated customer count decline ---
    const CUSTOMER_LABELS = { "One time customer": "New Customers", "Repeat buyer": "Retained Customers" };
    for (const r of customerRows) {
      const label = CUSTOMER_LABELS[r.customer_recency];
      if (!label) continue;
      const curN = toNum(r.cur_n);
      const prevN = toNum(r.prev_n);
      const deltaPct = pctDelta(curN, prevN);
      if (deltaPct === null || deltaPct > CUSTOMER_COUNT_MEDIUM_PCT) continue;
      issues.push(
        issue({
          priority: deltaPct <= CUSTOMER_COUNT_HIGH_PCT ? "High" : "Medium",
          area: "Customer",
          entity: label,
          issue: `${label} count down ${Math.abs(deltaPct).toFixed(1)}%`,
          currentMetric: formatNum(curN),
          benchmark: `${formatNum(prevN)} previous`,
          businessImpact: "Recurring revenue risk",
          recommendedAction: "Review loyalty and retention campaigns",
          status: "Monitor",
        })
      );
    }

    // --- INVENTORY: aged stock above threshold ---
    const agedValue = toNum(agedRows[0]?.value);
    if (agedValue >= AGED_INVENTORY_THRESHOLD) {
      issues.push(
        issue({
          priority: "Medium",
          area: "Inventory",
          entity: "180+ Day Inventory",
          issue: "Aged stock above threshold",
          currentMetric: formatCompactPeso(agedValue),
          benchmark: `Threshold ${formatCompactPeso(AGED_INVENTORY_THRESHOLD)}`,
          businessImpact: "Capital tied up",
          recommendedAction: "Review markdown opportunities",
          status: "Monitor",
        })
      );
    }

    return res.status(200).json({
      meta: { range, current, previous, segment, stores },
      issues,
      dataQuality: [
        "Every issue below is a fixed threshold over an already-computed real field (revenue/traffic/conversion/transactions/customer counts/inventory value) — none are AI-generated judgment calls or narrative recommendations.",
        "Store traffic/conversion issues are scoped to the 10 walk-in branches only (see the Store Performance Quadrant's own data quality note) — Wholesale, HRH Online, HARRINGTON PIONEER, MAIN, and HMR BULACAN have no foot-traffic tracking.",
        "Product issues reuse the exact same classification as the Product Velocity Analysis panel above (top 40 products by 30-day sales value) — a product outside that top 40 won't surface here even if it's technically at risk.",
        "New/Retained customer counts use xv3.mart_invoice_items' own customer_recency field (a coarser 2-way split), not the full 3R cohort methodology on the Customer (3R) tab.",
        "Week/Month/Year to Date comparisons can look dramatic right after the period starts, before today's data has fully posted — the same elapsed-day comparison every KPI card on this dashboard already uses, not specific to this panel.",
      ],
    });
  } catch (err) {
    console.error("[retail-needs-attention]", err);
    return res.status(500).json({ error: "Failed to load Retail Needs Attention data", message: err?.message || "" });
  }
}
