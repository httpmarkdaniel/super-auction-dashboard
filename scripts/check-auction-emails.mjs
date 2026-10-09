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

  for (const stage of ["initial", "final"]) {
    const r = await call(handleAuctionResultEmail, { date, stage });
    if (r.status !== 200) { problems.push(`${stage} ${date}: HTTP ${r.status} ${r.body.message || r.body.error}`); continue; }
    for (const g of r.body.groups) {
      if (g.endDate.slice(0, 10) !== date) problems.push(`${stage} ${date}: group ${g.key} has end date ${g.endDate}`);
      if (!g.auctionNumbers.length) problems.push(`${stage} ${date}: group ${g.key} has no auction numbers`);
    }
  }
  process.stdout.write(".");
}
console.log();

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
await client.close();

for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`OK — Initial, Final and Published emails checked for the last ${days} days.`);
process.exit(0);
