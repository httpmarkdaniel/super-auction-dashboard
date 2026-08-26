import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// =========================================================
// VENDOR PAYABLES — investigated against real xv3.mart_auction_payables
// data before writing any of this. Key findings that shaped everything
// below:
//
// GRAIN: this table fans out one row per ITEM within a payable (~1.03M
// rows for ~9,229 distinct payable_id values) — every payable-level field
// (payable_amount, total_payable_amount, total_bid_amount,
// total_commission, total_costs, payment_status, vendor, store_name,
// payable_remarks/"sales period", generate_date, remitted_date) is
// REPEATED IDENTICALLY across every item row of the same payable_id
// (verified: 0/9,229 payables have more than one distinct value for any
// of these fields). Naively SUM()ing across raw rows multiplies every
// payable's amount by its item count. Every query below dedupes to one
// row per payable_id FIRST (any() aggregation), then aggregates that
// deduped population — never the raw table.
//
// STATUS: `status` is a constant ("Submitted") across all 1,034,497 rows
// — not a useful signal, not used anywhere below. `payment_status` is the
// real, payable-level, 4-valued field: On Process, Remitted, Available,
// Released. Business-confirmed mapping (not a data-derived inference —
// confirmed directly as the authoritative rule):
//   Paid / Remitted   = payment_status IN ('Remitted', 'Released')
//   Outstanding       = payment_status IN ('On Process', 'Available')
// The full undisguised 4-way breakdown is always returned alongside the
// two-way summary so the real warehouse states are never hidden.
//
// CATEGORY: investigated and confirmed NOT implementable as a filter or
// a per-payable dimension. item_master_name exists per item row, so
// item-level classification is possible in principle — but a payable's
// dollar amount cannot be safely split across categories: for payables
// generated since 2025-01-01, payables spanning MULTIPLE categories
// account for 57.9% of total payable dollar value, and item-level
// `final_price` fails to reconcile to payable-level `payable_amount` for
// payables representing 38.6% of total dollar value warehouse-wide.
// Category is therefore not computed or surfaced anywhere in this file.
//
// AUCTION GRAIN: the same problem recurs one level down. Among payables
// that have a non-null auction_number at all, 41.8% span MULTIPLE DISTINCT
// auction_numbers — so "per auction" totals have the identical
// duplication risk category totals do. The authoritative, non-duplicating
// grain is the PAYABLE, not the auction. Detail rows are therefore one
// row per payable_id (never per auction, never per raw item), with an
// auction_number/auction_count field that's the real single auction_number
// when there's exactly one, and an explicit "Multiple (N)" signal
// otherwise — never silently picking one of several.
//
// AMOUNT FIELD: `total_payable_amount` (= payable_amount - total_costs)
// is used as the authoritative "amount owed" figure.
//
// DATE RANGE: deliberately NOT applied — a payables backlog is a running
// balance (a stock), not a per-period flow. Store filter still applies,
// since store_name is confirmed payable-level/reliable.
//
// TREND: only a payable-generation trend (by generate_date) is
// implemented. remitted_date exists but its sparse, status-uneven
// population makes it untrustworthy as a "money paid over time" series.
// =========================================================

const PAID_STATUSES = ["Remitted", "Released"];

