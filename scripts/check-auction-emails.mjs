// Pre-push check for the automated auction emails (n8n → api/_auction-result-email.js).
// Runs the real Initial, Final and Published queries against the warehouse for the
// last N days and fails on any SQL error or data that would put a wrong row in an
// email. Run before pushing any change to the email endpoint:
//
//   npm run check:emails            (last 14 days)
//   npm run check:emails -- 30      (last 30 days)
import { createClient } from "@clickhouse/client";
import { handleAuctionResultEmail, handleAuctionPublishedEmail } from "../api/_auction-result-email.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});
const days = Number(process.argv[2] || 14);
const publishedRows = new Map(); // "date|auction number" → row the Published email would carry
const problems = [];
const notes = [];

function call(handler, query) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
    };
    Promise.resolve(handler({ query }, res)).catch((err) => resolve({ status: 500, body: { message: err.message } }));
  });
}

function manilaDate(daysAgo) {
  return new Date(Date.now() + 8 * 3600 * 1000 - daysAgo * 86400 * 1000).toISOString().slice(0, 10);
}

const vendorDayFinals = []; // Final groups under per-vendor-day grouping
const publishedBy = new Map(); // auction number → dates it appeared in the Published email
for (let i = 0; i < days; i++) {
  const date = manilaDate(i);

  const pub = await call(handleAuctionPublishedEmail, { date });
  if (pub.status !== 200) problems.push(`Published ${date}: HTTP ${pub.status} ${pub.body.message || pub.body.error}`);
  else {
    for (const a of pub.body.auctions) {
      publishedBy.set(a.auctionNumber, [...(publishedBy.get(a.auctionNumber) || []), date]);
      publishedRows.set(`${date}|${a.auctionNumber}`, { ...a, date });
      if (a.publishedDate.slice(0, 10) !== date) problems.push(`Published ${date}: ${a.auctionNumber} has published date ${a.publishedDate}`);
      if (a.endDate <= a.startDate) problems.push(`Published ${date}: ${a.auctionNumber} ends before it starts`);
      if (!a.lots) problems.push(`Published ${date}: ${a.auctionNumber} has 0 lots`);
    }
    for (const h of pub.body.held || []) notes.push(`Published ${date}: held ${h.auctionNumber} — ${h.reasons.join("; ")}`);
  }

  // Each stage twice: as live today (days before LEGACY_GROUPING_BEFORE keep the
  // old vendor + branch + end time groups) and with the per-vendor-day grouping
  // forced on every day (legacyBefore=2000-01-01), so it's exercised on history.
  for (const stage of ["initial", "final"]) {
    for (const legacyBefore of [undefined, "2000-01-01"]) {
      const mode = legacyBefore ? `${stage}/vendor-day` : stage;
      const r = await call(handleAuctionResultEmail, { date, stage, ...(legacyBefore ? { legacyBefore } : {}) });
      if (r.status !== 200) { problems.push(`${mode} ${date}: HTTP ${r.status} ${r.body.message || r.body.error}`); continue; }
      for (const g of r.body.groups) {
        if (g.endDate.slice(0, 10) !== date) problems.push(`${mode} ${date}: group ${g.key} has end date ${g.endDate}`);
        if (!g.auctionNumbers.length) problems.push(`${mode} ${date}: group ${g.key} has no auction numbers`);
        if (!g.branches || !g.branches.length) problems.push(`${mode} ${date}: group ${g.key} has no branches`);
      }
      if (legacyBefore || date >= "2026-10-15") {
        const seen = new Set();
        for (const g of r.body.groups) {
          if (seen.has(g.vendor)) problems.push(`${mode} ${date}: vendor ${g.vendor} split into several emails`);
          seen.add(g.vendor);
        }
        if (stage === "final") vendorDayFinals.push(...r.body.groups.map((g) => ({ ...g, date })));
      }
    }
  }
  process.stdout.write(".");
}
console.log();

// ?open=1 (live Published email): every published auction still open, none ended.
{
  const open = await call(handleAuctionPublishedEmail, { open: "1" });
  if (open.status !== 200) problems.push(`Published open=1: HTTP ${open.status} ${open.body.message || open.body.error}`);
  else {
    const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
    for (const a of open.body.auctions) {
      if (a.endDate <= now) problems.push(`Published open=1: ${a.auctionNumber} already ended ${a.endDate}`);
      if (!a.lots) problems.push(`Published open=1: ${a.auctionNumber} has 0 lots`);
    }
    for (const h of open.body.held || []) notes.push(`Published open=1: held ${h.auctionNumber} — ${h.reasons.join("; ")}`);
    notes.push(`Published open=1: ${open.body.count} open published auctions`);
  }
}

