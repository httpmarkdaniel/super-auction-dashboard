import { BetaAnalyticsDataClient } from "@google-analytics/data";

// Underscore-prefixed (like every other api/_hrh-*.js file) so Vercel does
// NOT deploy this as its own Serverless Function — see
// api/_hrh-traffic-analytics.js's file-header comment for why.
// api/hrh-sales-analytics.js dispatches to `handleSearchKeywords` here when
// `?report=searchKeywords` is present.
//
// Direct Google Analytics Data API integration (2026-09-23) — deliberately
// NOT going through ClickHouse/Airbyte like every other GA4-derived number
// on this dashboard. Reason: the Airbyte GA4 sync only pulls a fixed set of
// pre-built reports (page paths, traffic acquisition, etc.), none of which
// carry GA4's `searchTerm` dimension — the literal text customers typed
// into HRH Online's on-site search bar. Adding it to the Airbyte sync is an
// external config change outside this codebase, so per explicit request
// this page queries GA4 live instead, authenticated via a dedicated service
// account (hrh-online-search-keywords@ga4-analytics-493903.iam.gserviceaccount.com,
// granted Viewer on this property in GA4 Admin — Property Access
// Management on 2026-09-23). This means search-keyword data has NO
// Airbyte ETL lag at all (unlike every other GA4 number on this dashboard),
// and needs its own credentials (GA4_SERVICE_ACCOUNT_EMAIL/
// GA4_SERVICE_ACCOUNT_PRIVATE_KEY in .env.local / Vercel env vars) rather
// than reusing the CLICKHOUSE_* ones.
//
// Same GA4 property as api/_hrh-traffic-analytics.js's GA4_PROPERTY_ID, but
// DELIBERATELY NOT scoped to ONP_PAGE_PATHS the way that file's page-view
// numbers are. Investigated 2026-09-23: the search results page is a
// single shared page (pagePath "/search") used site-wide by every branch,
// not something unique to HRH Online's storefront — checking the referrer
// of every view_search_results event, only ~11 of 1,531 total searches
// (Jan-Sep 2026) came from someone browsing /shop/ONP or
// /search/stores/ONP right before searching. There is no dimension that
// cleanly attributes a search to one store the way pagePath does for page
// views, so per explicit decision this reports EVERY search site-wide,
// not an HRH-Online-only slice.
const GA4_PROPERTY_ID = "314716873";

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) {
    throw new Error("GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY are not configured");
  }
  cachedClient = new BetaAnalyticsDataClient({
    credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
  });
  return cachedClient;
}

function manilaTodayISODate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
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

// Same range vocabulary (wtd/mtd/ytd/custom) as the rest of HRH Online —
// no "previous period" comparison needed here, this is a flat keyword list.
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
  return { from: mondayOfWeek(today), to: today };
}

export async function handleSearchKeywords(req, res) {
  try {
    const { from = "", to = "" } = req.query;
    const range = req.query.range || (from && to ? "custom" : "wtd");

    let dateRange;
    try {
      dateRange = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const client = getClient();
    const [report] = await client.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      dimensions: [{ name: "searchTerm" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "view_search_results" } },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 5000,
    });

    const rows = (report.rows || [])
      .map((r) => ({
        keyword: r.dimensionValues[0].value,
        searches: Number(r.metricValues[0].value || 0),
        users: Number(r.metricValues[1].value || 0),
      }))
      .filter((r) => r.keyword && r.keyword !== "(not set)");

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      meta: {
        property: GA4_PROPERTY_ID,
        range: dateRange,
        scopeNote: "Site-wide on-site search terms (hmr.ph/search) across every branch — not HRH-Online-exclusive, since the search page itself isn't scoped per store. Live from the GA4 Data API, not the ClickHouse/Airbyte copy, so this has no ETL sync lag.",
      },
      rows,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load search keywords", message: err instanceof Error ? err.message : String(err) });
  }
}
