import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// HRH Online's e-commerce orders all land in xv3.mart_net_sales tagged
// store_name = 'HRH ONLINE' — that specific store_name is what separates the
// genuine online-fulfilled order from a physical branch merely tagging a
// walk-in sale with an online sales_channel (verified: several branches
// carry sales_channel = 'HMRPH ONLINE' rows that are NOT part of this
// store's population). Every query below filters on both.
const HRH_STORE = "HRH ONLINE";

// Exact stored sales_channel values — verified via `system.columns`/sample
// queries against xv3.mart_net_sales, not assumed. Compound variants like
// "HMRPH ONLINE - VIBER" exist in the raw data but fall OUTSIDE the
// HRH_STORE population entirely once store_name is filtered, so no explicit
// exclusion list is needed here.
const CHANNEL_MAP = {
  "All Channels": ["HMRPH ONLINE", "TIKTOK", "SHOPEE"],
  "HMRPH Online": ["HMRPH ONLINE"],
  TikTok: ["TIKTOK"],
  Shopee: ["SHOPEE"],
};

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

// ---------------------------------------------------------------------
// Date math — Asia/Manila is a fixed UTC+8 offset (no DST), so shifting a
// UTC instant by +8h and reading its UTC calendar fields gives Manila's
// wall-clock date without needing a timezone library.
// ---------------------------------------------------------------------
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

function daysBetweenISO(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function mondayOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, mondayOffset);
}

// Current/previous comparison window — Monday-through-today by default
// (partial current week vs. the SAME elapsed number of days in the prior
// week, per spec: never compare a partial current week to a full previous
// week). An explicit ?from=&to= overrides "current" with a caller-chosen
// range; "previous" is always the immediately preceding period of equal
// length.
function resolveWindows(fromParam, toParam) {
  const to = toParam || manilaTodayISODate();
  const from = fromParam || mondayOfWeek(to);
  const lengthDays = daysBetweenISO(from, to) + 1;
  const prevTo = addDaysISO(from, -1);
  const prevFrom = addDaysISO(prevTo, -(lengthDays - 1));
  return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
}

// Four rolling weekly buckets for Repeat Sellers — Wk4 is the "current"
// window above (may be partial), Wk1-3 are the three full 7-day weeks
// immediately before it.
function weeklyBuckets(current) {
  const wk4 = current;
  const wk3To = addDaysISO(wk4.from, -1);
  const wk3 = { from: addDaysISO(wk3To, -6), to: wk3To };
  const wk2To = addDaysISO(wk3.from, -1);
  const wk2 = { from: addDaysISO(wk2To, -6), to: wk2To };
  const wk1To = addDaysISO(wk2.from, -1);
  const wk1 = { from: addDaysISO(wk1To, -6), to: wk1To };
  return [wk1, wk2, wk3, wk4];
}

async function fetchInventory(barcodes) {
  if (barcodes.length === 0) return new Map();
  const rows = await (
    await client.query({
      query: `
        SELECT barcode, sum(item_qty) AS stock_qty, sum(total_current_srp) AS stock_value
        FROM xv3.mart_level_of_inventory
        WHERE store_name = {store:String} AND barcode IN {barcodes:Array(String)}
        GROUP BY barcode
      `,
      query_params: { store: HRH_STORE, barcodes },
      format: "JSONEachRow",
    })
  ).json();
  const map = new Map();
  for (const r of rows) {
    map.set(r.barcode, { stockQty: toNum(r.stock_qty), stockValue: toNum(r.stock_value) });
  }
  return map;
}

function stockStatus(inv) {
  if (!inv) return "UNKNOWN STOCK";
  return inv.stockQty > 0 ? "HAS STOCK" : "OUT OF STOCK";
}

