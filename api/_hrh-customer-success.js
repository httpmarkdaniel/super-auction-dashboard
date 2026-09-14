import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (see api/_hrh-traffic-analytics.js's comment) —
// dispatched from api/hrh-sales-analytics.js via ?report=customerSuccess.
//
// Source: xv3.mart_sales_customer_tracking — a customer-inquiry/support
// log (chatbot, Facebook, TikTok, Instagram, Viber, calls, etc.), not a
// sales table. It has no store_name or sales_channel column at all — its
// own "source_(online_store)" field is the COMMUNICATION channel an
// inquiry came in on (e.g. "Tiktok" meaning "someone messaged us on
// TikTok"), which is a different concept from the dashboard-wide
// Channel filter's HMRPH Online/TikTok/Shopee sales-channel scope, and
// would be misleading to conflate with it. So this page respects the
// Date Range filter (date_reported) but ignores the Channel filter
// entirely — there is nothing in this table to filter by.
function safeDivide(a, b) {
  return b ? a / b : 0;
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function manilaTodayISODate() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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
    return { from, to };
  }
  if (range === "mtd") return { from: firstOfMonthISO(today), to: today };
  if (range === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  // Full prior calendar week/month/year — NOT "to date" (see the shared
  // preset added to src/hrh-online/dateRange.js): Previous Week is
  // Monday-Sunday of the week before this one; Previous Month is the 1st
  // through the last day of the month before this one; Previous Year is
  // Jan 1 - Dec 31 of last year.
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

// Free-text fields (concern/inquiry category, product/item) come in with
// inconsistent casing ("inquiry" / "Inquiry" / "INQUIRY") — normalized to
// Title Case so case variants of the same label merge, without hardcoding
// a fixed category enum (the raw values aren't a small fixed set).
function titleCase(s) {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export async function handleCustomerSuccess(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    let range_;
    try {
      range_ = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const rows = await (
      await client.query({
        query: `
          SELECT
            date_reported AS d,
            name,
            \`source_(online_store)\` AS source,
            \`product___item\` AS product,
            \`concern___inquiry\` AS concern,
            remarks,
            status,
            \`detailed_concern___message\` AS detail
          FROM xv3.mart_sales_customer_tracking
          WHERE date_reported BETWEEN {from:String} AND {to:String}
          ORDER BY date_reported
        `,
        query_params: { from: range_.from, to: range_.to },
        format: "JSONEachRow",
      })
    ).json();

    const total = rows.length;
    const statusCounts = new Map();
    const sourceCounts = new Map();
    const concernCounts = new Map();
    const productCounts = new Map();
    const byDate = new Map();
    const needsAttention = [];

    for (const r of rows) {
      const date = r.d ? String(r.d).slice(0, 10) : null;
      const status = r.status ? r.status.trim() : "Unknown";
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

      const source = r.source ? titleCase(r.source) : "Unknown";
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);

      if (r.concern) {
        const concern = titleCase(r.concern);
        concernCounts.set(concern, (concernCounts.get(concern) || 0) + 1);
      }
      if (r.product) {
        const product = titleCase(r.product);
        productCounts.set(product, (productCounts.get(product) || 0) + 1);
      }

      if (date) {
        if (!byDate.has(date)) byDate.set(date, { date, total: 0, resolved: 0, didNotRespond: 0 });
        const bucket = byDate.get(date);
        bucket.total += 1;
        if (status === "Resolved") bucket.resolved += 1;
        if (status === "Did not respond") bucket.didNotRespond += 1;
      }

      if (status !== "Resolved") {
        needsAttention.push({
          date,
          name: r.name || "—",
          source,
          product: r.product || "—",
          concern: r.concern ? titleCase(r.concern) : "—",
          remarks: r.remarks || "—",
          status,
        });
      }
    }

    const resolvedCount = statusCounts.get("Resolved") || 0;
    const didNotRespondCount = statusCounts.get("Did not respond") || 0;
    const escalatedCount = statusCounts.get("Escalated") || 0;
    const pendingCount = statusCounts.get("Pending") || 0;

    const STATUS_ORDER = ["Resolved", "Did not respond", "Pending", "Escalated", "Unknown"];
    const statusBreakdown = STATUS_ORDER.map((s) => ({ status: s, count: statusCounts.get(s) || 0 })).filter((s) => s.count > 0);

    const sourceBreakdown = Array.from(sourceCounts, ([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
    const concernCategories = Array.from(concernCounts, ([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    const topProducts = Array.from(productCounts, ([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const trend = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

    needsAttention.sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1);

    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      meta: {
        range,
        current: { from: range_.from, to: range_.to },
        scopeNote:
          "HMR-wide customer inquiries (chatbot, social media, calls) — not scoped by store or the Channel filter above, since this source has no channel/store field.",
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        totalInquiries: { value: total },
        resolvedRate: { value: safeDivide(resolvedCount, total) * 100, sub: `${resolvedCount} resolved` },
        didNotRespondRate: { value: safeDivide(didNotRespondCount, total) * 100, sub: `${didNotRespondCount} inquiries` },
        pending: { value: pendingCount },
        escalated: { value: escalatedCount },
      },
      statusBreakdown,
      sourceBreakdown,
      concernCategories,
      topProducts,
      trend,
      needsAttention,
      dataQuality: [
        "This source has no store_name or sales_channel column, so it can't be scoped by the page's Channel filter — the counts above are HMR-wide, not HRH Online-specific.",
        "Concern/inquiry and product/item categories are free text with inconsistent capitalization — normalized to Title Case so case variants merge, but this isn't a fixed enum of categories.",
        `${rows.filter((r) => !r.status).length} rows have no status logged — counted as "Unknown", not assumed resolved.`,
        "8 rows have no date_reported at all and are excluded from every date-filtered view here (can't be placed in a period), regardless of the selected Date Range.",
      ],
    });
  } catch (err) {
    console.error("HRH Customer Success API error:", err);
    return res.status(500).json({
      error: "Failed to load HRH Online Customer Success data",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
