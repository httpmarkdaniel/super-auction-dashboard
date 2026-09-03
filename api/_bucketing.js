// Shared bucket-grain selection + complete-sequence zero-fill for the
// Bidder Analytics / Vendor Analytics time-series charts
// (api/overview.js's type=bidder-time-series, api/leaderboards.js's
// type=vendor-time-series). A plain helper module, not a route — Vercel's
// zero-config Node.js runtime excludes underscore-prefixed files under
// /api from becoming their own serverless functions (confirmed by the
// prior deployment-fix commit: adding _lotStatus.js here never affected
// the project's function count), so this adds zero functions.

// Bucket grain is a function of the SELECTED DATE PRESET, not merely the
// elapsed day-span: WTD and MTD are ALWAYS daily regardless of how many
// days have elapsed so far, and YTD is ALWAYS monthly regardless of how
// early in the year it is (never hundreds of daily bars). Only "custom"
// falls back to elapsed-span thresholds. `preset` is whatever the
// frontend's own dateRange state resolves to — "wtd" | "mtd" | "ytd" |
// anything else treated as custom.
export function pickBucketGrain(preset, fromStr, toStr) {
  if (preset === "wtd" || preset === "mtd") {
    return { fn: "toStartOfDay", label: "day" };
  }
  if (preset === "ytd") {
    return { fn: "toStartOfMonth", label: "month" };
  }
  // Custom (or unrecognized) — elapsed-span thresholds, per this task's
  // explicit rule: <=31 days daily, 32-120 weekly, >120 monthly.
  const days = (Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86400000;
  if (days <= 31) return { fn: "toStartOfDay", label: "day" };
  if (days <= 120) return { fn: "toMonday", label: "week" };
  return { fn: "toStartOfMonth", label: "month" };
}

function ymd(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Monday on/before the given UTC calendar date, as {y, m, d}.
function mondayOnOrBefore(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1; // days back to Monday
  const monday = new Date(t - diff * 86400000);
  return { y: monday.getUTCFullYear(), m: monday.getUTCMonth() + 1, d: monday.getUTCDate() };
}

// Every bucket key that MUST appear in the response for [fromStr, toStr]
// at the given grain — the complete expected sequence a real (sparse)
// query result is merged into so missing days/weeks/months still render
// as zero instead of being silently omitted. Keys are plain "YYYY-MM-DD"
// strings. Pure UTC calendar-part arithmetic (never local Date math or
// the server process's own timezone) — same technique as
// api/overview.js's enumerateCalendarDays.
export function enumerateBuckets(label, fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const buckets = [];

  if (label === "day") {
    const end = Date.UTC(ty, tm - 1, td);
    for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86400000) {
      const d = new Date(t);
      buckets.push(ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    }
    return buckets;
  }

  if (label === "week") {
    const startMonday = mondayOnOrBefore(fy, fm, fd);
    const endMonday = mondayOnOrBefore(ty, tm, td);
    const endT = Date.UTC(endMonday.y, endMonday.m - 1, endMonday.d);
    for (let t = Date.UTC(startMonday.y, startMonday.m - 1, startMonday.d); t <= endT; t += 7 * 86400000) {
      const d = new Date(t);
      buckets.push(ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    }
    return buckets;
  }

  // month
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    buckets.push(ymd(y, m, 1));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return buckets;
}

// Normalizes whatever string format ClickHouse returned for the bucket
// column (Date "YYYY-MM-DD" or DateTime "YYYY-MM-DD HH:MM:SS") down to
// the plain "YYYY-MM-DD" key enumerateBuckets() produces, so a real query
// row always matches its expected slot regardless of the underlying
// ClickHouse column type for toStartOfDay/toMonday/toStartOfMonth.
export function normalizeBucketKey(raw) {
  return String(raw).slice(0, 10);
}

// Merges sparse query rows into the COMPLETE expected bucket sequence —
// every enumerated bucket appears exactly once, in order, with zeros for
// any bucket the query didn't return a row for. `fields` lists the
// numeric fields to zero-fill (e.g. ["total", "new_bidders",
// "returning_bidders"]).
export function zeroFillBuckets(expectedBuckets, rows, fields) {
  const byBucket = new Map(rows.map((r) => [normalizeBucketKey(r.bucket), r]));
  return expectedBuckets.map((bucket) => {
    const row = byBucket.get(bucket);
    const out = { bucket };
    for (const f of fields) out[f] = row ? Number(row[f] ?? 0) : 0;
    return out;
  });
}
