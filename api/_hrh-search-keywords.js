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
// Same GA4 property as api/_hrh-traffic-analytics.js's GA4_PROPERTY_ID.
// Investigated 2026-09-23: the search results page is a single shared page
// (pagePath "/search") used site-wide by every branch, not something
// unique to any one storefront — there is no dimension that cleanly
// attributes a search to one store the way pagePath does for page views.
// Default (no `store` param) reports EVERY search site-wide.
//
// A `store` param (added 2026-09-23, per explicit request for a store
// dropdown) filters to searches whose REFERRING page (pageReferrer — the
// page the person was on right before they searched) matched that store's
// /shop/{code} or /search/stores/{code} pages, same convention as
// api/_hrh-traffic-analytics.js's BRANCHES. This is a real but PARTIAL
// signal, not a clean store-scoped number: most searches (~94.6% in a
// 2026-09-23 check, 1,450 of 1,533 total) have no branch-page referrer at
// all (direct navigation to /search, a repeat search from the results page
// itself, external links, etc.) and are simply excluded when a store is
// selected — per explicit decision, NOT bucketed into a generic "Unknown"
// option, since that would misrepresent an artifact of the referrer signal
// as if it were a real, nameable segment. Each store option's scopeNote
// spells out the exact matching rule so this is transparent, not hidden
// behind a vague label.
const GA4_PROPERTY_ID = "314716873";
const STORES = [
  { code: "ONP", label: "HRH Online", pagePrefixes: ["/shop/ONP", "/search/stores/ONP"] },
  { code: "PIO", label: "Pioneer", pagePrefixes: ["/shop/PIO", "/search/stores/PIO"] },
  { code: "CTA", label: "Cainta", pagePrefixes: ["/shop/CTA", "/search/stores/CTA"] },
  { code: "HSR", label: "Sucat", pagePrefixes: ["/shop/HSR", "/search/stores/HSR"] },
  { code: "MAB", label: "Mabalacat", pagePrefixes: ["/shop/MAB", "/search/stores/MAB"] },
  // Store code SRR's real store record is "HMR TAGAYTAY ROAD" — labeled
  // "Santa Rosa Road" here to match the existing label every other branch
  // dropdown on this dashboard uses (api/_hrh-traffic-analytics.js's
  // BRANCHES), so this doesn't introduce a second, inconsistent name for
  // the same branch.
  { code: "SRR", label: "Santa Rosa Road", pagePrefixes: ["/shop/SRR", "/search/stores/SRR"] },
  { code: "SUB", label: "Subic", pagePrefixes: ["/shop/SUB", "/search/stores/SUB"] },
];

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
    const store = STORES.find((s) => s.code === req.query.store) || null;

    let dateRange;
    try {
      dateRange = resolveRange(range, from, to);
    } catch (rangeErr) {
      return res.status(400).json({ error: "Invalid date range", message: rangeErr.message });
    }

    const expressions = [
      { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "view_search_results" } } },
    ];
    if (store) {
      expressions.push({
        orGroup: {
          expressions: store.pagePrefixes.map((prefix) => ({
            filter: { fieldName: "pageReferrer", stringFilter: { matchType: "CONTAINS", value: prefix } },
          })),
        },
      });
    }

    const client = getClient();
    const [report] = await client.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      dimensions: [{ name: "searchTerm" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: { andGroup: { expressions } },
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

    const scopeNote = store
      ? `Searches referred from ${store.label}'s own pages (hmr.ph${store.pagePrefixes.join(" or hmr.ph")}) right before searching — a partial signal, not a clean store-scoped total: most searches have no branch-page referrer at all (direct navigation, a repeat search, external links) and are excluded here rather than lumped into an "Unknown" bucket. Live from the GA4 Data API, not the ClickHouse/Airbyte copy, so this has no ETL sync lag.`
      : "Site-wide on-site search terms (hmr.ph/search) across every branch — not scoped to one store. Live from the GA4 Data API, not the ClickHouse/Airbyte copy, so this has no ETL sync lag.";

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      meta: {
        property: GA4_PROPERTY_ID,
        range: dateRange,
        store: store ? { code: store.code, label: store.label } : null,
        stores: STORES.map((s) => ({ code: s.code, label: s.label })),
        scopeNote,
      },
      rows,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load search keywords", message: err instanceof Error ? err.message : String(err) });
  }
}
