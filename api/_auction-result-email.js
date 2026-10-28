import { createClient } from "@clickhouse/client";
import XLSX from "xlsx-js-style";
import { buildAuctionResultWorkbook, excelFileName, plainText } from "../src/utils/auctionResultWorkbook.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Underscore-prefixed (Hobby plan 12-function cap) — api/overview.js
// dispatches here on `?type=auction-result-email`.
//
// Data for the automated "Initial Auction Result" email (n8n workflow
// "automated auction email summary"): every auction that has ENDED in the
// window, grouped one email per vendor + end day (all branches), each
// with the Sales Summary rows and the exact same 3-sheet Excel file as the
// Auction Result tab's Export button (shared builder in
// src/utils/auctionResultWorkbook.js). Recipients/HTML live in n8n.
//
// end_date holds Manila wall-clock time in a UTC-typed column (auctions end
// 13:00–16:00; see api/overview.js's buildAuctionResultFilter note), so the
// window is compared against Manila "now" as a plain timestamp — no
// timezone conversion. The table also holds future scheduled auctions, so
// "ended" = the auction's latest lot end_date is at or before the cutoff.
//
// Window: ?from=&to= ("YYYY-MM-DD HH:MM:SS", Manila) or ?date=YYYY-MM-DD
// (whole day, for testing). Default (?stage=initial): ended between 24h and
// 60min ago — the 60 minutes lets the warehouse sync. ?stage=final: ended
// between 96h and 72h ago, i.e. exactly 3 days after end_date, for the "Final
// Auction Result" email (fresh statuses after collection). n8n dedupes so
// overlapping runs never resend. `stage` is echoed back so n8n can tell the
// two responses apart.
const EXCLUDED_BRANCHES = ["HMRDEVZ TEST WAREHOUSE"];
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_MIN_AGE_MINUTES = 60;
const FINAL_AGE_HOURS = 72;
const PUBLISHED_LOOKBACK_HOURS = 8;
// Grouping by end day (Manila), so Finals always match the Initials sent:
//   before LEGACY_GROUPING_BEFORE      vendor + branch + end time
//   before VENDOR_DAY_FROM             vendor + branch + day
//   from VENDOR_DAY_FROM (user 10-20)  vendor + day, all branches in one email
const LEGACY_GROUPING_BEFORE = "2026-10-15";
const VENDOR_DAY_FROM = "2026-10-20";
const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function manilaTs(msAgo = 0) {
  return new Date(Date.now() + 8 * 3600 * 1000 - msAgo).toISOString().slice(0, 19).replace("T", " ");
}

function resolveWindow(q) {
  if (q.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) throw new RangeError("date must be YYYY-MM-DD");
    return { from: `${q.date} 00:00:00`, to: `${q.date} 23:59:59` };
  }
  if (q.from || q.to) {
    if (!TS.test(q.from || "") || !TS.test(q.to || "")) throw new RangeError("from/to must be 'YYYY-MM-DD HH:MM:SS'");
    return { from: q.from, to: q.to };
  }
  if (q.stage === "final")
    return { from: manilaTs((FINAL_AGE_HOURS + DEFAULT_LOOKBACK_HOURS) * 3600 * 1000), to: manilaTs(FINAL_AGE_HOURS * 3600 * 1000) };
  // ?minAgeMinutes= (0-240) overrides the default 60-minute wait, e.g. 0 to
  // email the Initial result as soon as end_date passes.
  const minAge = q.minAgeMinutes !== undefined && /^\d{1,3}$/.test(String(q.minAgeMinutes))
    ? Math.min(240, Number(q.minAgeMinutes))
    : DEFAULT_MIN_AGE_MINUTES;
  return { from: manilaTs(DEFAULT_LOOKBACK_HOURS * 3600 * 1000), to: manilaTs(minAge * 60 * 1000) };
}

const cleanStatus = (v) => (v && String(v).trim() ? v : "No Status");

