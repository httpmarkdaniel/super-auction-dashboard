// Shared deterministic bidder-identity resolution for settled (Paid/Released)
// lots, used by every Bidder Composition query in api/leaderboards.js so the
// definition can never drift between them (same convention as
// api/_category.js's CATEGORY_CLASSIFICATION_SQL).
//
// Requires a `settled_lots` CTE already in scope with at least these
// columns: auction_number, lot_number, or_number, date_time_paid — the same
// settled_lots CTE every settled query already builds off
// xv3.mart_auction_vendor_analysis.
//
// PRIMARY (competitive) bridge — unchanged from the original
// implementation, still the first thing tried for every lot:
//   vendor_analysis (auction_number, lot_number)
//     -> xv3.postings (auction_id, lot_number -> customer_id)
//     -> xv3.customers (customer_id -> hmr_customer_id)
//     -> cms.mart_cms_bidder_registrations (customer_id -> plaintext email)
//
// FALLBACK (negotiated) bridge — used only when the primary bridge cannot
// resolve a lot (e.g. auction_type = 'Negotiated' sales, which never post
// through xv3.postings at all since no online bid ever took place).
// Investigated and validated: a bare vendor_analysis.or_number match against
// xv3.payments.or_number is UNSAFE (OR numbers get reused over the years —
// tested at a 34% wrong-person rate across 1,040 historical Negotiated
// lots). Requiring the EXACT compound match
// (or_number AND vendor_analysis.date_time_paid = payments.process_date)
// eliminates that: validated at 0% disagreement against the independently
// -recorded vendor_analysis.bidder_name across every lot it resolved.
//   vendor_analysis (or_number, date_time_paid)
//     -> xv3.payments (or_number, process_date)  [exact compound match only —
//        never or_number alone]
//     -> xv3.customers (customer_id -> hmr_customer_id)
//     -> cms.mart_cms_bidder_registrations (customer_id -> plaintext email)
//
// Canonical identity is always the resolved plaintext EMAIL, never a numeric
// customer_id — a bidder with multiple CMS customer_id registrations (a
// real, if uncommon, pattern) collapses onto one identity this way rather
// than being double-counted.
//
// A lot whose identity resolves through NEITHER path is genuinely
// unresolved (first_ever_at IS NULL downstream) — never guessed into New or
// Returning.
export const BIDDER_IDENTITY_CTES = `
  posting_customer AS (
    SELECT
      au.auction_number AS pc_auction_number,
      p.lot_number AS pc_lot_number,
      any(p.customer_id) AS pc_customer_id
    FROM xv3.postings p
    INNER JOIN xv3.auctions au ON p.auction_id = au.auction_id
    WHERE p.customer_id IS NOT NULL AND p.customer_id != 0
    GROUP BY au.auction_number, p.lot_number
  ),

  payments_customer AS (
    SELECT
      or_number AS pay_or_number,
      process_date AS pay_process_date,
      any(customer_id) AS pay_customer_id
    FROM xv3.payments
    WHERE or_number IS NOT NULL AND customer_id IS NOT NULL AND process_date IS NOT NULL
    GROUP BY or_number, process_date
  ),

  customer_bridge AS (
    SELECT
      customer_id AS br_customer_id,
      any(hmr_customer_id) AS br_hmr_customer_id
    FROM xv3.customers
    WHERE hmr_customer_id IS NOT NULL
    GROUP BY customer_id
  ),

  cms_bidder_email AS (
    SELECT
      customer_id AS cb_customer_id,
      any(lowerUTF8(trim(email))) AS cb_email
    FROM cms.mart_cms_bidder_registrations
    WHERE customer_id IS NOT NULL AND email IS NOT NULL
    GROUP BY customer_id
  ),

  -- Per-lot canonical identity: primary bridge first, negotiated-payments
  -- bridge only as a fallback (COALESCE), matching the priority order the
  -- business rule requires.
  resolved_lot_identity AS (
    SELECT
      sl.auction_number AS ri_auction_number,
      sl.lot_number AS ri_lot_number,
      COALESCE(cb_comp.cb_email, cb_neg.cb_email) AS resolved_email
    FROM settled_lots sl
    LEFT JOIN posting_customer pc
      ON sl.auction_number = pc.pc_auction_number AND sl.lot_number = pc.pc_lot_number
    LEFT JOIN customer_bridge br_comp ON pc.pc_customer_id = br_comp.br_customer_id
    LEFT JOIN cms_bidder_email cb_comp ON br_comp.br_hmr_customer_id = cb_comp.cb_customer_id
    LEFT JOIN payments_customer pay
      ON sl.or_number = pay.pay_or_number AND sl.date_time_paid = pay.pay_process_date
    LEFT JOIN customer_bridge br_neg ON pay.pay_customer_id = br_neg.br_customer_id
    LEFT JOIN cms_bidder_email cb_neg ON br_neg.br_hmr_customer_id = cb_neg.cb_customer_id
  ),

  -- Earliest-ever COMPETITIVE bid per email, across all of bid_history, not
  -- scoped to the selected range or store — unchanged definition.
  bidder_first_competitive AS (
    SELECT
      lowerUTF8(trim(email)) AS fc_bidder_key,
      min(bid_created_at) AS first_competitive_at
    FROM cms.mart_cms_bid_history_report
    WHERE bid_created_at IS NOT NULL AND email IS NOT NULL AND trim(email) != ''
    GROUP BY fc_bidder_key
  ),

  -- Every settled (Paid/Released) lot warehouse-wide, all-time — the
  -- population the negotiated/payments bridge is resolved against to find
  -- a bidder's earliest-ever payments-bridge-resolved purchase.
  --
  -- Deliberately NOT restricted to auction_type = 'Negotiated': the
  -- payments fallback bridge in resolved_lot_identity above applies to any
  -- settled lot whose primary (postings) bridge fails, regardless of that
  -- lot's auction type — confirmed against real data with auction "AA114"
  -- (type 'Online', not 'Negotiated', but zero xv3.postings rows for the
  -- same "never posted through xv3.postings" reason). Filtering this
  -- historical lookup to type='Negotiated' would make a bidder's OWN past
  -- transaction invisible to their own first-ever-participation lookup
  -- whenever that past transaction wasn't itself on a Negotiated-typed
  -- auction, which is exactly backwards.
  fallback_resolved_settled_lots AS (
    SELECT
      v.auction_number AS auction_number,
      v.lot_number AS lot_number,
      any(v.or_number) AS or_number,
      any(v.date_time_paid) AS date_time_paid
    FROM xv3.mart_auction_vendor_analysis v
    WHERE v.status IN ('Paid', 'Released')
      AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
    GROUP BY v.auction_number, v.lot_number
  ),

  bidder_first_negotiated AS (
    SELECT
      cb.cb_email AS fn_bidder_key,
      min(frl.date_time_paid) AS first_negotiated_at
    FROM fallback_resolved_settled_lots frl
    INNER JOIN payments_customer pay
      ON frl.or_number = pay.pay_or_number AND frl.date_time_paid = pay.pay_process_date
    INNER JOIN customer_bridge br ON pay.pay_customer_id = br.br_customer_id
    INNER JOIN cms_bidder_email cb ON br.br_hmr_customer_id = cb.cb_customer_id
    GROUP BY cb.cb_email
  ),

  -- first_ever_auction_participation = LEAST(first competitive, first
  -- negotiated) per canonical email — whichever came first, from either
  -- channel. An email with only one side present simply uses that side.
  bidder_first_ever AS (
    SELECT
      fe_key,
      min(fe_at) AS first_ever_at
    FROM (
      SELECT fc_bidder_key AS fe_key, first_competitive_at AS fe_at FROM bidder_first_competitive
      UNION ALL
      SELECT fn_bidder_key AS fe_key, first_negotiated_at AS fe_at FROM bidder_first_negotiated
    )
    GROUP BY fe_key
  )
`;
