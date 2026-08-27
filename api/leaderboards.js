import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";
import { BIDDER_IDENTITY_CTES } from "./_bidderIdentity.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export default async function handler(req, res) {
  try {
    const { from, to, store = "", category = "" } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    // category is OPTIONAL and additive-only, same convention as
    // api/overview.js: queries that don't reference {category:String} in
    // their SQL simply ignore it, so passing it through the shared
    // queryParams cannot change any existing behavior when category is ''.
    const queryParams = {
      from,
      to,
      store,
      category,
    };

    // =========================================================
    // OVERALL BIDDER COMPOSITION
    // Keeps the existing working dashboard definition.
    // =========================================================
    const compositionResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        ),

        bidder_first_bid AS (
          SELECT
            lowerUTF8(trim(email)) AS bidder_key,
            min(bid_created_at) AS first_bid_at

          FROM cms.mart_cms_bid_history_report

          WHERE bid_created_at IS NOT NULL
            AND email IS NOT NULL
            AND trim(email) != ''

          GROUP BY bidder_key
        ),

        period_bidders AS (
          SELECT
            lowerUTF8(trim(b.email)) AS bidder_key,
            sum(b.bid_amount) AS bid_amount

          FROM cms.mart_cms_bid_history_report b

          INNER JOIN auction_store s
            ON b.auction_number = s.auction_number

          WHERE b.bid_created_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )

            AND b.bid_created_at < addDays(
              toDateTime(
                concat({to:String}, ' 00:00:00'),
                'Asia/Manila'
              ),
              1
            )

            AND (
              {store:String} = ''
              OR s.store_name = {store:String}
            )

            AND b.email IS NOT NULL
            AND trim(b.email) != ''

          GROUP BY bidder_key
        )

        SELECT
          countIf(
            f.first_bid_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS new_bidders,

          countIf(
            f.first_bid_at < toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS returning_bidders,

          sumIf(
            p.bid_amount,
            f.first_bid_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS new_bidders_bid_amount,

          sumIf(
            p.bid_amount,
            f.first_bid_at < toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )
          ) AS returning_bidders_bid_amount

        FROM period_bidders p

        INNER JOIN bidder_first_bid f
          ON p.bidder_key = f.bidder_key
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // =========================================================
    // PER-AUCTION PARTICIPATING BIDDERS
    //
    // Grain:
    // auction_number + bidder
    //
    // A bidder participating in 3 auctions is therefore counted
    // once in EACH of those 3 auctions.
    // =========================================================
    const perAuctionResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name

          FROM xv3.mart_auction_productivity_report

          WHERE auction_number IS NOT NULL
        ),

        bidder_first_ever_bid AS (
          SELECT
            lowerUTF8(trim(email)) AS bidder_key,
            min(bid_created_at) AS first_ever_bid_at

          FROM cms.mart_cms_bid_history_report

          WHERE bid_created_at IS NOT NULL
            AND email IS NOT NULL
            AND trim(email) != ''

          GROUP BY bidder_key
        ),

        auction_bidder_activity AS (
          SELECT
            b.auction_number,
            any(s.store_name) AS auction_store_name,

            lowerUTF8(trim(b.email)) AS bidder_key,

            sum(b.bid_amount) AS bidder_auction_bid_amount

          FROM cms.mart_cms_bid_history_report b

          INNER JOIN auction_store s
            ON b.auction_number = s.auction_number

          WHERE b.bid_created_at >= toDateTime(
              concat({from:String}, ' 00:00:00'),
              'Asia/Manila'
            )

            AND b.bid_created_at < addDays(
              toDateTime(
                concat({to:String}, ' 00:00:00'),
                'Asia/Manila'
              ),
              1
            )

            AND (
              {store:String} = ''
              OR s.store_name = {store:String}
            )

            AND b.email IS NOT NULL
            AND trim(b.email) != ''

            AND b.auction_number IS NOT NULL

          GROUP BY
            b.auction_number,
            bidder_key
        ),

        classified_auction_bidders AS (
          SELECT
            a.auction_number,
            a.auction_store_name,
            a.bidder_key,
            a.bidder_auction_bid_amount,

            if(
              f.first_ever_bid_at >= toDateTime(
                concat({from:String}, ' 00:00:00'),
                'Asia/Manila'
              )
              AND f.first_ever_bid_at < addDays(
                toDateTime(
                  concat({to:String}, ' 00:00:00'),
                  'Asia/Manila'
                ),
                1
              ),
              'New',
              'Returning'
            ) AS bidder_status

          FROM auction_bidder_activity a

          INNER JOIN bidder_first_ever_bid f
            ON a.bidder_key = f.bidder_key
        )

        SELECT
          auction_number,

          any(auction_store_name) AS auction_store_name,

          count() AS participating_bidders,

          sum(
            bidder_auction_bid_amount
          ) AS participating_bid_amount,

          countIf(
            bidder_status = 'New'
          ) AS participating_new_bidders,

          sumIf(
            bidder_auction_bid_amount,
            bidder_status = 'New'
          ) AS participating_new_bid_amount,

          countIf(
            bidder_status = 'Returning'
          ) AS participating_returning_bidders,

          sumIf(
            bidder_auction_bid_amount,
            bidder_status = 'Returning'
          ) AS participating_returning_bid_amount

        FROM classified_auction_bidders

        GROUP BY auction_number

        ORDER BY auction_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // =========================================================
    // SETTLED BIDDER COMPOSITION (Paid/Released) — the business
    // definition of Bidder Composition going forward.
    //
    // Uses the EXACT SAME population/field as Total Bid Amount in
    // api/overview.js: xv3.mart_auction_vendor_analysis, status IN
    // ('Paid','Released'), deduped by (auction_number, lot_number),
    // authoritative amount = bid_amount, scoped by the auction's
    // starting_time (not any vendor_analysis-native date field — see
    // overview.js for why). Optionally further scoped by category —
    // same additive-only convention as settledVendorsResult/
    // settledBiddersResult below and every category-scoped query in
    // api/overview.js: a post-aggregation HAVING on the per-lot canonical
    // category, a no-op when category is '' (Overview's global default).
    //
    // Every settled lot's winning bidder identity is traced through
    // BIDDER_IDENTITY_CTES (api/_bidderIdentity.js) — the same
    // deterministic, no-fuzzy-matching two-path bridge shared by every
    // settled Bidder Composition query. There are only two business
    // categories, New and Returning: a lot is "unclassified" ONLY when
    // BOTH the primary (competitive) and fallback (negotiated) bridges
    // fail to resolve any identity for it at all — kept here purely for
    // internal reconciliation visibility (see the response mapping below),
    // never surfaced as a normal third UI category, and never guessed
    // into New or Returning.
    //
    // New = bidder's first-ever auction participation (competitive bid OR
    // negotiated purchase, whichever came first, across all history, not
    // just this period) falls on/after the selected range's start.
    // Returning = it falls before the selected range's start.
    // =========================================================
    const settledCompositionResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,
            any(v.or_number) AS or_number,
            any(v.date_time_paid) AS date_time_paid,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number

          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),

        ${BIDDER_IDENTITY_CTES}

        SELECT
          count() AS total_lots,
          sum(ifNull(sl.lot_bid_amount, 0)) AS total_bid_amount,

          countIf(fe.first_ever_at IS NULL) AS unclassified_lots,
          sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NULL) AS unclassified_bid_amount,

          countIf(
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS new_bidder_lots,
          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS new_bidders_bid_amount,

          -- Distinct bidder counts use the resolved canonical email — the
          -- same identity the classification itself is keyed on. Only
          -- lots with a fully-resolved identity (resolved_email/
          -- fe.first_ever_at non-null) ever contribute here, so an
          -- unresolved lot can never be miscounted as a distinct
          -- New/Returning bidder.
          uniqExactIf(
            rli.resolved_email,
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS new_bidders,

          countIf(
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS returning_bidder_lots,
          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS returning_bidders_bid_amount,

          uniqExactIf(
            rli.resolved_email,
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS returning_bidders

        FROM settled_lots sl

        LEFT JOIN resolved_lot_identity rli
          ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number

        LEFT JOIN bidder_first_ever fe
          ON rli.resolved_email = fe.fe_key
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // Per-auction breakdown of the same settled/bridge classification —
    // uses the identical BIDDER_IDENTITY_CTES bridge as settledCompositionResult
    // above, just grouped by auction instead of summed overall.
    const settledPerAuctionResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(a.store_name) AS store_name,
            any(v.bid_amount) AS lot_bid_amount,
            any(v.or_number) AS or_number,
            any(v.date_time_paid) AS date_time_paid,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number

          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),

        ${BIDDER_IDENTITY_CTES}

        SELECT
          sl.auction_number AS auction_number,
          any(sl.store_name) AS store_name,

          sum(ifNull(sl.lot_bid_amount, 0)) AS settled_bid_amount,

          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_new_bid_amount,

          countIf(
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_new_lots,

          uniqExactIf(
            rli.resolved_email,
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_new_bidders,

          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_returning_bid_amount,

          countIf(
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_returning_lots,

          uniqExactIf(
            rli.resolved_email,
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_returning_bidders,

          sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NULL) AS settled_unclassified_bid_amount,

          countIf(fe.first_ever_at IS NULL) AS settled_unclassified_lots

        FROM settled_lots sl

        LEFT JOIN resolved_lot_identity rli
          ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number

        LEFT JOIN bidder_first_ever fe
          ON rli.resolved_email = fe.fe_key

        GROUP BY sl.auction_number
        ORDER BY sl.auction_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // =========================================================
    // PER-AUCTION PARTICIPATING (UNION) — Full Auction Detail ONLY.
    // Business rule: Participating >= Winning must always hold. A
    // Negotiated auction's winner never generates a
    // cms.mart_cms_bid_history_report row, so the old bid-history-only
    // Participating definition (perAuctionBiddingActivity above,
    // unchanged and still used by Overview's own drilldown) could show
    // Participating = 0 while Winning > 0 for those auctions.
    //
    // Participating (this field only) = the real deduplicated UNION of:
    //   A) every bidder_key (lowerUTF8(trim(email))) with a real bid
    //      EVENT in this auction (cms.mart_cms_bid_history_report), and
    //   B) every settled Paid/Released lot's resolved winning identity
    //      in this auction (same BIDDER_IDENTITY_CTES bridge as Winning),
    //      resolved-identity only — an unresolved winner is never
    //      fabricated into the union, exactly like Winning's own count.
    // Both sides key on the SAME canonical lowerUTF8(trim(email)), so the
    // union is a genuine dedup, not a sum: a bidder who both bid AND won
    // counts once. Because Winning's own total (new_bidders +
    // returning_bidders below) is itself drawn from set B, the union
    // structurally contains it -> Participating >= Winning always holds,
    // with no max()/addition hack.
    //
    // Bid Activity stays real bid-history activity ONLY: a winning-only
    // bidder with no bid-history row contributes bid_activity_amount = 0,
    // never their winning bid value — see union_bidder_activity below.
    //
    // New/Returning reuses the canonical bidder_first_ever classifier
    // (BIDDER_IDENTITY_CTES) unmodified. A union member whose identity
    // resolves but who has neither a competitive nor a negotiated
    // first-ever record (fe.first_ever_at IS NULL — possible only for a
    // winning-only bidder resolved via a bridge path with no bid-history/
    // payments trail) is excluded from both new/returning COUNTS, same
    // "never fabricate into a count" rule as settled_new_bidders/
    // settled_returning_bidders above — surfaced separately as
    // participating_unclassified_bidders/_bid_amount, never silently
    // folded into Returning.
    // =========================================================
    const perAuctionParticipatingUnionResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        bid_history_bidders AS (
          SELECT
            b.auction_number AS auction_number,
            lowerUTF8(trim(b.email)) AS bidder_key,
            sum(b.bid_amount) AS bid_activity_amount

          FROM cms.mart_cms_bid_history_report b

          INNER JOIN selected_auctions s
            ON b.auction_number = s.auction_number

          WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND b.email IS NOT NULL AND trim(b.email) != ''

          GROUP BY b.auction_number, bidder_key
        ),

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

        winning_bidders AS (
          SELECT DISTINCT
            sl.auction_number AS auction_number,
            rli.resolved_email AS bidder_key
          FROM settled_lots sl
          INNER JOIN resolved_lot_identity rli
            ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number
          WHERE rli.resolved_email IS NOT NULL
        ),

        union_bidders AS (
          SELECT auction_number, bidder_key FROM bid_history_bidders
          UNION DISTINCT
          SELECT auction_number, bidder_key FROM winning_bidders
        ),

        union_bidder_activity AS (
          SELECT
            u.auction_number AS auction_number,
            u.bidder_key AS bidder_key,
            ifNull(bha.bid_activity_amount, 0) AS bid_activity_amount
          FROM union_bidders u
          LEFT JOIN bid_history_bidders bha
            ON u.auction_number = bha.auction_number AND u.bidder_key = bha.bidder_key
        )

        SELECT
          uba.auction_number AS auction_number,

          count() AS participating_bidders,
          sum(uba.bid_activity_amount) AS participating_bid_amount,

          countIf(
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS participating_new_bidders,
          sumIf(
            uba.bid_activity_amount,
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS participating_new_bid_amount,

          countIf(
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS participating_returning_bidders,
          sumIf(
            uba.bid_activity_amount,
            fe.first_ever_at IS NOT NULL
            AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS participating_returning_bid_amount,

          countIf(fe.first_ever_at IS NULL) AS participating_unclassified_bidders,
          sumIf(uba.bid_activity_amount, fe.first_ever_at IS NULL) AS participating_unclassified_bid_amount

        FROM union_bidder_activity uba

        LEFT JOIN bidder_first_ever fe
          ON uba.bidder_key = fe.fe_key

        GROUP BY uba.auction_number
        ORDER BY uba.auction_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // =========================================================
    // TOP 10 VENDORS (settled) — same Paid/Released settled population as
    // Total Bid Amount. vendor comes directly off vendor_analysis's own
    // row (verified 0% missing across 1.43M Paid/Released rows sampled),
    // no identity bridge needed.
    // =========================================================
    const settledVendorsResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,
            any(ifNull(v.vendor, 'Unknown Vendor')) AS vendor,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number

          -- Post-aggregation filter on the per-lot canonical lot_category
          -- (any() of a single dedup'd name), matching api/overview.js's
          -- identical any()-based classification exactly — never filtered
          -- on raw pre-GROUP BY rows, which could disagree with the
          -- canonical per-lot category when a lot has multiple underlying
          -- vendor_analysis rows with different name values.
          HAVING ({category:String} = '' OR lot_category = {category:String})
        )

        SELECT
          vendor,
          count() AS settled_lots,
          sum(ifNull(lot_bid_amount, 0)) AS settled_bid_amount

        FROM settled_lots

        GROUP BY vendor
        ORDER BY settled_bid_amount DESC
        LIMIT 10
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // =========================================================
    // TOP 10 BIDDERS (settled, winning bidders only) — uses the same
    // deterministic identity bridge as settled Bidder Composition. No
    // fuzzy matching. INNER JOINs through every bridge hop, so a settled
    // lot that can't fully resolve an identity simply contributes to no
    // bidder's ranking — never a fabricated or "Unclassified" entry here.
    // The money is not lost: it's still counted in Total Bid Amount and
    // surfaced separately via unattributed_bidder_lots/
    // unattributed_bidder_bid_amount below (same figures as Bidder
    // Composition's unclassified_lots/unclassified_bid_amount — same
    // population, same bridge, so they're guaranteed identical, not
    // independently recomputed).
    // =========================================================
    const settledBiddersResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number

          -- Post-aggregation filter on the per-lot canonical lot_category —
          -- see settledVendorsResult's identical comment above.
          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),

        posting_customer AS (
          SELECT
            au.auction_number AS pc_auction_number,
            p.lot_number AS pc_lot_number,
            any(p.customer_id) AS pc_customer_id

          FROM xv3.postings p

          INNER JOIN xv3.auctions au
            ON p.auction_id = au.auction_id

          WHERE p.customer_id IS NOT NULL
            AND p.customer_id != 0

          GROUP BY au.auction_number, p.lot_number
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
            any(lowerUTF8(trim(email))) AS cb_email,
            any(customer_firstname) AS firstname,
            any(customer_lastname) AS lastname

          FROM cms.mart_cms_bidder_registrations

          WHERE customer_id IS NOT NULL
            AND email IS NOT NULL

          GROUP BY customer_id
        ),

        -- New/Returning for Top Bidders — every bidder ranked here already
        -- has a real xv3.postings row (required by the posting_customer
        -- INNER JOIN below), i.e. a genuine competitive bid, so the
        -- competitive-only first-ever-bid rule (same definition/table as
        -- api/_bidderIdentity.js's bidder_first_competitive and
        -- compositionResult's bidder_first_bid above) fully classifies
        -- every row here — the negotiated-purchase fallback that matters
        -- for lots with NO postings row is a non-issue for this
        -- already-postings-gated population. Does not change ranking or
        -- population, only labels it — see this query's own comment above
        -- for why the ranking stays primary-bridge-only.
        bidder_first_competitive AS (
          SELECT
            lowerUTF8(trim(email)) AS fc_bidder_key,
            min(bid_created_at) AS first_competitive_at
          FROM cms.mart_cms_bid_history_report
          WHERE bid_created_at IS NOT NULL AND email IS NOT NULL AND trim(email) != ''
          GROUP BY fc_bidder_key
        )

        SELECT
          cb_email AS bidder_email,
          any(firstname) AS firstname,
          any(lastname) AS lastname,
          count() AS settled_lots,
          sum(ifNull(sl.lot_bid_amount, 0)) AS settled_bid_amount,

          if(
            min(fc.first_competitive_at) >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila'),
            'new',
            'returning'
          ) AS new_or_returning

        FROM settled_lots sl

        INNER JOIN posting_customer
          ON sl.auction_number = pc_auction_number AND sl.lot_number = pc_lot_number

        INNER JOIN customer_bridge
          ON pc_customer_id = br_customer_id

        INNER JOIN cms_bidder_email
          ON br_hmr_customer_id = cb_customer_id

        LEFT JOIN bidder_first_competitive fc
          ON cb_email = fc.fc_bidder_key

        GROUP BY cb_email
        ORDER BY settled_bid_amount DESC
        LIMIT 10
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const compositionRows = await compositionResult.json();
    const auctionRows = await perAuctionResult.json();
    const settledCompositionRows = await settledCompositionResult.json();
    const settledPerAuctionRows = await settledPerAuctionResult.json();
    const perAuctionParticipatingUnionRows = await perAuctionParticipatingUnionResult.json();
    const settledVendorRows = await settledVendorsResult.json();
    const settledBidderRows = await settledBiddersResult.json();

    const composition = compositionRows[0] ?? {};
    const settledComposition = settledCompositionRows[0] ?? {};

    return res.status(200).json({
      // Settled (Paid/Released) bidder composition — reconciles exactly
      // to api/overview.js's total_bid_amount. See the query comment
      // above for the identity-bridge chain and Unclassified definition.
      composition: {
        // True distinct bridged-bidder counts (uniqExact on the bridged
        // plaintext email) — NOT lot counts. A bidder winning 3 lots
        // counts once here.
        new_bidders: Number(settledComposition.new_bidders ?? 0),
        returning_bidders: Number(settledComposition.returning_bidders ?? 0),

        new_bidders_bid_amount: Number(settledComposition.new_bidders_bid_amount ?? 0),
        returning_bidders_bid_amount: Number(settledComposition.returning_bidders_bid_amount ?? 0),
        unclassified_bid_amount: Number(settledComposition.unclassified_bid_amount ?? 0),

        // Lot counts, kept alongside the distinct-bidder counts above —
        // deliberately NOT relabeled as bidder counts.
        new_bidder_lots: Number(settledComposition.new_bidder_lots ?? 0),
        returning_bidder_lots: Number(settledComposition.returning_bidder_lots ?? 0),
        // No "unclassified_bidders" field: an unclassified lot has no
        // resolved bidder identity to count, distinct or otherwise.
        unclassified_lots: Number(settledComposition.unclassified_lots ?? 0),

        total_lots: Number(settledComposition.total_lots ?? 0),
        total_bid_amount: Number(settledComposition.total_bid_amount ?? 0),
      },

      // TOP VENDORS (settled, Paid/Released) — ranked by settled_bid_amount
      // descending. Replaces the previous mock-data leaderboard.
      vendors: settledVendorRows.map((row) => {
        const settled_lots = Number(row.settled_lots ?? 0);
        const settled_bid_amount = Number(row.settled_bid_amount ?? 0);
        return {
          vendor: row.vendor,
          settled_lots,
          settled_bid_amount,
          average_bid_amount_per_lot: settled_lots > 0 ? settled_bid_amount / settled_lots : 0,
        };
      }),

      // TOP BIDDERS (settled, winning bidders only, via the deterministic
      // identity bridge — no fuzzy matching). Replaces the previous
      // mock-data leaderboard. A settled lot whose identity can't be
      // bridged contributes to no bidder here — see
      // unattributed_bidder_lots/unattributed_bidder_bid_amount below.
      bidders: settledBidderRows.map((row) => {
        const settled_lots = Number(row.settled_lots ?? 0);
        const settled_bid_amount = Number(row.settled_bid_amount ?? 0);
        const bidder_name = [row.lastname, row.firstname].filter(Boolean).join(", ") || "Unknown Bidder";
        return {
          bidder_name,
          settled_lots,
          settled_wins: settled_lots,
          settled_bid_amount,
          average_bid_amount_per_win: settled_lots > 0 ? settled_bid_amount / settled_lots : 0,
          new_or_returning: row.new_or_returning ?? "returning",
        };
      }),

      // Top Bidders (settledBiddersResult above) intentionally still uses
      // only the primary competitive bridge — its ranking population is
      // unchanged by the negotiated-fallback bridge added to Bidder
      // Composition. So this gap is computed independently from
      // settledComposition.unclassified_* (which now reflects the wider
      // two-path bridge and is usually far smaller/zero) rather than reused
      // from it, to avoid the two figures silently drifting apart.
      unattributed_bidder_lots: Math.max(
        0,
        Number(settledComposition.total_lots ?? 0) -
          settledBidderRows.reduce((sum, row) => sum + (Number(row.settled_lots) || 0), 0)
      ),
      unattributed_bidder_bid_amount: Math.max(
        0,
        Number(settledComposition.total_bid_amount ?? 0) -
          settledBidderRows.reduce((sum, row) => sum + (Number(row.settled_bid_amount) || 0), 0)
      ),

      perAuctionComposition: settledPerAuctionRows.map((row) => ({
        auction_number: row.auction_number,
        store_name: row.store_name,
        settled_bid_amount: Number(row.settled_bid_amount ?? 0),

        new_bidders: Number(row.settled_new_bidders ?? 0),
        returning_bidders: Number(row.settled_returning_bidders ?? 0),

        new_bidders_bid_amount: Number(row.settled_new_bid_amount ?? 0),
        returning_bidders_bid_amount: Number(row.settled_returning_bid_amount ?? 0),
        unclassified_bid_amount: Number(row.settled_unclassified_bid_amount ?? 0),

        new_bidder_lots: Number(row.settled_new_lots ?? 0),
        returning_bidder_lots: Number(row.settled_returning_lots ?? 0),
        unclassified_lots: Number(row.settled_unclassified_lots ?? 0),
      })),

      // Full Auction Detail ONLY — real deduplicated UNION of bid-history
      // participants and resolved winning bidders, per auction. See the
      // perAuctionParticipatingUnionResult query comment above for the
      // full rule (Participating >= Winning, Bid Activity never
      // fabricated for winner-only bidders). Never consumed by Overview's
      // own drilldown — that reuses perAuctionBiddingActivity/
      // perAuctionComposition unmodified, on purpose.
      perAuctionParticipatingUnion: perAuctionParticipatingUnionRows.map((row) => ({
        auction_number: row.auction_number,
        total_bidders: Number(row.participating_bidders ?? 0),
        bid_amount: Number(row.participating_bid_amount ?? 0),

        new_bidders: Number(row.participating_new_bidders ?? 0),
        returning_bidders: Number(row.participating_returning_bidders ?? 0),
        new_bidders_bid_amount: Number(row.participating_new_bid_amount ?? 0),
        returning_bidders_bid_amount: Number(row.participating_returning_bid_amount ?? 0),

        unclassified_bidders: Number(row.participating_unclassified_bidders ?? 0),
        unclassified_bid_amount: Number(row.participating_unclassified_bid_amount ?? 0),
      })),

      // Preserved, not deleted: the previous bid-history cumulative-
      // activity-based composition (sum of every bid EVENT per bidder,
      // not settled value). Kept under its own names so nothing built on
      // the old numbers silently breaks.
      bidding_activity_composition: {
        new_bidders: Number(
          composition.new_bidders ?? 0,
        ),

        returning_bidders: Number(
          composition.returning_bidders ?? 0,
        ),

        new_bidders_bid_amount: Number(
          composition.new_bidders_bid_amount ?? 0,
        ),

        returning_bidders_bid_amount: Number(
          composition.returning_bidders_bid_amount ?? 0,
        ),
      },

      perAuctionBiddingActivity: auctionRows.map((row) => ({
        auction_number: row.auction_number,

        store_name: row.auction_store_name,

        // ---------------------------------------------
        // PARTICIPATING BIDDERS
        // ---------------------------------------------
        participating_bidders: Number(
          row.participating_bidders ?? 0,
        ),

        participating_bid_amount: Number(
          row.participating_bid_amount ?? 0,
        ),

        participating_new_bidders: Number(
          row.participating_new_bidders ?? 0,
        ),

        participating_new_bid_amount: Number(
          row.participating_new_bid_amount ?? 0,
        ),

        participating_returning_bidders: Number(
          row.participating_returning_bidders ?? 0,
        ),

        participating_returning_bid_amount: Number(
          row.participating_returning_bid_amount ?? 0,
        ),

        // Keep these names too so the existing
        // Bidder Composition component remains compatible.
        new_bidders: Number(
          row.participating_new_bidders ?? 0,
        ),

        returning_bidders: Number(
          row.participating_returning_bidders ?? 0,
        ),

        new_bidders_bid_amount: Number(
          row.participating_new_bid_amount ?? 0,
        ),

        returning_bidders_bid_amount: Number(
          row.participating_returning_bid_amount ?? 0,
        ),
      })),
    });
  } catch (err) {
    console.error(
      "Leaderboards API error:",
      err,
    );

    return res.status(500).json({
      error: "Failed to load bidder leaderboards",

      message:
        err instanceof Error
          ? err.message
          : String(err),
    });
  }
}