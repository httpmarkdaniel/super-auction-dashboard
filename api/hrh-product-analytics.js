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
// HRH_STORE population entirely once store_name is filtered. CAROUSEL is
// deliberately excluded — it is a distinct in-store channel, not part of
// this dashboard's online population.
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

function firstOfMonthISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function daysInMonth(year, month1Based) {
  // Date.UTC's month arg is 0-based, so passing the 1-based month directly
  // asks for day 0 of the NEXT month — i.e. the last day of this one.
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

// Same month N months back, day-of-month clamped to that month's length
// (e.g. Mar 31 - 1 month -> Feb 28/29, never Mar 3).
function shiftMonthsClampedISO(iso, deltaMonths) {
  const [y, m, d] = iso.split("-").map(Number);
  const total0 = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total0 / 12);
  const nm1 = (((total0 % 12) + 12) % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm1));
  return `${ny}-${String(nm1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// Same month/day N years back, clamped for Feb 29 into a non-leap year.
function shiftYearsClampedISO(iso, deltaYears) {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y + deltaYears;
  const nd = Math.min(d, daysInMonth(ny, m));
  return `${ny}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// Preset/custom current+previous windows — Asia/Manila "today" throughout
// (never the server's own UTC date). Mirrors the exact same preset
// semantics as the Auction Dashboard's shared src/utils/dateRange.js
// (resolveComparisonRange), reimplemented here on plain ISO date strings
// because that browser-facing util assumes the VIEWER's local clock is
// Manila time — true for a browser, not for this server process (which
// runs in UTC on Vercel), so it can't be imported and called as-is here.
//
// - wtd: Monday-of-week -> today; previous = same span shifted back
//   exactly 7 days (the prior calendar week's same weekdays, NOT the
//   immediately preceding 7 days — those differ once "today" isn't Sunday).
// - mtd: 1st-of-month -> today; previous = 1st of the prior month through
//   the same day-of-month (clamped for shorter months).
// - ytd: Jan 1 -> today; previous = Jan 1 of the prior year through the
//   same month/day a year back (clamped for Feb 29).
// - custom: caller-supplied from/to; previous = the immediately preceding
//   period of identical length (the one shape that IS adjacency-based).
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();

  if (range === "custom") {
    if (!fromParam || !toParam) {
      throw new RangeError("Custom range requires both from and to");
    }
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

  // wtd (default)
  const to = today;
  const from = mondayOfWeek(to);
  return { current: { from, to }, previous: { from: addDaysISO(from, -7), to: addDaysISO(to, -7) } };
}

// Four rolling weekly buckets for Repeat Sellers — always the 4 most
// recent real 7-day calendar weeks ending at the effective "to" date,
// deliberately INDEPENDENT of whichever range preset is selected (a WTD/
// MTD/YTD/Custom "current" window can be a single day or a whole year;
// none of those shapes fit "weekly repeat-purchase cadence", so this
// lookback stays fixed and explicit no matter what's chosen elsewhere on
// the page).
function weeklyBucketsEndingAt(to) {
  const wk4 = { from: addDaysISO(to, -6), to };
  const wk3To = addDaysISO(wk4.from, -1);
  const wk3 = { from: addDaysISO(wk3To, -6), to: wk3To };
  const wk2To = addDaysISO(wk3.from, -1);
  const wk2 = { from: addDaysISO(wk2To, -6), to: wk2To };
  const wk1To = addDaysISO(wk2.from, -1);
  const wk1 = { from: addDaysISO(wk1To, -6), to: wk1To };
  return [wk1, wk2, wk3, wk4];
}

// Same shape as weeklyBucketsEndingAt but 4 calendar MONTHS instead of
// 4×7-day weeks — the Repeat Sellers "bucket granularity" toggle. The most
// recent bucket runs from the 1st of the month containing `to` through
// `to` itself (a partial month unless `to` is month-end, same "always ends
// today" behavior as the weekly buckets); the 3 before it are full
// calendar months.
function monthlyBucketsEndingAt(to) {
  function monthBucket(anchorIso, endIso) {
    return { from: firstOfMonthISO(anchorIso), to: endIso };
  }
  const mo4 = monthBucket(to, to);
  const mo3Anchor = shiftMonthsClampedISO(to, -1);
  const [y3, m3] = mo3Anchor.split("-").map(Number);
  const mo3 = monthBucket(mo3Anchor, `${y3}-${String(m3).padStart(2, "0")}-${String(daysInMonth(y3, m3)).padStart(2, "0")}`);
  const mo2Anchor = shiftMonthsClampedISO(to, -2);
  const [y2, m2] = mo2Anchor.split("-").map(Number);
  const mo2 = monthBucket(mo2Anchor, `${y2}-${String(m2).padStart(2, "0")}-${String(daysInMonth(y2, m2)).padStart(2, "0")}`);
  const mo1Anchor = shiftMonthsClampedISO(to, -3);
  const [y1, m1] = mo1Anchor.split("-").map(Number);
  const mo1 = monthBucket(mo1Anchor, `${y1}-${String(m1).padStart(2, "0")}-${String(daysInMonth(y1, m1)).padStart(2, "0")}`);
  return [mo1, mo2, mo3, mo4];
}

