// Shared lot-status/approval resolution — moved out of api/overview.js so
// api/leaderboards.js (Vendor Analytics' all-lots aggregate) can reuse the
// EXACT SAME "Sold" definition (Outstanding/Paid/Unpaid/Released, never
// just Paid/Released) instead of redefining it.
//
// vendor_analysis fans out one row per item_barcode within a lot, and
// those rows can disagree on `status` when a lot's items were updated at
// slightly different times mid-transition (e.g. some barcodes flipped to
// 'Released' while a couple stayed at 'Paid'). any(status) is therefore
// non-deterministic — ClickHouse doesn't guarantee which row it picks, so
// the same query can return different Sold/Unsold counts across runs.
//
// Investigated against real data: released_date is populated only on
// 'Released' rows and never on 'Paid' rows, and is shared across all
// truly-Released rows in a lot — confirming Released is a strictly later
// lifecycle stage than Paid, never the reverse. This priority order lets
// argMax(status, priority) deterministically pick the most-advanced
// status per lot instead of an arbitrary one:
//   Released > Paid > Refunded > Returned > Outstanding > Unpaid > Unsold
// Refunded/Returned (rare, real statuses not in the original 5-value set)
// only ever co-occur with Released in the data checked, so their exact
// rank relative to Paid doesn't move any real result — they're ranked
// below Released on the same "actual transaction happened" logic used for
// Unsold: if ANY row in a lot shows real transaction evidence, that
// outranks a status claiming nothing happened.
export const STATUS_PRIORITY_SQL = `
  CASE status
    WHEN 'Released' THEN 7
    WHEN 'Paid' THEN 6
    WHEN 'Refunded' THEN 5
    WHEN 'Returned' THEN 4
    WHEN 'Outstanding' THEN 3
    WHEN 'Unpaid' THEN 2
    WHEN 'Unsold' THEN 1
    ELSE 0
  END
`;

// for_approval_status (xv3.mart_auction_vendor_analysis) is a real warehouse
// field, not a frontend derivation — verified against real data: 1,409,706
// rows 'Approved', 20,864 'For Approval', 70,572 genuinely NULL (no blank
// values found). Deduped the same way as status: item_barcode fan-out rows
// within a lot agree 99.7%+ of the time; for that rare remainder, argMax
// picks the more-advanced state of the approval workflow ('Approved' over
// 'For Approval') by the same "most-advanced-state-wins" logic as
// STATUS_PRIORITY_SQL, rather than an arbitrary any(). A genuinely NULL
// warehouse value is preserved as NULL, never fabricated.
export const APPROVAL_PRIORITY_SQL = `
  CASE for_approval_status
    WHEN 'Approved' THEN 2
    WHEN 'For Approval' THEN 1
    ELSE 0
  END
`;