export default async function handler(req, res) {
  try {
    const { store = "" } = req.query;
    const queryParams = { store };

    // One row per payable_id — the authoritative, non-duplicating grain
    // for every KPI/breakdown below.
    const payablesResult = await client.query({
      query: `
        SELECT
          payable_id,
          any(vendor) AS vendor,
          any(store_name) AS payable_store_name,
          any(payment_status) AS payment_status,
          any(generate_date) AS generate_date,
          any(remitted_date) AS remitted_date,
          any(payable_remarks) AS payable_remarks,
          any(total_bid_amount) AS total_bid_amount,
          any(total_commission) AS total_commission,
          any(total_payable_amount) AS total_payable_amount,
          uniqExactIf(auction_number, auction_number IS NOT NULL AND auction_number != '') AS distinct_auction_count,
          if(
            uniqExactIf(auction_number, auction_number IS NOT NULL AND auction_number != '') = 1,
            anyIf(auction_number, auction_number IS NOT NULL AND auction_number != ''),
            NULL
          ) AS single_auction_number

        FROM xv3.mart_auction_payables

        WHERE ({store:String} = '' OR store_name = {store:String})

        GROUP BY payable_id
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const rows = await payablesResult.json();

    const isPaid = (r) => PAID_STATUSES.includes(r.payment_status);

    let totalPayables = 0;
    let paidAmount = 0;
    let outstandingAmount = 0;
    let pendingCount = 0;
    const outstandingVendorSet = new Set();
    const byStatus = new Map();
    const byVendorOutstanding = new Map();
    const byMonth = new Map();

    for (const r of rows) {
      const amt = Number(r.total_payable_amount) || 0;
      totalPayables += amt;

      const statusKey = r.payment_status || "Unknown";
      const statusBucket = byStatus.get(statusKey) || { amount: 0, count: 0 };
      statusBucket.amount += amt;
      statusBucket.count += 1;
      byStatus.set(statusKey, statusBucket);

      if (isPaid(r)) {
        paidAmount += amt;
      } else {
        outstandingAmount += amt;
        pendingCount += 1;
        if (r.vendor) outstandingVendorSet.add(r.vendor);

        const vendorKey = r.vendor || "Unknown Vendor";
        const vendorBucket = byVendorOutstanding.get(vendorKey) || { amount: 0, count: 0 };
        vendorBucket.amount += amt;
        vendorBucket.count += 1;
        byVendorOutstanding.set(vendorKey, vendorBucket);
      }

      if (r.generate_date) {
        const monthKey = String(r.generate_date).slice(0, 7); // YYYY-MM
        const monthBucket = byMonth.get(monthKey) || { amount: 0, count: 0 };
        monthBucket.amount += amt;
        monthBucket.count += 1;
        byMonth.set(monthKey, monthBucket);
      }
    }

    const paymentRate = totalPayables > 0 ? Number(((paidAmount / totalPayables) * 100).toFixed(1)) : 0;

    const byVendorOutstandingSorted = [...byVendorOutstanding.entries()]
      .map(([vendor, v]) => ({ vendor, amount: v.amount, payable_count: v.count }))
      .sort((a, b) => b.amount - a.amount);

    const monthsSorted = [...byMonth.keys()].sort();
    const trendMonths = monthsSorted.slice(-12);

    // Auction name (only meaningful/attempted for single-auction payables)
    const singleAuctionNumbers = [...new Set(rows.map((r) => r.single_auction_number).filter(Boolean))];
    let auctionNames = {};
    if (singleAuctionNumbers.length > 0) {
      const nameResult = await client.query({
        query: `
          SELECT DISTINCT auction_number, any(name) AS name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IN ({auctionNumbers:Array(String)})
          GROUP BY auction_number
        `,
        query_params: { auctionNumbers: singleAuctionNumbers },
        format: "JSONEachRow",
      });
      const nameRows = await nameResult.json();
      auctionNames = Object.fromEntries(nameRows.map((r) => [r.auction_number, r.name]));
    }

    return res.status(200).json({
      total_payables: totalPayables,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
      payment_rate_pct: paymentRate,
      pending_count: pendingCount,
      vendors_with_outstanding: outstandingVendorSet.size,
      paid_statuses: PAID_STATUSES,

      by_status: [...byStatus.entries()].map(([status, v]) => ({
        payment_status: status,
        amount: v.amount,
        count: v.count,
      })),

      outstanding_by_vendor: byVendorOutstandingSorted.slice(0, 10),
      outstanding_by_vendor_total_count: byVendorOutstandingSorted.length,

      trend_by_month: trendMonths.map((m) => ({ month: m, amount: byMonth.get(m).amount, count: byMonth.get(m).count })),

      // Full Detail — one row per payable_id (the authoritative grain),
      // not per auction and not per raw item. Not capped: the "SUM of
      // detail rows == Total Payables" invariant must hold exactly.
      detail: rows.map((r) => ({
        payable_id: r.payable_id,
        vendor: r.vendor,
        store_name: r.payable_store_name,
        auction_number: r.single_auction_number ?? null,
        auction_count: Number(r.distinct_auction_count) || 0,
        auction_name: r.single_auction_number ? auctionNames[r.single_auction_number] ?? null : null,
        sales_period: r.payable_remarks,
        payment_status: r.payment_status,
        total_bid_amount: Number(r.total_bid_amount) || 0,
        total_commission: Number(r.total_commission) || 0,
        total_payable_amount: Number(r.total_payable_amount) || 0,
        generate_date: r.generate_date,
        remitted_date: r.remitted_date,
      })),
    });
  } catch (err) {
    console.error("Payables API error:", err);

    return res.status(500).json({
      error: "Failed to load vendor payables",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