// The warehouse only sees the live system through an hourly sync (~:41) and
// mart_auction_vendor_analysis is rebuilt only every 3 h (~02:05, 05:05, 08:05,
// 11:05, 14:05, 17:05, 20:05, 23:05 Manila) from the latest :41 sync, so "now" is not
// what the mart knows. dataAsOf = the latest sync (lots/auctions CDC) that the
// current mart build contains, in Manila wall-clock (same convention as
// end_date). An Initial email is only built once dataAsOf is past the
// auction's end, so it always has the final bids/statuses. Fallback: anything
// that ended more than FRESHNESS_FALLBACK_HOURS ago is sent regardless.
const FRESHNESS_FALLBACK_HOURS = 6;
async function martDataAsOf() {
  try {
    const [row] = await (
      await client.query({
        query: `
          WITH (SELECT max(metadata_modification_time) FROM system.tables WHERE database = 'xv3' AND name = 'mart_auction_vendor_analysis') AS rebuilt
          SELECT formatDateTime(greatest(
            (SELECT max(_airbyte_extracted_at) FROM xv3.lots WHERE _airbyte_extracted_at <= rebuilt),
            (SELECT max(_airbyte_extracted_at) FROM xv3.auctions WHERE _airbyte_extracted_at <= rebuilt)
          ) + INTERVAL 8 HOUR, '%Y-%m-%d %H:%i:%S') AS as_of
        `,
        format: "JSONEachRow",
      })
    ).json();
    return row && TS.test(row.as_of) ? row.as_of : null;
  } catch {
    return null;
  }
}

