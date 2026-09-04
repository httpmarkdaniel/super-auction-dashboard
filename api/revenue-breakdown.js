import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// =========================================================
// REVENUE BREAKDOWN — investigated before writing any of this.
//
// BUSINESS QUESTION: how much revenue did the auction house itself earn,
// and where did it come from — NOT how much bid value settled (that's
// Overview's Total Bid Amount) and NOT what's owed to vendors (that's
// Vendor Payables' total_payable_amount, a different, item-level-fan-out-
// prone calculation). Revenue here means only the two components the
// auction house actually keeps.
//
// AUTHORITATIVE DEFINITIONS — reused exactly, not redefined, from the
// already-validated formulas in api/overview.js's settledServiceIncomeResult:
//   Buyer's Premium Income = sold_price - bid_amount
//   Commission Income      = bid_amount * commission / 100
//   Total Service Income   = Buyer's Premium Income + Commission Income
// on status IN ('Paid','Released') only, deduped by (auction_number,
// lot_number) — vendor_analysis fans out one row per item_barcode within a
// lot, and both buyers_premium/commission are payable-level-constant rate
// fields (confirmed in api/overview.js's own investigation), so any() is a
// safe dedup, matching that file's established pattern.
//
// CURRENT ARCHITECTURE AUDIT (before writing this file): the existing
// "Revenue Breakdown" tab (RevenueBreakdownView.jsx -> MoneyFlowWaterfall)
// reads overview.moneyFlow, built in App.jsx from kpis.total_commission /
// kpis.total_buyers_premium / kpis.total_service_fee — none of which
// api/overview.js actually returns (confirmed: zero matches for those
// three field names anywhere in api/overview.js). Every one of those
// Number(...) reads silently defaults to 0, so "Commission"/"Buyer's
// Premium"/"Service Fee" have always rendered as ₱0, and "Net Vendor
// Payable" has always just been the raw Total Bid Amount, mislabeled —
// completely dead, not a real feature. This endpoint replaces it outright;
// nothing from the old dead fields is reused.
//
// EXTRA FEE FIELDS — investigated and excluded. Checked other_fee,
// assessment_fee, buy_back_amount, buy_back on settled
// (Paid/Released) rows:
//   other_fee:        811 / 1,429,468 rows nonzero (0.057%), sum ~₱15.4M
//   assessment_fee:  6,767 / 1,429,468 rows nonzero (0.47%),  sum ~₱15.5M
//   buy_back_amount: 2,537 / 1,429,468 rows nonzero (0.18%),  sum ~₱1.4M
//   buy_back:        2,499 / 1,429,468 rows nonzero (0.17%),  sum ~₱0.15M
// All four are sparse, undocumented, and NOT part of the validated
// Service Income formula. Sampled rows show no consistent relationship to
// bid_amount/sold_price (e.g. a flat ₱100 "assessment_fee" on a ₱130 lot),
// and "buy_back" strongly suggests a vendor-side repurchase, not house
// revenue. None are provably revenue, so none are included — see final
// report for the same evidence.
//
// mart_auction_productivity_report ALSO carries its own total_buyers_premium/
// total_service_fee columns (pre-aggregated per auction) — checked these
// directly against auction 5433MS and got 0 for total_bid_amount too,
// despite that auction having real, nonzero settled activity elsewhere in
// this app. That pre-aggregate is unreliable/stale and is NOT used here;
// every revenue figure in this file is computed fresh from
// xv3.mart_auction_vendor_analysis, the same source api/overview.js uses.
//
// GRAIN: category and branch allocation ARE mathematically safe here,
// unlike Vendor Payables — Service Income is a genuine LOT-level value (one
// lot belongs to exactly one category, one store), not a payable spanning
// multiple lots/categories. One flat per-lot query is aggregated multiple
// ways client-side (by branch, category, auction, day) — same rows, so
// every SUM(breakdown) = Total Service Income check holds by construction,
// not by coincidence.
//
// TREND DATE: uses auction ending_time (the same field the whole
// population is now scoped by — an auction belongs to the period in which
// it ENDS, per the canonical historical-attribution rule applied
// dashboard-wide), NOT starting_time and NOT date_time_paid/released_date.
// Three reasons: (1) it's required to reconcile exactly with Overview's own
// Service Income figure, which scopes by ending_time — using a different
// date field for the trend would still let the KPI totals match but would
// misrepresent this trend as a real day of the same figure; (2)
// date_time_paid is populated on 'Paid' rows and released_date on
// 'Released' rows, never both — coalescing them would introduce a second,
// less-validated date convention; (3) bid_created_at (bid-event activity
// timestamps) is never used for a settled-revenue metric.
//
// FILTERS: Store + Date Range only, matching every other real tab. No
// category filter — this is its own tab, not coupled to Overview's
// category selector, per explicit instruction.
// =========================================================