for (const [num, dates] of publishedBy)
  if (dates.length > 1) problems.push(`Published: ${num} appears on several days (${dates.join(", ")}) — a re-publish slipped through`);

// Independent of the endpoint's own logic: every auction it would email must have
// the same start/end as the mart, and must not have been published before with
// that start time (a re-publish of an auction that's already out).
const emailed = [...publishedRows.values()];
if (emailed.length) {
  const truth = await (
    await client.query({
      query: `
        SELECT m.auction_number AS num, m.start AS mart_start, m.end AS mart_end, ifNull(p.first_pub, '') AS first_pub
        FROM (
          SELECT auction_number, formatDateTime(min(start_date), '%Y-%m-%d %H:%i:%S') AS start,
                 formatDateTime(max(end_date), '%Y-%m-%d %H:%i:%S') AS end
          FROM xv3.mart_auction_vendor_analysis WHERE auction_number IN {nums:Array(String)} GROUP BY auction_number
        ) m
        LEFT JOIN (
          SELECT auction_number, formatDateTime(starting_time, '%Y-%m-%d %H:%i:%S') AS start,
                 formatDateTime(min(published_date), '%Y-%m-%d %H:%i:%S') AS first_pub
          FROM xv3.auctions WHERE auction_number IN {nums:Array(String)} AND published_date IS NOT NULL
          GROUP BY auction_number, starting_time
        ) p ON p.auction_number = m.auction_number AND p.start = m.start`,
      query_params: { nums: emailed.map((a) => a.auctionNumber) },
      format: "JSONEachRow",
    })
  ).json();
  const byNum = new Map(truth.map((t) => [t.num, t]));
  for (const a of emailed) {
    const t = byNum.get(a.auctionNumber);
    if (!t) { problems.push(`Published ${a.date}: ${a.auctionNumber} not in the mart`); continue; }
    if (a.startDate !== t.mart_start || a.endDate !== t.mart_end)
      problems.push(`Published ${a.date}: ${a.auctionNumber} emailed as ${a.startDate} – ${a.endDate}, mart says ${t.mart_start} – ${t.mart_end}`);
    if (t.first_pub && t.first_pub.slice(0, 10) < a.date)
      problems.push(`Published ${a.date}: ${a.auctionNumber} was already published ${t.first_pub} — re-publish`);
  }
}
// Final = every lot of the vendor's auctions that day, Unsold included.
if (vendorDayFinals.length) {
  const truth = await (
    await client.query({
      query: `
        SELECT vendor, toString(toDate(e)) AS day, sum(n) AS lots
        FROM (
          SELECT vendor, auction_number, branch, max(end_date) AS e, uniqExact(lot_number) AS n
          FROM xv3.mart_auction_vendor_analysis
          WHERE end_date IS NOT NULL AND branch != 'HMRDEVZ TEST WAREHOUSE'
            AND end_date >= toDateTime64({from:String}, 3, 'UTC') - INTERVAL 1 DAY
          GROUP BY vendor, auction_number, branch
        )
        GROUP BY vendor, day`,
      query_params: { from: `${manilaDate(days)} 00:00:00` },
      format: "JSONEachRow",
    })
  ).json();
  const lots = new Map(truth.map((t) => [`${t.vendor}|${t.day}`, Number(t.lots)]));
  let unsoldGroups = 0;
  for (const g of vendorDayFinals) {
    const want = lots.get(`${g.vendor}|${g.date}`);
    if (g.totals.count_of_lot !== want) problems.push(`final/vendor-day ${g.date}: ${g.vendor} has ${g.totals.count_of_lot} lots, mart says ${want}`);
    if (g.summaryRows.some((r) => r.payment_status === "Unsold")) unsoldGroups++;
  }
  notes.push(`${vendorDayFinals.length} vendor-day Finals checked against the mart; ${unsoldGroups} include Unsold lots`);
}
await client.close();

for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`OK — Initial, Final and Published emails checked for the last ${days} days.`);
process.exit(0);