// Inventory — joined on the numeric canonical key (item_id -> product_id),
// never barcode/product_name text. Physical stock (item_qty/total_current_srp)
// and HMRPH CMS-posted stock (cms_hmrph_posting_quantity/cms_posting_total_value)
// are reported separately and are NOT forced to reconcile — they are two
// legitimately different operational numbers (see stockStatus below).
async function fetchInventory(itemIds) {
  if (itemIds.length === 0) return new Map();
  const rows = await (
    await client.query({
      query: `
        SELECT
          product_id,
          sum(item_qty) AS stock_qty,
          sum(total_current_srp) AS stock_value,
          sum(cms_hmrph_posting_quantity) AS posted_qty,
          sum(cms_posting_total_value) AS posted_value,
          any(inventory_aging) AS aging
        FROM xv3.mart_level_of_inventory
        WHERE store_name = {store:String} AND product_id IN {itemIds:Array(Int64)}
        GROUP BY product_id
      `,
      query_params: { store: HRH_STORE, itemIds },
      format: "JSONEachRow",
    })
  ).json();
  const map = new Map();
  for (const r of rows) {
    map.set(String(r.product_id), {
      stockQty: toNum(r.stock_qty),
      stockValue: toNum(r.stock_value),
      postedQty: toNum(r.posted_qty),
      postedValue: toNum(r.posted_value),
      aging: r.aging || null,
    });
  }
  return map;
}

// Four deterministic states — the whole point of this section is telling
// "genuinely out of stock" apart from "still has stock, just not posted"
// apart from "posted and still has stock" (all legitimately different
// business situations), and never silently treating a missing inventory
// match as zero stock.
function stockStatus(inv) {
  if (!inv) return "UNKNOWN STOCK";
  if (inv.stockQty <= 0) return "OUT OF STOCK";
  if (inv.postedQty <= 0) return "HAS STOCK / NOT POSTED";
  return "HAS STOCK";
}