export async function handleAuctionResultEmail(req, res) {
  let window_;
  try {
    window_ = resolveWindow(req.query);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  // ?legacyBefore=YYYY-MM-DD: tests only (npm run check:emails) — n8n never sets it.
  const legacyBefore = /^\d{4}-\d{2}-\d{2}$/.test(req.query.legacyBefore || "") ? req.query.legacyBefore : LEGACY_GROUPING_BEFORE;
  // ?vendorDayFrom=YYYY-MM-DD: tests only, same as legacyBefore.
  const vendorDayFrom = /^\d{4}-\d{2}-\d{2}$/.test(req.query.vendorDayFrom || "") ? req.query.vendorDayFrom : VENDOR_DAY_FROM;
  const followup = req.query.stage === "followup";
  // Scheduled Initial runs: never past what the mart actually contains.
  let dataAsOf = null;
  if (req.query.stage !== "final" && !followup && !req.query.date && !req.query.from) {
    dataAsOf = await martDataAsOf();
    const fallbackTo = manilaTs(FRESHNESS_FALLBACK_HOURS * 3600 * 1000);
    const freshTo = dataAsOf && dataAsOf < window_.to ? dataAsOf : window_.to;
    window_ = { ...window_, to: freshTo > fallbackTo ? freshTo : fallbackTo > window_.to ? window_.to : fallbackTo };
  }

  try {
    // Same item-barcode grain/columns as type=auction-result-export, for
    // every lot of each vendor's auctions that ended in the window.
    const lots = await (
      await client.query({
        // An auction is in when its whole group has ended in the window: the
        // vendor's latest auction end that day (across branches from
        // VENDOR_DAY_FROM, at that branch before) — so a group's email never goes
        // out before all its auctions are in. Days before LEGACY_GROUPING_BEFORE
        // keep the per-auction end.
        query: `
          WITH per_auction AS (
            SELECT v.vendor AS vendor, v.branch AS branch, v.auction_number AS auction_number,
                   max(v.end_date) AS auction_end, toDate(max(v.end_date)) AS end_day
            FROM xv3.mart_auction_vendor_analysis v
            WHERE v.end_date IS NOT NULL AND v.branch NOT IN {excluded:Array(String)}
            GROUP BY v.vendor, v.branch, v.auction_number
          ),
          ended AS (
            SELECT a.vendor AS vendor, a.branch AS branch, a.auction_number AS auction_number
            FROM per_auction a
            INNER JOIN (
              SELECT vendor AS dv, branch AS db, end_day AS dd, max(auction_end) AS day_end FROM per_auction GROUP BY vendor, branch, end_day
            ) d ON d.dv = a.vendor AND d.db = a.branch AND d.dd = a.end_day
            INNER JOIN (
              SELECT vendor AS vv, end_day AS vd, max(auction_end) AS vendor_day_end FROM per_auction GROUP BY vendor, end_day
            ) vd ON vd.vv = a.vendor AND vd.vd = a.end_day
            WHERE multiIf(a.end_day < toDate({legacyBefore:String}), a.auction_end, a.end_day < toDate({vendorDayFrom:String}), d.day_end, vd.vendor_day_end) > toDateTime64({from:String}, 3, 'UTC')
              AND multiIf(a.end_day < toDate({legacyBefore:String}), a.auction_end, a.end_day < toDate({vendorDayFrom:String}), d.day_end, vd.vendor_day_end) <= toDateTime64({to:String}, 3, 'UTC')
          )
          SELECT
            toStartOfDay(toDateTime(v.dr_received)) AS dr_received,
            v.receiving_number AS receiving_number,
            v.vendor AS vendor,
            v.branch AS branch,
            v.origin AS origin,
            v.dr_number AS dr_number,
            v.dr_pis AS dr_pis,
            v.account_executive AS account_executive,
            v.auction_number AS auction_number,
            v.end_date AS end_date,
            v.lot_number AS lot_number,
            v.item_barcode AS item_barcode,
            v.qty AS qty,
            v.item_status AS item_status,
            v.client_reference_number AS client_reference_number,
            v.description AS description,
            v.status AS payment_status,
            v.buyers_premium AS bp_percent,
            v.commission AS sf_percent,
            v.for_approval_status AS for_approval_status,
            sum(v.bid_amount) AS bid_amount,
            sum(v.reserved_price) AS reserved_price
          FROM xv3.mart_auction_vendor_analysis v
          WHERE (v.vendor, v.branch, v.auction_number) IN (SELECT vendor, branch, auction_number FROM ended)
          GROUP BY
            toStartOfDay(toDateTime(v.dr_received)), v.receiving_number, v.vendor, v.branch, v.origin, v.dr_number,
            v.dr_pis, v.account_executive, v.auction_number, v.end_date, v.lot_number, v.item_barcode, v.qty,
            v.item_status, v.client_reference_number, v.description, v.status, v.buyers_premium, v.commission,
            v.for_approval_status
          ORDER BY bid_amount DESC
        `,
        query_params: { ...window_, excluded: EXCLUDED_BRANCHES, legacyBefore, vendorDayFrom },
        format: "JSONEachRow",
      })
    ).json();

    // Unsold lots carry no For Approval status in the emails (user 2026-10-19):
    // not in the table, the For Approval note, or the attached Excel.
    // Final: a lot still Outstanding is shown as "Unpaid" (user 2026-10-28) —
    // email table and Excel; the Initial and follow-ups keep "Outstanding".
    const final = req.query.stage === "final";
    const allRows = lots.map((r) => ({
      ...r,
      payment_status: final && r.payment_status === "Outstanding" ? "Unpaid" : r.payment_status,
      description: plainText(r.description),
      for_approval_status: r.payment_status === "Unsold" ? null : r.for_approval_status,
      qty: r.qty == null ? null : Number(r.qty),
      bp_percent: r.bp_percent == null ? null : Number(r.bp_percent),
      sf_percent: r.sf_percent == null ? null : Number(r.sf_percent),
      bid_amount: Number(r.bid_amount ?? 0),
      reserved_price: Number(r.reserved_price ?? 0),
    }));

    // Each auction's end = its latest lot end_date (same as Top Info) —
    // computed over ALL lots so the Final's group keys match the Initial's.
    const auctionEnd = new Map();
    for (const r of allRows) {
      const k = `${r.vendor}\u0000${r.branch}\u0000${r.auction_number}`;
      if (!auctionEnd.has(k) || r.end_date > auctionEnd.get(k)) auctionEnd.set(k, r.end_date);
    }

    // Unsold lots are included in both the Initial and the Final result.
    const rows = allRows;

    // One email per vendor + end day, all its auctions across branches. Earlier
    // days keep the grouping their Initials went out with (see VENDOR_DAY_FROM),
    // so their Finals still match (and thread under) them.
    const groups = new Map();
    for (const r of rows) {
      const end = auctionEnd.get(`${r.vendor}\u0000${r.branch}\u0000${r.auction_number}`);
      const day = String(end).slice(0, 10);
      const key =
        day < legacyBefore ? `${r.vendor} | ${r.branch} | ${end}`
        : day < vendorDayFrom ? `${r.vendor} | ${r.branch} | ${day}`
        : `${r.vendor} | ${day}`;
      if (!groups.has(key)) groups.set(key, { key, vendor: r.vendor, branches: new Set(), ends: new Set(), endDate: end, rows: [] });
      const g = groups.get(key);
      g.branches.add(r.branch);
      g.ends.add(end);
      if (end > g.endDate) g.endDate = end;
      g.rows.push(r);
    }

    // Safety check (user 2026-10-26): an Initial / Final is held while any of its
    // lots has bids in the CMS bid history but still reads Unsold in the mart —
    // the lot was never finalized, so the email would report a sold lot as
    // unsold. Held groups are left out of `groups` (the next run retries) and
    // listed in `held` with the lots, for n8n's alert. A posted bid that differs
    // from the CMS highest bid is only reported (`warnings`), never held.
    // ?check=0 skips it (manual re-sends).
    const held = [];
    if (!followup && req.query.check !== "0" && groups.size) {
      const auctions = [...new Set(rows.map((r) => r.auction_number))];
      const cms = await (
        await client.query({
          query: `
            SELECT auction_number AS an, lot_number AS ln, max(bid_amount) AS top_bid, count() AS bids
            FROM cms.mart_cms_bid_history_report
            WHERE auction_number IN {auctions:Array(String)}
            GROUP BY auction_number, lot_number
          `,
          query_params: { auctions },
          format: "JSONEachRow",
        })
      ).json();
      const topBid = new Map(cms.map((c) => [`${c.an}\u0000${c.ln}`, { top: Number(c.top_bid ?? 0), bids: Number(c.bids) }]));
      for (const g of groups.values()) {
        const lotState = new Map();
        for (const r of g.rows) {
          const k = `${r.auction_number}\u0000${r.lot_number}`;
          const s = lotState.get(k) || { auction: r.auction_number, lot: r.lot_number, sold: false, bid: 0 };
          if (r.payment_status !== "Unsold") s.sold = true;
          s.bid += r.bid_amount;
          lotState.set(k, s);
        }
        const problems = [];
        const warnings = [];
        for (const [k, s] of lotState) {
          const c = topBid.get(k);
          if (!c || !(c.top > 0)) continue;
          if (!s.sold) problems.push({ auction: s.auction, lot: s.lot, issue: "has bids but reads Unsold (not finalized)", cmsTopBid: c.top, bids: c.bids });
          else if (Math.abs(s.bid - c.top) > 0.5) warnings.push({ auction: s.auction, lot: s.lot, issue: "posted bid differs from the CMS highest bid", postedBid: s.bid, cmsTopBid: c.top });
        }
        g.warnings = warnings;
        if (problems.length) {
          held.push({
            key: g.key,
            vendor: g.vendor,
            branches: [...g.branches].sort(),
            endDate: String(g.endDate).slice(0, 19),
            auctionNumbers: [...new Set(g.rows.map((r) => r.auction_number))].sort(),
            problems: problems.sort((a, b) => a.auction.localeCompare(b.auction) || String(a.lot).localeCompare(String(b.lot), undefined, { numeric: true })),
          });
          groups.delete(g.key);
        }
      }
    }

    // Sales Summary — same arithmetic as type=auction-result: lots are
    // distinct (auction_number, lot_number) pairs; totals are their own
    // distinct count, never a sum of the grouped rows.
    const salesSummary = (rows) => {
      const byStatus = new Map();
      const allLots = new Set();
      let totalReserved = 0;
      let totalBid = 0;
      for (const r of rows) {
        const lotKey = `${r.auction_number}\u0000${r.lot_number}`;
        allLots.add(lotKey);
        totalReserved += r.reserved_price;
        totalBid += r.bid_amount;
        const sk = `${cleanStatus(r.payment_status)}\u0000${cleanStatus(r.for_approval_status)}`;
        if (!byStatus.has(sk))
          byStatus.set(sk, { payment_status: cleanStatus(r.payment_status), for_approval_status: cleanStatus(r.for_approval_status), lots: new Set(), reserved_price: 0, bid_amount: 0 });
        const s = byStatus.get(sk);
        s.lots.add(lotKey);
        s.reserved_price += r.reserved_price;
        s.bid_amount += r.bid_amount;
      }
      const summaryRows = [...byStatus.values()]
        .map((s) => ({ payment_status: s.payment_status, for_approval_status: s.for_approval_status, count_of_lot: s.lots.size, reserved_price: s.reserved_price, bid_amount: s.bid_amount }))
        .sort((a, b) => b.count_of_lot - a.count_of_lot);
      const totals = { count_of_lot: allLots.size, reserved_price: totalReserved, bid_amount: totalBid };
      return { summaryRows, totals };
    };
    // Same three-sheet workbook as the dashboard's Export button.
    const resultWorkbook = (rows) => {
      const { summaryRows, totals } = salesSummary(rows);
      const topInfoMap = new Map();
      for (const r of rows) {
        const k = `${r.vendor}\u0000${r.account_executive}\u0000${r.branch}\u0000${r.auction_number}`;
        const t = topInfoMap.get(k);
        if (!t) topInfoMap.set(k, { vendor: r.vendor, account_executive: r.account_executive, branch: r.branch, auction_number: r.auction_number, end_date: r.end_date });
        else if (r.end_date > t.end_date) t.end_date = r.end_date;
      }
      const topInfo = [...topInfoMap.values()].sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
      return buildAuctionResultWorkbook({
        totals,
        rows: summaryRows,
        topInfo,
        detailed: { rows, truncated: false, truncationNote: null },
      });
    };

    const out = [...groups.values()].map((g) => {
      const { summaryRows, totals } = salesSummary(g.rows);

      // Email body table only: Paid and Released shown as one "Paid/Released"
      // row (distinct lots across both, so a lot under each isn't counted
      // twice). The Excel keeps the dashboard's own separate rows.
      const emailStatus = (v) => (v === "Paid" || v === "Released" ? "Paid/Released" : cleanStatus(v));
      const emailSummary = (rows) => {
        const byEmailStatus = new Map();
        for (const r of rows) {
          const ek = `${emailStatus(r.payment_status)} ${cleanStatus(r.for_approval_status)}`;
          if (!byEmailStatus.has(ek))
            byEmailStatus.set(ek, { payment_status: emailStatus(r.payment_status), for_approval_status: cleanStatus(r.for_approval_status), lots: new Set(), reserved_price: 0, bid_amount: 0 });
          const e = byEmailStatus.get(ek);
          e.lots.add(`${r.auction_number} ${r.lot_number}`);
          e.reserved_price += r.reserved_price;
          e.bid_amount += r.bid_amount;
        }
        return [...byEmailStatus.values()]
          .map((e) => ({ payment_status: e.payment_status, for_approval_status: e.for_approval_status, count_of_lot: e.lots.size, reserved_price: e.reserved_price, bid_amount: e.bid_amount }))
          .sort((a, b) => b.count_of_lot - a.count_of_lot);
      };
      const emailSummaryRows = emailSummary(g.rows);
      // One table per branch in the email body (user 2026-10-20: one email per
      // vendor, every branch's own table).
      const branchSummaries = [...g.branches].sort().map((branch) => {
        const rows = g.rows.filter((r) => r.branch === branch);
        return {
          branch,
          auctionNumbers: [...new Set(rows.map((r) => r.auction_number))].sort(),
          accountExecutives: [...new Set(rows.map((r) => r.account_executive).filter(Boolean))].sort(),
          emailSummaryRows: emailSummary(rows),
        };
      });

      // ?stage=followup (For Approval follow-ups, Day 1–3 at 8:30 AM): only the
      // lots still For Approval, one row per lot, and an Excel of just those.
      if (followup) {
        const pending = new Map();
        for (const r of g.rows) {
          if (r.for_approval_status !== "For Approval") continue;
          const k = `${r.auction_number}\u0000${r.lot_number}`;
          if (!pending.has(k))
            pending.set(k, { branch: r.branch, auction_number: r.auction_number, lot_number: r.lot_number, description: r.description, payment_status: cleanStatus(r.payment_status), reserved_price: 0, bid_amount: 0 });
          const p = pending.get(k);
          p.reserved_price += r.reserved_price;
          p.bid_amount += r.bid_amount;
        }
        const approvalLots = [...pending.values()].sort((a, b) =>
          a.auction_number.localeCompare(b.auction_number) || String(a.lot_number).localeCompare(String(b.lot_number), undefined, { numeric: true }));
        if (!approvalLots.length) return null;
        // Same layout as the Initial/Final Excel (user 2026-10-28), limited to
        // the For Approval lots.
        const wb = resultWorkbook(g.rows.filter((r) => r.for_approval_status === "For Approval"));
        const auctionNumbers = [...new Set(g.rows.map((r) => r.auction_number))].sort();
        return {
          key: g.key,
          vendor: g.vendor,
          branch: [...g.branches].sort().join(", "),
          branches: [...g.branches].sort(),
          endDate: String(g.endDate).slice(0, 19),
          auctionNumbers,
          accountExecutives: [...new Set(g.rows.map((r) => r.account_executive).filter(Boolean))].sort(),
          approvalLots,
          fileName: `For Approval lots - ${g.vendor} - ${auctionNumbers.join(", ")}.xlsx`.replace(/[\\/:*?"<>|]/g, "-"),
          xlsxBase64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
        };
      }

      const wb = resultWorkbook(g.rows);
      const day = String(g.endDate).slice(0, 10);

      return {
        key: g.key,
        vendor: g.vendor,
        branch: [...g.branches].sort().join(", "),
        branches: [...g.branches].sort(),
        endDate: String(g.endDate).slice(0, 19),
        endDates: [...g.ends].map((e) => String(e).slice(0, 19)).sort(),
        auctionNumbers: [...new Set(g.rows.map((r) => r.auction_number))].sort(),
        accountExecutives: [...new Set(g.rows.map((r) => r.account_executive).filter(Boolean))].sort(),
        summaryRows,
        emailSummaryRows,
        branchSummaries,
        totals,
        warnings: g.warnings || [],
        fileName: excelFileName({ vendor: g.vendor, from: day, to: day }),
        xlsxBase64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
      };
    }).filter(Boolean);
    out.sort((a, b) => a.endDate.localeCompare(b.endDate) || a.vendor.localeCompare(b.vendor));

    res.setHeader("Cache-Control", "no-store");
    const stage = followup ? "followup" : req.query.stage === "final" ? "final" : "initial";
    return res.status(200).json({ stage, window: window_, dataAsOf, count: out.length, groups: out, held });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't build auction result emails", message: err.message });
  }
}

// =====================================================================
// ?type=auction-published-email — auctions whose published_date falls in the
// window (default: last 8 h, or ?hours=N; Manila wall-clock like published_date
// itself; ?date=YYYY-MM-DD for a whole day), one row each for the "Auction Published"
// email: Branch code, Vendor(s), Auction Number, Name, Count of Lots, Start,
// End, hmr.ph link. Lot counts/vendors come from the mart, so an auction only
// appears once the mart has its lots (the next run picks it up otherwise);
// n8n sends each auction number once.
// =====================================================================
// Why a Published row must not be emailed yet ([] = fine). All values are
// 'YYYY-MM-DD HH:MM:SS' Manila wall-clock strings, so string order = time order.
export function publishedRowProblems(r) {
  const out = [];
  if (!r.start_date || !r.end_date || !r.published_date) return ["missing start/end/published date"];
  if (r.start_date !== r.mart_start || r.end_date !== r.mart_end)
    out.push(`dates disagree with the mart (auction ${r.start_date} – ${r.end_date}, mart ${r.mart_start} – ${r.mart_end})`);
  if (r.end_date <= r.start_date) out.push("ends before it starts");
  if (r.end_date <= r.published_date) out.push("already ended when published");
  return out;
}

export async function handleAuctionPublishedEmail(req, res) {
  let from;
  let to;
  // ?open=1: every published auction that hasn't ended yet, whenever it was
  // published — n8n's live Published email uses it with its own "already
  // announced to the real list" memory, so nothing announced only in pilot (or
  // missed while the workflow was off) is skipped at go-live.
  const openOnly = req.query.open === "1" ? 1 : 0;
  if (openOnly) {
    from = "2000-01-01 00:00:00";
    to = manilaTs(0);
  } else if (req.query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    from = `${req.query.date} 00:00:00`;
    to = `${req.query.date} 23:59:59`;
  } else {
    // 8 h covers the up-to-~3.5 h sync + 3-hourly mart rebuild delay (n8n dedupes)
    // older publications when the workflow is (re)activated. ?hours= widens it
    // for the once-a-day Published email, which collates everything since the last one.
    const hours = req.query.hours === undefined ? PUBLISHED_LOOKBACK_HOURS : Number(req.query.hours);
    if (!(hours > 0 && hours <= 168)) return res.status(400).json({ error: "hours must be between 1 and 168" });
    from = manilaTs(hours * 3600 * 1000);
    to = manilaTs(0);
  }
  try {
    const rows = await (
      await client.query({
        query: `
          WITH a AS (
            -- One whole row per auction: the latest CDC change (extract time, then binlog
            -- cursor — one sync can carry several changes with the same extract time).
            -- Per-column argMax mixed rows on ties and skipped NULLs, so a rescheduled +
            -- republished auction showed its old start/end dates.
            SELECT auction_number, t.1 AS hmr_id, t.2 AS auction_name, t.3 AS store_id, t.4 AS published_date,
                   t.5 AS starting_time, t.6 AS ending_time, t.7 AS deleted_at
            FROM (
              SELECT auction_number,
                     argMax(tuple(hmr_auction_id, name, store_id, published_date, starting_time, ending_time, deleted_at),
                            (_airbyte_extracted_at, ifNull(_ab_cdc_cursor, 0))) AS t
              FROM xv3.auctions
              WHERE auction_number IS NOT NULL AND auction_number != ''
              GROUP BY auction_number
            )
          ),
          -- First time each auction was published with a given start time. Unpublishing and
          -- re-publishing an already-running auction (e.g. the month-long online 5xxO
          -- auctions re-published 2026-10-07) isn't a new publication; a relaunch with a
          -- new start time is.
          p AS (
            SELECT auction_number, starting_time, min(published_date) AS first_pub
            FROM xv3.auctions
            WHERE published_date IS NOT NULL
            GROUP BY auction_number, starting_time
          ),
          s AS (SELECT id, any(code) AS code, any(store_name) AS store_name FROM xv3.stores GROUP BY id),
          v AS (
            SELECT auction_number, any(branch) AS branch, uniqExact(lot_number) AS lots, arraySort(groupUniqArray(vendor)) AS vendors,
                   formatDateTime(min(start_date), '%Y-%m-%d %H:%i:%S') AS mart_start,
                   formatDateTime(max(end_date), '%Y-%m-%d %H:%i:%S') AS mart_end
            FROM xv3.mart_auction_vendor_analysis
            WHERE auction_number IN (SELECT auction_number FROM a WHERE published_date > toDateTime64({from:String}, 3) AND published_date <= toDateTime64({to:String}, 3)
                                       AND ({openOnly:UInt8} = 0 OR ending_time > toDateTime64({to:String}, 3)))
            GROUP BY auction_number
          )
          SELECT a.auction_number AS auction_number, a.hmr_id AS hmr_id, a.auction_name AS auction_name,
                 ifNull(s.code, '') AS branch_code, ifNull(s.store_name, '') AS store_name, v.branch AS branch,
                 v.lots AS lots, v.vendors AS vendors, v.mart_start AS mart_start, v.mart_end AS mart_end,
                 formatDateTime(a.published_date, '%Y-%m-%d %H:%i:%S') AS published_date,
                 formatDateTime(a.starting_time, '%Y-%m-%d %H:%i:%S') AS start_date,
                 formatDateTime(a.ending_time, '%Y-%m-%d %H:%i:%S') AS end_date
          FROM a
          INNER JOIN v ON v.auction_number = a.auction_number
          LEFT JOIN s ON s.id = a.store_id
          LEFT JOIN p ON p.auction_number = a.auction_number AND p.starting_time = a.starting_time
          WHERE a.deleted_at IS NULL
            AND a.published_date > toDateTime64({from:String}, 3) AND a.published_date <= toDateTime64({to:String}, 3)
            AND ifNull(p.first_pub, a.published_date) > toDateTime64({from:String}, 3)
            AND ({openOnly:UInt8} = 0 OR a.ending_time > toDateTime64({to:String}, 3))
            AND ifNull(v.branch, '') NOT IN {excluded:Array(String)}
          ORDER BY a.published_date, a.auction_number
        `,
        query_params: { from, to, excluded: EXCLUDED_BRANCHES, openOnly },
        format: "JSONEachRow",
      })
    ).json();
    // Safety check before anything is emailed: the auction's own start/end must agree
    // with the mart (what the dashboard and the Initial/Final emails use) and make
    // sense. Anything that fails is held back — listed under `held` with the reason,
    // never sent — and goes out on a later run once the data agrees (n8n dedupes).
    const auctions = [];
    const held = [];
    for (const r of rows) {
      const reasons = publishedRowProblems(r);
      const item = {
        auctionNumber: r.auction_number,
        auctionName: r.auction_name || "",
        branchCode: r.branch_code || r.branch || "",
        branch: r.branch || r.store_name || "",
        vendors: r.vendors || [],
        lots: Number(r.lots || 0),
        publishedDate: r.published_date,
        startDate: r.start_date,
        endDate: r.end_date,
        link: r.hmr_id ? `https://hmr.ph/auctions/${r.hmr_id}/details#` : "",
      };
      if (reasons.length) held.push({ ...item, martStart: r.mart_start, martEnd: r.mart_end, reasons });
      else auctions.push(item);
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ window: { from, to }, open: !!openOnly, count: auctions.length, auctions, held });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't load published auctions", message: err.message });
  }
}
