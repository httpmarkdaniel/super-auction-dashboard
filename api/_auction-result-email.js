import { createClient } from "@clickhouse/client";
import XLSX from "xlsx-js-style";
import { buildAuctionResultWorkbook, excelFileName } from "../src/utils/auctionResultWorkbook.js";

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
// window, grouped one email per vendor + branch + auction end time, each
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

export async function handleAuctionResultEmail(req, res) {
  let window_;
  try {
    window_ = resolveWindow(req.query);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    // Same item-barcode grain/columns as type=auction-result-export, for
    // every lot of each vendor's auctions that ended in the window.
    const lots = await (
      await client.query({
        query: `
          WITH ended AS (
            SELECT v.vendor AS vendor, v.branch AS branch, v.auction_number AS auction_number
            FROM xv3.mart_auction_vendor_analysis v
            WHERE v.end_date IS NOT NULL AND v.branch NOT IN {excluded:Array(String)}
            GROUP BY v.vendor, v.branch, v.auction_number
            HAVING max(v.end_date) > toDateTime64({from:String}, 3, 'UTC')
               AND max(v.end_date) <= toDateTime64({to:String}, 3, 'UTC')
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
        query_params: { ...window_, excluded: EXCLUDED_BRANCHES },
        format: "JSONEachRow",
      })
    ).json();

    const rows = lots.map((r) => ({
      ...r,
      qty: r.qty == null ? null : Number(r.qty),
      bp_percent: r.bp_percent == null ? null : Number(r.bp_percent),
      sf_percent: r.sf_percent == null ? null : Number(r.sf_percent),
      bid_amount: Number(r.bid_amount ?? 0),
      reserved_price: Number(r.reserved_price ?? 0),
    }));

    // Each auction's end = its latest lot end_date (same as Top Info).
    const auctionEnd = new Map();
    for (const r of rows) {
      const k = `${r.vendor}\u0000${r.branch}\u0000${r.auction_number}`;
      if (!auctionEnd.has(k) || r.end_date > auctionEnd.get(k)) auctionEnd.set(k, r.end_date);
    }

    // One email per vendor + branch + auction end time.
    const groups = new Map();
    for (const r of rows) {
      const end = auctionEnd.get(`${r.vendor}\u0000${r.branch}\u0000${r.auction_number}`);
      const key = `${r.vendor} | ${r.branch} | ${end}`;
      if (!groups.has(key)) groups.set(key, { key, vendor: r.vendor, branch: r.branch, endDate: end, rows: [] });
      groups.get(key).rows.push(r);
    }

    const out = [...groups.values()].map((g) => {
      // Sales Summary — same arithmetic as type=auction-result: lots are
      // distinct (auction_number, lot_number) pairs; totals are their own
      // distinct count, never a sum of the grouped rows.
      const byStatus = new Map();
      const allLots = new Set();
      let totalReserved = 0;
      let totalBid = 0;
      for (const r of g.rows) {
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

      // Email body table only: Paid and Released shown as one "Paid/Released"
      // row (distinct lots across both, so a lot under each isn't counted
      // twice). The Excel keeps the dashboard's own separate rows.
      const emailStatus = (v) => (v === "Paid" || v === "Released" ? "Paid/Released" : cleanStatus(v));
      const byEmailStatus = new Map();
      for (const r of g.rows) {
        const ek = `${emailStatus(r.payment_status)} ${cleanStatus(r.for_approval_status)}`;
        if (!byEmailStatus.has(ek))
          byEmailStatus.set(ek, { payment_status: emailStatus(r.payment_status), for_approval_status: cleanStatus(r.for_approval_status), lots: new Set(), reserved_price: 0, bid_amount: 0 });
        const e = byEmailStatus.get(ek);
        e.lots.add(`${r.auction_number} ${r.lot_number}`);
        e.reserved_price += r.reserved_price;
        e.bid_amount += r.bid_amount;
      }
      const emailSummaryRows = [...byEmailStatus.values()]
        .map((e) => ({ payment_status: e.payment_status, for_approval_status: e.for_approval_status, count_of_lot: e.lots.size, reserved_price: e.reserved_price, bid_amount: e.bid_amount }))
        .sort((a, b) => b.count_of_lot - a.count_of_lot);

      const topInfoMap = new Map();
      for (const r of g.rows) {
        const k = `${r.vendor}\u0000${r.account_executive}\u0000${r.branch}\u0000${r.auction_number}`;
        const t = topInfoMap.get(k);
        if (!t) topInfoMap.set(k, { vendor: r.vendor, account_executive: r.account_executive, branch: r.branch, auction_number: r.auction_number, end_date: r.end_date });
        else if (r.end_date > t.end_date) t.end_date = r.end_date;
      }
      const topInfo = [...topInfoMap.values()].sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));

      const wb = buildAuctionResultWorkbook({
        totals,
        rows: summaryRows,
        topInfo,
        detailed: { rows: g.rows, truncated: false, truncationNote: null },
      });
      const day = String(g.endDate).slice(0, 10);

      return {
        key: g.key,
        vendor: g.vendor,
        branch: g.branch,
        endDate: String(g.endDate).slice(0, 19),
        auctionNumbers: [...new Set(g.rows.map((r) => r.auction_number))].sort(),
        accountExecutives: [...new Set(g.rows.map((r) => r.account_executive).filter(Boolean))].sort(),
        summaryRows,
        emailSummaryRows,
        totals,
        fileName: excelFileName({ vendor: g.vendor, from: day, to: day }),
        xlsxBase64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
      };
    });
    out.sort((a, b) => a.endDate.localeCompare(b.endDate) || a.vendor.localeCompare(b.vendor));

    res.setHeader("Cache-Control", "no-store");
    const stage = req.query.stage === "final" ? "final" : "initial";
    return res.status(200).json({ stage, window: window_, count: out.length, groups: out });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't build auction result emails", message: err.message });
  }
}
