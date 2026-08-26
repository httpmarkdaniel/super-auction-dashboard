import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";
import { BIDDER_IDENTITY_CTES } from "./_bidderIdentity.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// Identical, unmodified copy of api/overview.js's own validated
// STATUS_PRIORITY_SQL/APPROVAL_PRIORITY_SQL (see that file's comments for
// the full investigation behind these). Duplicated rather than imported so
// this endpoint stays fully isolated from Overview's file — api/overview.js
// is explicitly out of scope for this feature.
const STATUS_PRIORITY_SQL = `
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

const APPROVAL_PRIORITY_SQL = `
  CASE for_approval_status
    WHEN 'Approved' THEN 2
    WHEN 'For Approval' THEN 1
    ELSE 0
  END
`;

const SETTLED_STATUSES = ["Paid", "Released"];

// =========================================================
// FULL AUCTION DETAIL — investigated before writing any of this.
//
// GRAIN: auction-level summary (client-computed by rolling up this
// endpoint's lot rows, same pattern already used by
// AuctionSummaryTable.jsx) + per-lot detail on demand. A lot-level query
// must dedupe to (auction_number, lot_number) — reused exactly the same
// pattern already validated in api/overview.js's type=lots/service-income
// (GROUP BY auction_number, lot_number; argMax(status, STATUS_PRIORITY_SQL)
// for a deterministic single status per lot despite vendor_analysis's
// item_barcode fan-out).
//
// AUCTION TYPE vs CATEGORY vs SUB TYPE — three distinct real fields,
// investigated separately so they're never conflated:
//   - Auction Type: xv3.auctions.type ('Online', 'Onsite', 'Negotiated',
//     'Live', 'Simulcast', 'EOI') — confirmed constant per auction_number,
//     matches the channel concept used throughout prior identity-bridge
//     investigation (Negotiated auctions confirmed 100% zero xv3.postings
//     coverage here too).
//   - Category: the same lot-level CATEGORY_CLASSIFICATION_SQL taxonomy
//     used everywhere else in this app (General Merchandise / Vehicles and
//     Automotive / Equipment and Industrial / Bulk Auction) — NOT a
//     different taxonomy. An auction's distinct lot categories are listed
//     together (e.g. "General Merchandise + Bulk Auction") rather than
//     forcing one arbitrary category onto a multi-category auction —
//     confirmed real multi-category auctions exist (e.g. "4894MS" spans
//     all 4 categories).
//   - Sub Type: xv3.mart_auction_productivity_report.sub_type ('At
//     Branch', 'Onsite', or NULL) — a separate, real warehouse field.
//
// TOTAL BID AMOUNT / SERVICE INCOME: unchanged approved definitions, not
// redefined here. Total Bid Amount = SUM(bid_amount) for Paid/Released
// lots only. Service Income = buyers_premium_income + commission_income,
// computed with the SAME formula already validated in api/overview.js's
// type=service-income (buyers_premium_income = sold_price - bid_amount,
// commission_income = bid_amount * commission_pct / 100), restricted to
// the same Paid/Released population — a non-settled lot contributes ₱0 to
// both, never a fabricated/negative value from an unset sold_price.
//
// WINNING BIDDER IDENTITY: reuses BIDDER_IDENTITY_CTES UNMODIFIED (the
// same primary postings bridge + payments fallback bridge already
// canonical for Bidder Composition/Top-Bidders-by-auction), joined at
// (auction_number, lot_number) grain via its own resolved_lot_identity
// CTE — already lot-grained, no new bridge needed. A settled lot whose
// identity resolves through neither path shows a truthful "Unavailable"
// (never fabricated); a non-settled lot shows "—" (no winner yet).
// display name (First Last) is resolved from the same canonical email via
// one small additive lookup against cms.mart_cms_bidder_registrations —
// this does not touch or duplicate the identity bridge itself, only adds
// a display-name lookup on top of its already-resolved output.
//
// COVERAGE NOTE vs Top Bidders: api/leaderboards.js's settledBiddersResult
// (Top 10 Bidders panel) uses ONLY the primary (postings) bridge — no
// payments fallback — so it under-resolves negotiated-channel winners
// relative to both Bidder Composition and this endpoint's Winning Bidder,
// which both use the full BIDDER_IDENTITY_CTES. This is a pre-existing
// discrepancy, not introduced here — flagged in the implementation report.
//
// SCOPE: "Participating bidders" (anyone who placed a bid, not just the
// winner) is NOT implemented in this phase — it would need a new query
// against cms.mart_cms_bid_history_report, a separate data source from
// everything else on this page. Only WINNING bidder identity/composition
// (per lot and rolled up per auction, New vs Returning via the same
// bidder_first_ever definition leaderboards.js already uses) is included.
//
// FILTERS: Store + Date Range (auction starting_time), matching every
// other real tab in this app. No category filter in this phase — Full
// Auction Detail is its own tab, not coupled to Overview's category
// selector.
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
            store_name,
            any(name) AS auction_name,
            any(sub_type) AS sub_type,
            min(starting_time) AS auction_starting_time,
            max(ending_time) AS auction_ending_time
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
          GROUP BY auction_number, store_name
        ),

        auction_type AS (
          SELECT auction_number, any(type) AS auction_type
          FROM xv3.auctions
          WHERE auction_number IS NOT NULL
          GROUP BY auction_number
        ),

        all_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.name) AS name,
            any(v.vendor) AS vendor,
            argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
            argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
            max(ifNull(v.reserved_price, 0)) AS reserved_price,
            any(ifNull(v.bid_amount, 0)) AS bid_amount,
            any(ifNull(v.sold_price, 0)) AS sold_price,
            any(ifNull(v.commission, 0)) AS commission_pct,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category,
            any(a.store_name) AS store_name

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number
        ),

        -- Required shape for BIDDER_IDENTITY_CTES: (auction_number,
        -- lot_number, or_number, date_time_paid), settled-only grain —
        -- same pattern api/leaderboards.js already builds.
        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.or_number) AS or_number,
            any(v.date_time_paid) AS date_time_paid

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number
        ),

        ${BIDDER_IDENTITY_CTES},

        -- Additive display-name lookup on top of the already-resolved
        -- canonical email — does not alter or duplicate the identity
        -- bridge itself.
        bidder_display_name AS (
          SELECT
            lowerUTF8(trim(email)) AS bn_email,
            any(customer_firstname) AS firstname,
            any(customer_lastname) AS lastname
          FROM cms.mart_cms_bidder_registrations
          WHERE email IS NOT NULL
          GROUP BY bn_email
        )

        SELECT
          l.auction_number AS auction_number,
          l.lot_number AS lot_number,
          l.name AS name,
          l.vendor AS vendor,
          l.status AS status,
          l.for_approval_status AS for_approval_status,
          l.reserved_price AS reserved_price,
          l.bid_amount AS bid_amount,
          l.sold_price AS sold_price,
          l.commission_pct AS commission_pct,
          l.category AS category,
          l.store_name AS store_name,

          if(l.status IN ('Paid', 'Released'), l.sold_price - l.bid_amount, 0) AS buyers_premium_income,
          if(l.status IN ('Paid', 'Released'), l.bid_amount * l.commission_pct / 100, 0) AS commission_income,

          -- Same disposition definition as api/overview.js's type=lots
          -- (duplicated intentionally, not imported — see file header).
          -- Guarantees Listed = Sold + Unsold exactly, unlike a strict
          -- status='Unsold' comparison which would exclude Refunded/
          -- Returned lots from both buckets.
          if(
            l.status IN ('Outstanding', 'Paid', 'Unpaid', 'Released'),
            'Sold',
            'Unsold'
          ) AS disposition,

          ri.resolved_email AS winning_bidder_email,
          bdn.firstname AS winning_bidder_firstname,
          bdn.lastname AS winning_bidder_lastname,

          sa.auction_name AS auction_name,
          sa.sub_type AS sub_type,
          sa.auction_starting_time AS starting_time,
          sa.auction_ending_time AS ending_time,
          at.auction_type AS auction_type

        FROM all_lots l

        INNER JOIN selected_auctions sa
          ON l.auction_number = sa.auction_number

        LEFT JOIN auction_type at
          ON l.auction_number = at.auction_number

        LEFT JOIN resolved_lot_identity ri
          ON l.auction_number = ri.ri_auction_number AND l.lot_number = ri.ri_lot_number

        LEFT JOIN bidder_display_name bdn
          ON ri.resolved_email = bdn.bn_email

        ORDER BY l.auction_number, l.lot_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const rows = await result.json();

    const mappedRows = rows.map((row) => {
      const isSettled = SETTLED_STATUSES.includes(row.status);
      const winningBidderName = [row.winning_bidder_lastname, row.winning_bidder_firstname]
        .filter(Boolean)
        .join(", ");
      return {
        auction_number: row.auction_number,
        lot_number: row.lot_number,
        name: row.name,
        vendor: row.vendor,
        store_name: row.store_name,
        category: row.category,
        status: row.status,
        disposition: row.disposition,
        for_approval_status: row.for_approval_status ?? null,
        reserved_price: Number(row.reserved_price ?? 0),
        bid_amount: Number(row.bid_amount ?? 0),
        sold_price: Number(row.sold_price ?? 0),
        buyers_premium_income: Number(row.buyers_premium_income ?? 0),
        commission_income: Number(row.commission_income ?? 0),
        // Truthful, never-fabricated winner display: no winner yet for a
        // non-settled lot, "Unavailable" for a settled lot neither bridge
        // could resolve, otherwise the resolved name (or email if no CMS
        // registration name is on file for that email).
        winning_bidder: !isSettled ? null : winningBidderName || row.winning_bidder_email || "Unavailable",
        auction_name: row.auction_name,
        auction_type: row.auction_type ?? null,
        sub_type: row.sub_type ?? null,
        starting_time: row.starting_time,
        ending_time: row.ending_time,
      };
    });

    return res.status(200).json({ rows: mappedRows });
  } catch (err) {
    console.error("Auction detail API error:", err);

    return res.status(500).json({
      error: "Failed to load auction detail",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
