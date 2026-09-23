import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) — the
// Vercel project's Hobby plan caps deployments at 12 Serverless Functions.
// api/hrh-sales-analytics.js dispatches here on `?report=markdownAnalytics`.
//
// REBUILT 2026-09-17 to match a full reference mockup (public/markdown.png)
// — the prior version was a pure INVENTORY SNAPSHOT (no Date Range/Channel
// awareness) because the only markdown signal found at the time was
// mart_level_of_inventory's original_price vs current_srp, with no price-
// change timestamp, so no time-series/period view was possible.
//
// That was incomplete: xv3.mart_net_sales (the real transaction ledger)
// ALSO carries original_price/unit_price/discount_amt/discount_perc PER
// SALE, plus its own category_name — verified against production: 954 of
// 25,783 real HRH Online sales (Feb 25 - Sep 16, 2026) carry a real
// discount_perc > 0, and net_sales_amount = original_price * (1 -
// discount_perc/100) holds exactly for those rows (e.g. ₱1,499 @ 10% ->
// ₱1,349.10). This is a GENUINE per-transaction markdown signal, unrelated
// to cms.mart_cms_voucher_report's voucher/coupon discounts (a separate
// mechanism already used by Sales Analytics' voucher panels). This lets
// the page now be real, Date-Range/Channel-aware PERIOD sales data — not
// just an always-"as of now" snapshot.
//
// GROSS MARGIN % IS NOT COMPUTABLE, AND DELIBERATELY OMITTED. The mockup
// shows a Gross Margin % throughout; this was attempted using
// mart_level_of_inventory's item_cost joined by product id, then rejected
// after checking real values: item_cost consistently EQUALS
// original_price/current_srp (e.g. "Crofton Steak Knife 4 Piece Set":
// item_cost=499, original_price=499, current_srp=199.60 after an actual
// 60% markdown) rather than a real wholesale/acquisition cost — so
// "margin" computed from it is really just "how much we discounted",
// duplicating avg markdown % under a misleading label. g_final_landed_cost
// was also checked and rejected: its values (e.g. ₱3,586,001 on a single
// item_qty=1 row) are obviously not a per-unit cost either. Every place
// the mockup shows Gross Margin %, this version shows Discount Value (₱ —
// sum of the real discount_amt field) instead, which IS genuine.
//
// Two data sources, used for different things:
//   1. xv3.mart_net_sales (this period's real markdown SALES: trend, band/
//      category sales performance, regular-vs-markdown comparison) — has
//      its own category_name, no join needed.
//   2. xv3.mart_level_of_inventory (CURRENT stock snapshot: sell-through
//      denominators, inventory value/age, Top Opportunities) — same table
//      the prior version used, still the only source for "what's on the
//      shelf right now."
const HRH_STORE = "HRH ONLINE";
const CHANNEL_MAP = {
  "All Channels": ["HMRPH ONLINE", "TIKTOK", "SHOPEE"],
  "HMRPH Online": ["HMRPH ONLINE"],
  TikTok: ["TIKTOK"],
  Shopee: ["SHOPEE"],
};
const MARKED_DOWN_SNAPSHOT = "original_price IS NOT NULL AND current_srp IS NOT NULL AND original_price > current_srp";

