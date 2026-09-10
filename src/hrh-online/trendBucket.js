// Shared Day/Week/Month re-bucketing for HRH Online's client-side "how do
// you want to look at it" trend controls — purely a view of data already
// fetched for the page's selected Date Range filter (see
// ExecutiveOverview.jsx's Sales Trend, the first place this pattern shipped,
// and SalesAnalytics.jsx's Category/Subcategory Contribution). Extracted
// here once both pages needed it, rather than duplicating ~80 lines of
// date-bucketing math a second time — unlike the ClickHouse query logic in
// api/*.js (deliberately duplicated per file so Product Analytics' locked
// contract can never be touched by accident), this is pure display
// formatting with no business-metric risk, so sharing it is safe.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatShortDateLabel(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

function addDaysISOLocal(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function mondayOfWeekISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return addDaysISOLocal(iso, dow === 0 ? -6 : 1 - dow);
}

function formatWeekRangeLabel(weekStartIso) {
  const weekEndIso = addDaysISOLocal(weekStartIso, 6);
  const [, sm, sd] = weekStartIso.split("-").map(Number);
  const [, em, ed] = weekEndIso.split("-").map(Number);
  const start = `${SHORT_MONTHS[sm - 1]} ${sd}`;
  const end = sm === em ? `${ed}` : `${SHORT_MONTHS[em - 1]} ${ed}`;
  return `${start}–${end}`;
}

function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${y}`;
}

export const TREND_BUCKETS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// Re-buckets daily rows ({ date: "YYYY-MM-DD", ...numeric keys }) into
// day/week/month totals for every key in `keys`, summing across whichever
// days fall in each week/month bucket. Rows must already be sorted/enumerated
// day-by-day (zero-filled) by the caller's API.
export function bucketRows(rows, bucket, keys) {
  if (!rows || rows.length === 0) return [];
  if (bucket === "day") {
    return rows.map((d) => {
      const out = { dateLabel: formatShortDateLabel(d.date) };
      for (const k of keys) out[k] = d[k] ?? 0;
      return out;
    });
  }
  const keyFor = bucket === "week" ? (d) => mondayOfWeekISO(d.date) : (d) => d.date.slice(0, 7);
  const labelFor = bucket === "week" ? formatWeekRangeLabel : formatMonthLabel;
  const buckets = new Map();
  for (const d of rows) {
    const bucketKey = keyFor(d);
    const b = buckets.get(bucketKey) || { key: bucketKey };
    for (const k of keys) b[k] = (b[k] || 0) + (d[k] ?? 0);
    buckets.set(bucketKey, b);
  }
  return Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((b) => {
      const out = { dateLabel: labelFor(b.key) };
      for (const k of keys) out[k] = b[k];
      return out;
    });
}

// Merges a per-day array field ({ date, [arrayKey]: [{ label, gmv }] } rows —
// see api/hrh-sales-analytics.js's per-day `otherDetail`) into the same
// day/week/month buckets bucketRows produces, summing gmv per label across
// whichever days land in each bucket and re-sorting by size. Returns a Map
// keyed by the bucket's `dateLabel` (the exact same label bucketRows uses
// for that row) so callers can attach it back onto bucketRows' output.
export function bucketArrayField(rows, bucket, arrayKey) {
  const result = new Map();
  if (!rows || rows.length === 0) return result;
  if (bucket === "day") {
    for (const d of rows) result.set(formatShortDateLabel(d.date), d[arrayKey] || []);
    return result;
  }
  const keyFor = bucket === "week" ? (d) => mondayOfWeekISO(d.date) : (d) => d.date.slice(0, 7);
  const labelFor = bucket === "week" ? formatWeekRangeLabel : formatMonthLabel;
  const groups = new Map();
  for (const d of rows) {
    const bucketKey = keyFor(d);
    const arr = groups.get(bucketKey) || [];
    arr.push(d[arrayKey] || []);
    groups.set(bucketKey, arr);
  }
  for (const [bucketKey, arrays] of groups) {
    const totals = new Map();
    for (const arr of arrays) {
      for (const { label, gmv } of arr) totals.set(label, (totals.get(label) || 0) + gmv);
    }
    const merged = Array.from(totals, ([label, gmv]) => ({ label, gmv })).sort((a, b) => b.gmv - a.gmv);
    result.set(labelFor(bucketKey), merged);
  }
  return result;
}