export default async function handler(req, res) {
  try {
    const { channel = "All Channels", from = "", to = "" } = req.query;
    // No explicit `range`: an explicit from/to (regression tests, older
    // links) behaves as "custom"; otherwise default to Week to Date.
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];
    const bucketGranularity = req.query.bucketGranularity === "month" ? "month" : "week";

    let current;
    let previous;
    try {
      ({ current, previous } = resolveRange(range, from, to));
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const [wk1, wk2, wk3, wk4] =
      bucketGranularity === "month" ? monthlyBucketsEndingAt(current.to) : weeklyBucketsEndingAt(current.to);

    // KPIs — one bounded scan covering both windows, conditionally
    // aggregated. GMV = SUM(net_sales_amount) where net_sales_amount > 0
    // (returns already carry a negative net_sales_amount in this mart, so
    // this is gross sales value only). NMV = SUM(net_sales_amount) with no
    // filter (net of returns). Units = SUM(net_quantity) gated the same way
    // as GMV. Orders = distinct invoice_id on the same gross-sale rows.
    // Every formula here reconciled exactly against a known historical
    // week (see commit message / PR description for the reconciliation).
    const kpiRows = await (
      await client.query({
        query: `
          SELECT
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_sales_amount, transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_nmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_orders,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
            sumIf(net_sales_amount, transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_nmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units,
            uniqExactIf(invoice_id, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_orders,
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

    // Repeat Sellers — canonical key `ct.item_id` (the literal dot requires
    // backticks) with positive GMV in >= 2 of the last 4 buckets, either 4
    // real 7-day weeks or 4 calendar months ending "today" per the
    // bucketGranularity toggle (see weeklyBucketsEndingAt/
    // monthlyBucketsEndingAt) — independent of the page's selected range
    // preset either way. Prior/Current-Period Sales and Units are Wk3/Wk4
    // directly, NOT the page-level current/previous window (which for
    // MTD/YTD can span months and wouldn't mean anything as a per-bucket
    // figure). product_name/category_name/barcode picked via argMax/any — display only, never
    // the join/group key.
    //
    // coalesce(sumIf(...), 0) is load-bearing, not decoration: sumIf over a
    // Nullable column returns NULL (not 0) when zero rows match, and
    // NULL > 0 is NULL — so summing four such NULL-capable comparisons with
    // "+" silently propagates NULL through the whole HAVING expression the
    // moment ANY one week has no sales. That was hiding true repeat sellers
    // for every channel (confirmed against real data: coalescing raised
    // HMRPH Online 0->26, TikTok 9->57, Shopee 0->3 for the same window).
    const repeatRows = await (
      await client.query({
        query: `
          SELECT
            \`ct.item_id\` AS item_id,
            any(barcode) AS barcode,
            argMax(product_name, transaction_date) AS product_name,
            argMax(category_name, transaction_date) AS category_name,
            coalesce(sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {wk1From:String} AND {wk1To:String}), 0) AS wk1_gmv,
            coalesce(sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {wk2From:String} AND {wk2To:String}), 0) AS wk2_gmv,
            coalesce(sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {wk3From:String} AND {wk3To:String}), 0) AS wk3_gmv,
            coalesce(sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {wk4From:String} AND {wk4To:String}), 0) AS wk4_gmv,
            coalesce(sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {wk4From:String} AND {wk4To:String}), 0) AS wk4_units
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_date BETWEEN {wk1From:String} AND {wk4To:String}
            AND \`ct.item_id\` IS NOT NULL
          GROUP BY \`ct.item_id\`
          HAVING (wk1_gmv > 0) + (wk2_gmv > 0) + (wk3_gmv > 0) + (wk4_gmv > 0) >= 2
          ORDER BY wk4_gmv DESC
          LIMIT 500
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
    // Products and Dropped Products, unpaged, so a dropped item (current
    // GMV = 0) isn't cut off by a "top N" limit before we can classify it.
    // previousUnits is computed and carried straight through to both
    // consumers below — never hardcoded to 0.
    const comparisonRows = await (
      await client.query({
        query: `
          SELECT
            \`ct.item_id\` AS item_id,
            any(barcode) AS barcode,
            argMax(product_name, transaction_date) AS product_name,
            argMax(category_name, transaction_date) AS category_name,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_gmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {curFrom:String} AND {curTo:String}) AS cur_units,
            sumIf(net_sales_amount, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_gmv,
            sumIf(net_quantity, net_sales_amount > 0 AND transaction_date BETWEEN {prevFrom:String} AND {prevTo:String}) AS prev_units
          FROM xv3.mart_net_sales
          WHERE store_name = {store:String}
            AND sales_channel IN {channels:Array(String)}
            AND transaction_date BETWEEN {prevFrom:String} AND {curTo:String}
            AND \`ct.item_id\` IS NOT NULL
          GROUP BY \`ct.item_id\`
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

    // ClickHouse's JSONEachRow format returns Int64 columns as strings (to
    // avoid JS number-precision loss on large values) — coerce back to a
    // real number here so the client serializes this as Array(Int64), not
    // a quoted-string array ClickHouse then rejects.
    const allItemIds = Array.from(
      new Set(
        [...repeatRows.map((r) => r.item_id), ...comparisonRows.map((r) => r.item_id)]
          .filter((v) => v !== null && v !== undefined)
          .map((v) => Number(v)),
      ),
    );
    const inventoryMap = await fetchInventory(allItemIds);

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
      const inv = inventoryMap.get(String(r.item_id));
      return {
        sku: r.barcode,
        product: r.product_name,
        category: r.category_name || null,
        wk1Sales: wk1Gmv,
        wk2Sales: wk2Gmv,
        wk3Sales: wk3Gmv,
        wk4Sales: wk4Gmv,
        units: toNum(r.wk4_units),
        trend,
        currentStockQty: inv ? inv.stockQty : null,
        currentStockValue: inv ? inv.stockValue : null,
      };
    });

    const comparisons = comparisonRows.map((r) => {
      const inv = inventoryMap.get(String(r.item_id));
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
        postedQty: inv ? inv.postedQty : null,
      };
    });

    // Capped at 500 (safety net, not a "top N" truncation) — the frontend
    // paginates the full list it receives, 10 rows/page, so this only needs
    // to be far above any realistic per-store SKU count, not exactly 10/20.
    const topProducts = comparisons
      .filter((r) => r.currentGmv > 0)
      .sort((a, b) => b.currentGmv - a.currentGmv)
      .slice(0, 500)
      .map(({ postedQty: _postedQty, ...rest }) => rest);

    const droppedProducts = comparisons
      .filter((r) => r.currentGmv <= 0 && r.previousGmv > 0)
      .sort((a, b) => b.previousGmv - a.previousGmv)
      .slice(0, 500)
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
        status: stockStatus(
          r.currentStockQty !== null ? { stockQty: r.currentStockQty, postedQty: r.postedQty } : null,
        ),
      }));

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        channel,
        range,
        current,
        previous,
        bucketGranularity,
        periodBuckets: { wk1, wk2, wk3, wk4 },
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