export default async function handler(req, res) {
  try {
    const { channel = "All Channels", from = "", to = "" } = req.query;
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];
    const { current, previous } = resolveWindows(from, to);
    const [wk1, wk2, wk3, wk4] = weeklyBuckets(current);

    // KPIs — one bounded scan covering both windows, conditionally
    // aggregated. GMV = gross value of 'sale' rows only (returns excluded).
    // NMV = net of returns (transaction_type='return' rows already carry a
    // negative net_sales_amount in this mart). Units = gross quantity sold
    // ('sale' rows only — net_quantity nets returns, which Units should
    // NOT do). Orders = distinct invoices on 'sale' rows (invoice_no, not
    // order_no — order_no is frequently blank for TikTok/Shopee rows).
    // Every formula here reconciled exactly against a known historical
    // week (see commit message / PR description for the reconciliation).
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            sumIf(net_sales_amount, transaction_type = 'sale' AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_nmv,
            sumIf(net_quantity, transaction_type = 'sale' AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            uniqExactIf(invoice_no, transaction_type = 'sale' AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_orders,
            sumIf(net_sales_amount, transaction_type = 'sale' AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
            sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_nmv,
            sumIf(net_quantity, transaction_type = 'sale' AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units,
            uniqExactIf(invoice_no, transaction_type = 'sale' AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_orders,
            max(transaction_date) AS sales_as_of
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
        `,
        query_params: {
          store: HRH_STORE,
          channels,
          curFrom: current.from,
          curTo: current.to,
          prevFrom: previous.from,
          prevTo: previous.to,
        },
        format: "JSONEachRow",
      })
    ).json();
    const k = kpiRows[0] || {};
    const curGmv = toNum(k.cur_gmv);
    const prevGmv = toNum(k.prev_gmv);
    const curOrders = toNum(k.cur_orders);
    const prevOrders = toNum(k.prev_orders);
    const curNmv = toNum(k.cur_nmv);
    const prevNmv = toNum(k.prev_nmv);
    const curUnits = toNum(k.cur_units);
    const prevUnits = toNum(k.prev_units);
    const curAov = safeDivide(curGmv, curOrders);
    const prevAov = safeDivide(prevGmv, prevOrders);

    // Repeat Sellers — canonical SKU (barcode) with positive sale-side GMV
    // in at least 2 of the last 4 weekly buckets. product_name/category_name
    // picked via argMax(transaction_date) so a barcode's occasional naming
    // variance doesn't matter — display only, never the join/group key.
    const repeatRows = await (
      await client.query({
        query: `
          SELECT
            barcode,
            argMax(product_name, transaction_date) AS product_name,
            argMax(category_name, transaction_date) AS category_name,
            sumIf(net_sales_amount, transaction_date BETWEEN {wk1From:String} AND {wk1To:String}) AS wk1_gmv,
            sumIf(net_quantity, transaction_date BETWEEN {wk1From:String} AND {wk1To:String}) AS wk1_units,
            sumIf(net_sales_amount, transaction_date BETWEEN {wk2From:String} AND {wk2To:String}) AS wk2_gmv,
            sumIf(net_quantity, transaction_date BETWEEN {wk2From:String} AND {wk2To:String}) AS wk2_units,
            sumIf(net_sales_amount, transaction_date BETWEEN {wk3From:String} AND {wk3To:String}) AS wk3_gmv,
            sumIf(net_quantity, transaction_date BETWEEN {wk3From:String} AND {wk3To:String}) AS wk3_units,
            sumIf(net_sales_amount, transaction_date BETWEEN {wk4From:String} AND {wk4To:String}) AS wk4_gmv,
            sumIf(net_quantity, transaction_date BETWEEN {wk4From:String} AND {wk4To:String}) AS wk4_units
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_type = 'sale'
            AND transaction_date BETWEEN {wk1From:String} AND {wk4To:String}
            AND barcode IS NOT NULL AND barcode != ''
          GROUP BY barcode
          HAVING (wk1_gmv > 0) + (wk2_gmv > 0) + (wk3_gmv > 0) + (wk4_gmv > 0) >= 2
          ORDER BY wk4_gmv DESC
          LIMIT 50
        `,
        query_params: {
          store: HRH_STORE,
          channels,
          wk1From: wk1.from,
          wk1To: wk1.to,
          wk2From: wk2.from,
          wk2To: wk2.to,
          wk3From: wk3.from,
          wk3To: wk3.to,
          wk4From: wk4.from,
          wk4To: wk4.to,
        },
        format: "JSONEachRow",
      })
    ).json();

    // Product comparison (current vs previous window) — feeds BOTH Top
    // Products and Dropped Products, unpaged, so a dropped SKU (current
    // GMV = 0) isn't cut off by a "top N" limit before we can classify it.
    const comparisonRows = await (
      await client.query({
        query: `
          SELECT
            barcode,
            argMax(product_name, transaction_date) AS product_name,
            argMax(category_name, transaction_date) AS category_name,
            sumIf(net_sales_amount, transaction_type = 'sale' AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_quantity, transaction_type = 'sale' AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            sumIf(net_sales_amount, transaction_type = 'sale' AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
            sumIf(net_quantity, transaction_type = 'sale' AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_type = 'sale'
            AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            AND barcode IS NOT NULL AND barcode != ''
          GROUP BY barcode
          HAVING cur_gmv > 0 OR prev_gmv > 0
        `,
        query_params: {
          store: HRH_STORE,
          channels,
          curFrom: current.from,
          curTo: current.to,
          prevFrom: previous.from,
          prevTo: previous.to,
        },
        format: "JSONEachRow",
      })
    ).json();

    // Inventory snapshot freshness — reported so the UI never claims
    // real-time when the mart is batch-refreshed.
    const invMetaRows = await (
      await client.query({
        query: `SELECT max(created_time) AS inventory_as_of FROM xv3.mart_level_of_inventory WHERE store_name = {store:String}`,
        query_params: { store: HRH_STORE },
        format: "JSONEachRow",
      })
    ).json();

    const allBarcodes = Array.from(
      new Set([...repeatRows.map((r) => r.barcode), ...comparisonRows.map((r) => r.barcode)].filter(Boolean)),
    );
    const inventoryMap = await fetchInventory(allBarcodes);

    // Trend rule (Repeat Sellers) — deliberately simple and deterministic:
    // Wk4 (current) vs. the AVERAGE of Wk1-3, +/-5% band = "flat". Averaging
    // 3 prior weeks (rather than just Wk3) avoids a misleading "up" read
    // when a product merely skipped last week but sold normally before.
    const repeatSellers = repeatRows.map((r) => {
      const wk1Gmv = toNum(r.wk1_gmv);
      const wk2Gmv = toNum(r.wk2_gmv);
      const wk3Gmv = toNum(r.wk3_gmv);
      const wk4Gmv = toNum(r.wk4_gmv);
      const priorAvg = (wk1Gmv + wk2Gmv + wk3Gmv) / 3;
      let trend = "flat";
      if (priorAvg > 0) {
        if (wk4Gmv > priorAvg * 1.05) trend = "up";
        else if (wk4Gmv < priorAvg * 0.95) trend = "down";
      } else if (wk4Gmv > 0) {
        trend = "up";
      }
      const inv = inventoryMap.get(r.barcode);
      return {
        sku: r.barcode,
        product: r.product_name,
        category: r.category_name || null,
        wk1Gmv,
        wk1Units: toNum(r.wk1_units),
        wk2Gmv,
        wk2Units: toNum(r.wk2_units),
        wk3Gmv,
        wk3Units: toNum(r.wk3_units),
        wk4Gmv,
        wk4Units: toNum(r.wk4_units),
        trend,
        currentStockQty: inv ? inv.stockQty : null,
        currentStockValue: inv ? inv.stockValue : null,
      };
    });

    const comparisons = comparisonRows.map((r) => {
      const inv = inventoryMap.get(r.barcode);
      const curG = toNum(r.cur_gmv);
      const prevG = toNum(r.prev_gmv);
      const curU = toNum(r.cur_units);
      const prevU = toNum(r.prev_units);
      return {
        sku: r.barcode,
        product: r.product_name,
        category: r.category_name || null,
        currentGmv: curG,
        currentUnits: curU,
        previousGmv: prevG,
        previousUnits: prevU,
        gmvChangePct: pctDelta(curG, prevG),
        unitsChangePct: pctDelta(curU, prevU),
        currentStockQty: inv ? inv.stockQty : null,
        currentStockValue: inv ? inv.stockValue : null,
      };
    });

    const topProducts = comparisons
      .filter((r) => r.currentGmv > 0)
      .sort((a, b) => b.currentGmv - a.currentGmv)
      .slice(0, 20);

    const droppedProducts = comparisons
      .filter((r) => r.currentGmv <= 0 && r.previousGmv > 0)
      .sort((a, b) => b.previousGmv - a.previousGmv)
      .slice(0, 50)
      .map((r) => ({
        sku: r.sku,
        product: r.product,
        category: r.category,
        previousGmv: r.previousGmv,
        previousUnits: r.previousUnits,
        currentGmv: r.currentGmv,
        currentUnits: r.currentUnits,
        currentStockQty: r.currentStockQty,
        currentStockValue: r.currentStockValue,
        status: stockStatus(r.currentStockQty !== null ? { stockQty: r.currentStockQty } : null),
      }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        current,
        previous,
        weeklyBuckets: { wk1, wk2, wk3, wk4 },
        salesAsOf: k.sales_as_of || null,
        inventoryAsOf: (invMetaRows[0] && invMetaRows[0].inventory_as_of) || null,
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        gmv: { value: curGmv, delta: pctDelta(curGmv, prevGmv) },
        nmv: { value: curNmv, delta: pctDelta(curNmv, prevNmv) },
        aov: { value: curAov, delta: pctDelta(curAov, prevAov) },
        orders: { value: curOrders, delta: pctDelta(curOrders, prevOrders) },
        units: { value: curUnits, delta: pctDelta(curUnits, prevUnits) },
      },
      repeatSellers,
      topProducts,
      droppedProducts,
    });
  } catch (err) {
    console.error("HRH Product Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Product Analytics",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