export default async function handler(req, res) {
  try {
    const { from, to, store = "" } = req.query;
    const queryParams = { from, to, store };

    const result = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT
            auction_number,
            any(store_name) AS auction_store_name,
            any(name) AS auction_name,
            min(starting_time) AS auction_starting_time,
            any(ending_time) AS auction_ending_time
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
          GROUP BY auction_number
        ),

        auction_type AS (
          SELECT auction_number, any(type) AS auction_type
          FROM xv3.auctions
          WHERE auction_number IS NOT NULL
          GROUP BY auction_number
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.name) AS name,
            any(v.vendor) AS vendor,
            any(ifNull(v.bid_amount, 0)) AS bid_amount,
            any(ifNull(v.sold_price, 0)) AS sold_price,
            any(ifNull(v.commission, 0)) AS commission_pct,
            any(v.status) AS status,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number
        )

        SELECT
          sl.auction_number AS auction_number,
          sl.lot_number AS lot_number,
          sl.name AS name,
          sl.vendor AS vendor,
          sl.status AS status,
          sl.category AS category,
          sl.bid_amount AS bid_amount,
          (sl.sold_price - sl.bid_amount) AS buyers_premium_income,
          (sl.bid_amount * sl.commission_pct / 100) AS commission_income,

          a.auction_store_name AS store_name,
          a.auction_name AS auction_name,
          a.auction_starting_time AS starting_time,
          a.auction_ending_time AS ending_time,
          at.auction_type AS auction_type

        FROM settled_lots sl

        INNER JOIN selected_auctions a
          ON sl.auction_number = a.auction_number

        LEFT JOIN auction_type at
          ON sl.auction_number = at.auction_number

        ORDER BY sl.auction_number, sl.lot_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const rows = await result.json();

    const mappedRows = rows.map((row) => ({
      auction_number: row.auction_number,
      lot_number: row.lot_number,
      name: row.name,
      vendor: row.vendor,
      status: row.status,
      category: row.category,
      store_name: row.store_name,
      auction_name: row.auction_name,
      auction_type: row.auction_type ?? null,
      starting_time: row.starting_time,
      ending_time: row.ending_time,
      bid_amount: Number(row.bid_amount ?? 0),
      buyers_premium_income: Number(row.buyers_premium_income ?? 0),
      commission_income: Number(row.commission_income ?? 0),
    }));

    // Vercel P0 usage fix (round 2): Revenue Breakdown is historical/
    // filter-driven (see useRevenueBreakdown.js — no automatic timer calls
    // this any more, only mount/store/date-range change/manual refresh),
    // and the response is a shared, unauthenticated warehouse aggregate —
    // safe to cache at the CDN. This endpoint's own documented cost risk
    // (an unbounded scan when a very wide range is requested) is a query
    // concern, untouched here; caching just prevents back-to-back
    // repeat requests for the SAME range/store from re-running it.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({ rows: mappedRows });
  } catch (err) {
    console.error("Revenue breakdown API error:", err);

    return res.status(500).json({
      error: "Failed to load revenue breakdown",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