// Same 6 discount-depth bands as the reference mockup's "Sales by Markdown
// Band" panel, applied consistently everywhere a band grouping is needed
// (band performance table, heatmap columns, Sales vs Discount Given by
// Band) so every panel reads the same 6 buckets.
const BANDS = [
  { label: "0-10%", min: 0, max: 10 },
  { label: "11-20%", min: 10, max: 20 },
  { label: "21-30%", min: 20, max: 30 },
  { label: "31-40%", min: 30, max: 40 },
  { label: "41-50%", min: 40, max: 50 },
  { label: "50%+", min: 50, max: Infinity },
];
function bandFor(pct) {
  for (const b of BANDS) {
    if (pct > b.min && pct <= b.max) return b.label;
  }
  return pct <= 0 ? BANDS[0].label : "50%+";
}
// Same 5 age buckets as the mockup's "Inventory Aging x Markdown Heatmap".
const AGE_BUCKETS = [
  { label: "0-30 days", min: -Infinity, max: 30 },
  { label: "31-60 days", min: 30, max: 60 },
  { label: "61-90 days", min: 60, max: 90 },
  { label: "91-180 days", min: 90, max: 180 },
  { label: "180+ days", min: 180, max: Infinity },
];
function ageBucketFor(days) {
  for (const b of AGE_BUCKETS) {
    if (days > b.min && days <= b.max) return b.label;
  }
  return "180+ days";
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDivide(a, b) {
  return b ? a / b : 0;
}
function pctDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------------
// Date math — same resolveRange/resolveComparisonWindow logic as every
// other api/_hrh-*.js file (see api/_hrh-customer-analytics.js), duplicated
// per this codebase's "each file keeps its own small self-contained date
// helpers" convention.
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
function resolveRange(range, fromParam, toParam) {
  const today = manilaTodayISODate();
  if (range === "custom") {
    if (!fromParam || !toParam) throw new RangeError("Custom range requires both from and to");
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { from, to };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (range === "prevWeek") {
    const thisWeekMonday = mondayOfWeek(today);
    return { from: addDaysISO(thisWeekMonday, -7), to: addDaysISO(thisWeekMonday, -1) };
  }
  if (range === "prevMonth") {
    const lastDayPrevMonth = addDaysISO(firstOfMonthISO(today), -1);
    return { from: firstOfMonthISO(lastDayPrevMonth), to: lastDayPrevMonth };
  }
  if (range === "prevYear") {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: mondayOfWeek(today), to: today }; // wtd (default)
}
function resolveComparisonWindow(current, compareTo) {
  const { from, to } = current;
  if (compareTo === "day") return { from: addDaysISO(from, -1), to: addDaysISO(to, -1) };
  if (compareTo === "month") return { from: shiftMonthsClampedISO(from, -1), to: shiftMonthsClampedISO(to, -1) };
  return { from: addDaysISO(from, -7), to: addDaysISO(to, -7) }; // "week" (default)
}
function enumerateDatesISO(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}
function formatDateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Per (date, category, is_markdown) rows for a window — the one query
// shape every sales-side panel derives from (trend, band performance,
// category performance, the regular-vs-markdown comparison table).
// discount_amt is summed directly (real, verified field: original_price *
// discount_perc/100 exactly) rather than derived — no join needed since
// mart_net_sales carries its own category_name.
async function fetchSalesRows(from, to, channels) {
  const rows = await (
    await client.query({
      query: `
        SELECT
          toString(toDate(transaction_date)) AS d,
          (discount_perc > 0) AS is_markdown,
          coalesce(nullIf(category_name, ''), 'Uncategorized') AS category,
          sum(net_sales_amount) AS sales,
          sum(net_quantity) AS units,
          sumIf(discount_perc * net_quantity, discount_perc > 0) AS pct_weighted,
          sumIf(discount_amt, discount_perc > 0) AS discount_value
        FROM xv3.mart_net_sales
        WHERE store_name = {store:String}
          AND sales_channel IN {channels:Array(String)}
          AND net_sales_amount > 0
          AND transaction_date BETWEEN {from:String} AND {to:String}
        GROUP BY d, is_markdown, category
      `,
      query_params: { store: HRH_STORE, channels, from, to },
      format: "JSONEachRow",
    })
  ).json();
  return rows.map((r) => ({
    d: r.d,
    isMarkdown: !!Number(r.is_markdown),
    category: r.category,
    sales: toNum(r.sales),
    units: toNum(r.units),
    pctWeighted: toNum(r.pct_weighted),
    discountValue: toNum(r.discount_value),
  }));
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + r[field], 0);
}
function weightedAvgPct(rows) {
  const units = sumField(rows, "units");
  return units > 0 ? sumField(rows, "pctWeighted") / units : 0;
}

export async function handleMarkdownAnalytics(req, res) {
  try {
    const { channel = "All Channels", from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");
    const compareTo = ["day", "week", "month"].includes(req.query.compareTo) ? req.query.compareTo : "week";
    const channels = CHANNEL_MAP[channel] || CHANNEL_MAP["All Channels"];

    let current;
    try {
      current = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }
    const previous = resolveComparisonWindow(current, compareTo);

    // 4 independent queries — 2 sales-side (current fine-grain, previous
    // coarse totals), 2 inventory-snapshot-side (stock split, per-unit rows
    // for the aging heatmap) — none depends on another's result.
    const [curSalesRows, prevSalesRows, stockSplitRows, agingRows] = await Promise.all([
      fetchSalesRows(current.from, current.to, channels),
      fetchSalesRows(previous.from, previous.to, channels),
      // Current stock split by TODAY's markdown status (original_price vs
      // current_srp) — the sell-through denominator side. This is a live
      // snapshot (same "as of right now" contract as the old version, no
      // Date Range dependency), so there is no meaningful "previous"
      // version of it to compare against.
      client
        .query({
          query: `
            SELECT
              ${MARKED_DOWN_SNAPSHOT} AS is_md,
              sum(item_qty) AS stock_qty,
              sum(total_current_srp) AS stock_value
            FROM xv3.mart_level_of_inventory
            WHERE store_name = {store:String} AND item_qty > 0
            GROUP BY is_md
          `,
          query_params: { store: HRH_STORE },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      // Per-BARCODE rows (not aggregated by product) for currently
      // marked-down, in-stock units — feeds the Aging x Markdown heatmap,
      // Inventory Value by Age, per-band/per-category stock, Inventory
      // Value at Risk, and Top Markdown Opportunities. Same per-row grain
      // the prior version's Markdown Products table already used.
      client
        .query({
          query: `
            SELECT
              product_name,
              coalesce(nullIf(category_name, ''), 'Uncategorized') AS category,
              item_qty,
              total_current_srp,
              current_srp,
              date_received,
              total_qty_sold,
              (original_price - current_srp) / nullIf(original_price, 0) * 100 AS markdown_pct,
              dateDiff('day', date_received, now()) AS age_days
            FROM xv3.mart_level_of_inventory
            WHERE store_name = {store:String} AND item_qty > 0 AND ${MARKED_DOWN_SNAPSHOT} AND date_received IS NOT NULL
          `,
          query_params: { store: HRH_STORE },
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    const aging = agingRows.map((r) => ({
      product: r.product_name || "—",
      category: r.category,
      stockQty: toNum(r.item_qty),
      stockValue: toNum(r.total_current_srp),
      currentSrp: toNum(r.current_srp),
      markdownPct: toNum(r.markdown_pct),
      ageDays: toNum(r.age_days),
      lifetimeQtySold: toNum(r.total_qty_sold),
      band: bandFor(toNum(r.markdown_pct)),
      ageBucket: ageBucketFor(toNum(r.age_days)),
    }));

    const stockMd = stockSplitRows.find((r) => Number(r.is_md) === 1) || {};
    const stockReg = stockSplitRows.find((r) => Number(r.is_md) === 0) || {};
    const mdStockQty = toNum(stockMd.stock_qty);
    const regStockQty = toNum(stockReg.stock_qty);

    // -------------------- KPIs + comparison table (sales side) --------------------
    const curMd = curSalesRows.filter((r) => r.isMarkdown);
    const curReg = curSalesRows.filter((r) => !r.isMarkdown);
    const prevMd = prevSalesRows.filter((r) => r.isMarkdown);
    const prevReg = prevSalesRows.filter((r) => !r.isMarkdown);

    const curMdSales = sumField(curMd, "sales");
    const curMdUnits = sumField(curMd, "units");
    const curMdDiscountValue = sumField(curMd, "discountValue");
    const curRegSales = sumField(curReg, "sales");
    const curRegUnits = sumField(curReg, "units");
    const curTotalSales = curMdSales + curRegSales;
    const curMdAvgPct = weightedAvgPct(curMd);

    const prevMdSales = sumField(prevMd, "sales");
    const prevMdUnits = sumField(prevMd, "units");
    const prevMdDiscountValue = sumField(prevMd, "discountValue");
    const prevRegSales = sumField(prevReg, "sales");
    const prevTotalSales = prevMdSales + prevRegSales;
    const prevMdAvgPct = weightedAvgPct(prevMd);
    const prevMdGmvPct = safeDivide(prevMdSales, prevTotalSales) * 100;

    const curMdGmvPct = safeDivide(curMdSales, curTotalSales) * 100;

    // Sell-Through Rate = period units sold / (period units sold + current
    // stock on hand of that same segment) — a standard retail sell-through
    // formula that only needs real, already-available numbers. Snapshot-
    // only on the denominator side, so there is no meaningful "previous
    // period" version — current stock is always "as of right now."
    const mdSellThrough = safeDivide(curMdUnits, curMdUnits + mdStockQty) * 100;
    const regSellThrough = safeDivide(curRegUnits, curRegUnits + regStockQty) * 100;

    // Inventory Value at Risk — currently marked-down stock that's ALSO
    // been sitting 61+ days. Snapshot-only, same reasoning as above.
    const atRiskValue = aging.filter((a) => a.ageDays >= 61).reduce((s, a) => s + a.stockValue, 0);

    // ------------------------------ Trend (current period, daily) ------------------------------
    const trendByDate = new Map();
    for (const r of curMd) {
      const t = trendByDate.get(r.d) || { sales: 0, units: 0, pctWeighted: 0, discountValue: 0 };
      t.sales += r.sales;
      t.units += r.units;
      t.pctWeighted += r.pctWeighted;
      t.discountValue += r.discountValue;
      trendByDate.set(r.d, t);
    }
    const trend = enumerateDatesISO(current.from, current.to).map((d) => {
      const t = trendByDate.get(d) || { sales: 0, units: 0, pctWeighted: 0, discountValue: 0 };
      return {
        date: d,
        label: formatDateLabel(d),
        markdownSales: t.sales,
        avgMarkdownPct: safeDivide(t.pctWeighted, t.units),
        discountValue: t.discountValue,
      };
    });

    // ------------------------------ Band performance (6 bands) ------------------------------
    // Bands are assigned from each SALE's own discount_perc (real,
    // transaction-level, historical) for the sales-side columns; the
    // current-stock denominator for Sell-Through uses that item's CURRENT
    // snapshot markdown %, which can differ if the discount has changed
    // since. A real approximation, documented in dataQuality, not hidden.
    const bandSales = new Map(BANDS.map((b) => [b.label, { sales: 0, units: 0, discountValue: 0, pctWeighted: 0 }]));
    for (const r of curMd) {
      const rowAvgPct = safeDivide(r.pctWeighted, r.units);
      const b = bandSales.get(bandFor(rowAvgPct));
      b.sales += r.sales;
      b.units += r.units;
      b.discountValue += r.discountValue;
      b.pctWeighted += r.pctWeighted;
    }
    const bandStock = new Map(BANDS.map((b) => [b.label, { qty: 0, value: 0 }]));
    for (const a of aging) {
      const s = bandStock.get(a.band);
      s.qty += a.stockQty;
      s.value += a.stockValue;
    }
    const bandPerformance = BANDS.map((b, i) => {
      const s = bandSales.get(b.label);
      const stock = bandStock.get(b.label);
      return {
        band: b.label,
        bandIndex: i,
        sales: s.sales,
        units: s.units,
        avgMarkdownPct: safeDivide(s.pctWeighted, s.units),
        discountValue: s.discountValue,
        sellThroughRate: safeDivide(s.units, s.units + stock.qty) * 100,
        stockValue: stock.value,
      };
    });

    // ------------------------------ Aging x Markdown heatmap ------------------------------
    const heatmapCells = new Map();
    for (const a of aging) {
      const key = `${a.ageBucket}|${a.band}`;
      heatmapCells.set(key, (heatmapCells.get(key) || 0) + a.stockValue);
    }
    const heatmap = {
      ageBuckets: AGE_BUCKETS.map((b) => b.label),
      bands: BANDS.map((b) => b.label),
      grid: AGE_BUCKETS.map((ab) => BANDS.map((b) => heatmapCells.get(`${ab.label}|${b.label}`) || 0)),
    };
    const inventoryValueByAge = AGE_BUCKETS.map((ab) => {
      const row = { ageBucket: ab.label };
      for (const b of BANDS) row[b.label] = heatmapCells.get(`${ab.label}|${b.label}`) || 0;
      return row;
    });

    // ------------------------------ Category performance ------------------------------
    const categorySales = new Map();
    for (const r of curMd) {
      const c = categorySales.get(r.category) || { sales: 0, units: 0, discountValue: 0, pctWeighted: 0 };
      c.sales += r.sales;
      c.units += r.units;
      c.discountValue += r.discountValue;
      c.pctWeighted += r.pctWeighted;
      categorySales.set(r.category, c);
    }
    const categoryStock = new Map();
    for (const a of aging) {
      const c = categoryStock.get(a.category) || { qty: 0, value: 0 };
      c.qty += a.stockQty;
      c.value += a.stockValue;
      categoryStock.set(a.category, c);
    }
    const categoryNames = new Set([...categorySales.keys(), ...categoryStock.keys()]);
    const categoryPerformance = [...categoryNames]
      .map((category) => {
        const s = categorySales.get(category) || { sales: 0, units: 0, discountValue: 0, pctWeighted: 0 };
        const stock = categoryStock.get(category) || { qty: 0, value: 0 };
        return {
          category,
          sales: s.sales,
          units: s.units,
          avgMarkdownPct: safeDivide(s.pctWeighted, s.units),
          discountValue: s.discountValue,
          sellThroughRate: safeDivide(s.units, s.units + stock.qty) * 100,
          inventoryValue: stock.value,
        };
      })
      .filter((c) => c.sales > 0 || c.inventoryValue > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 12);

    // ------------------------------ Top Markdown Opportunities ------------------------------
    // Per-row (barcode) sell-through uses its CATEGORY's overall sell-
    // through rate as the best available real proxy — mart_net_sales'
    // item id isn't carried through to these inventory rows at this grain,
    // so a true per-SKU sell-through isn't available here (documented in
    // dataQuality, not hidden).
    const categorySellThrough = new Map(categoryPerformance.map((c) => [c.category, c.sellThroughRate]));
    const ACTION_THRESHOLDS = { review: 15, monitor: 40 }; // %, a suggested triage heuristic, not an official HMR policy
    function actionFor(sellThrough) {
      if (sellThrough < ACTION_THRESHOLDS.review) return "Review";
      if (sellThrough < ACTION_THRESHOLDS.monitor) return "Monitor";
      return "Effective";
    }
    const topOpportunities = [...aging]
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 25)
      .map((a) => {
        const sellThrough = categorySellThrough.get(a.category) ?? 0;
        return {
          product: a.product,
          ageDays: a.ageDays,
          stock: a.stockQty,
          currentPrice: a.currentSrp,
          markdownPct: a.markdownPct,
          sellThroughRate: sellThrough,
          inventoryValue: a.stockValue,
          action: actionFor(sellThrough),
        };
      });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      meta: {
        channel,
        range,
        compareTo,
        current,
        previous,
        generatedAt: new Date().toISOString(),
        methodologyNote:
          "Markdown Sales/Units/Trend/Band/Category figures are real period sales from xv3.mart_net_sales, using each sale's own discount_perc/discount_amt (genuine per-transaction fields, separate from voucher/coupon discounts). Sell-Through Rate, Inventory Value, the Aging x Markdown heatmap, and Top Opportunities are a live inventory snapshot (xv3.mart_level_of_inventory, original_price vs current_srp) — always \"as of right now,\" independent of the Date Range filter, so these have no period-over-period delta.",
        dataQuality: [
          "Gross Margin % is NOT shown anywhere on this page, unlike the reference mockup — item_cost (the only cost-like field on mart_level_of_inventory) was checked against real values and found to equal original_price/SRP, not a real acquisition cost (e.g. one product: item_cost=₱499=original_price, current_srp=₱199.60 after an actual 60% markdown). g_final_landed_cost was also checked and rejected (implausible per-unit values, e.g. ₱3.5M on a single unit). Every place the mockup shows Margin %, this page shows Discount Value (₱, the real discount_amt field) instead.",
          "Sales by Markdown Band / Markdown Efficiency mix two timeframes per band: sales figures use each SALE's own historical discount_perc, while the stock/sell-through denominator uses that item's CURRENT markdown %, which can differ if the discount has changed since. A real approximation, not a bug.",
          "Top Markdown Opportunities' Sell-Through Rate is its CATEGORY's overall sell-through rate, not a true per-item rate — mart_net_sales' item id isn't carried through to individual inventory rows at this grain, so a precise per-SKU figure isn't available. Action (Review/Monitor/Effective) is a suggested triage heuristic (<15% / 15-40% / 40%+ sell-through), not an official HMR policy.",
          "This page does not yet expose the mockup's extra Category/Subcategory/Brand/Supplier/Inventory Age/Markdown Band filter row — only the dashboard-wide Date Range and Channel filters apply. Flagged as a scope decision, not an oversight.",
        ],
      },
      kpis: {
        markdownSales: { value: curMdSales, previous: prevMdSales, delta: pctDelta(curMdSales, prevMdSales) },
        markdownUnits: { value: curMdUnits, previous: prevMdUnits, delta: pctDelta(curMdUnits, prevMdUnits) },
        avgMarkdownPct: { value: curMdAvgPct, previous: prevMdAvgPct, delta: pctDelta(curMdAvgPct, prevMdAvgPct) },
        markdownGmvPct: { value: curMdGmvPct, previous: prevMdGmvPct, delta: pctDelta(curMdGmvPct, prevMdGmvPct) },
        sellThroughRate: { value: mdSellThrough, previous: null, delta: null },
        discountValue: { value: curMdDiscountValue, previous: prevMdDiscountValue, delta: pctDelta(curMdDiscountValue, prevMdDiscountValue) },
        inventoryValueAtRisk: { value: atRiskValue, previous: null, delta: null },
      },
      trend,
      priceComparison: {
        regular: {
          sales: curRegSales,
          units: curRegUnits,
          avgSellingPrice: safeDivide(curRegSales, curRegUnits),
          discountValue: 0,
          sellThroughRate: regSellThrough,
          shareOfTotal: safeDivide(curRegSales, curTotalSales) * 100,
        },
        markdown: {
          sales: curMdSales,
          units: curMdUnits,
          avgSellingPrice: safeDivide(curMdSales, curMdUnits),
          discountValue: curMdDiscountValue,
          sellThroughRate: mdSellThrough,
          shareOfTotal: curMdGmvPct,
        },
      },
      bandPerformance,
      heatmap,
      inventoryValueByAge,
      categoryPerformance,
      topOpportunities,
    });
  } catch (err) {
    console.error("HRH Markdown Analytics API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Markdown Analytics data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
