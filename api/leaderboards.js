import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export default async function handler(req, res) {
  try {
    const { from, to, store = "" } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    const queryParams = {
      from,
      to,
      store,
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
    // overview.js for why).
    //
    // vendor_analysis.email is Laravel-encrypted ciphertext and cannot be
    // matched against bid_history's plaintext email — fuzzy bidder_name
    // matching was tested and rejected (only ~44% of settled value
    // matched in a real sample). Instead, each settled lot's winning
    // bidder identity is traced through a deterministic ID bridge with
    // no string/fuzzy matching anywhere:
    //
    //   vendor_analysis (auction_number, lot_number)
    //     -> xv3.auctions (auction_number -> auction_id)
    //     -> xv3.postings (auction_id, lot_number -> customer_id)
    //     -> xv3.customers (customer_id -> hmr_customer_id)
    //     -> cms.mart_cms_bidder_registrations (customer_id -> plaintext email)
    //     -> cms.mart_cms_bid_history_report (email -> first-ever bid time)
    //
    // A lot is Unclassified if ANY hop in that chain fails to resolve —
    // confirmed this happens for auctions that never posted through
    // xv3.postings at all (e.g. "AA114", an internal employee-bidding
    // auction with zero posting rows), not as a general data-quality gap.
    // Verified in a real sample: once a lot reaches a bidder email, it
    // always finds a bid_history record (0 "bridged but no history"
    // cases) — so f.first_ever_bid_at IS NULL is a safe single test for
    // "the bridge did not fully resolve," covering every failure hop.
    //
    // New = bidder's first-ever bid (across all of bid_history, not just
    // this period) falls on/after the selected range's start.
    // Returning = it falls before the selected range's start.
    // These are never guessed — an unresolved bidder is Unclassified,
    // never assumed New or Returning.
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
            any(v.bid_amount) AS lot_bid_amount

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number
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
            any(lowerUTF8(trim(email))) AS cb_email

          FROM cms.mart_cms_bidder_registrations

          WHERE customer_id IS NOT NULL
            AND email IS NOT NULL

          GROUP BY customer_id
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
        )

        SELECT
          count() AS total_lots,
          sum(ifNull(sl.lot_bid_amount, 0)) AS total_bid_amount,

          countIf(f.first_ever_bid_at IS NULL) AS unclassified_lots,
          sumIf(ifNull(sl.lot_bid_amount, 0), f.first_ever_bid_at IS NULL) AS unclassified_bid_amount,

          countIf(
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS new_bidder_lots,
          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS new_bidders_bid_amount,

          -- Distinct bidder counts use the bridged plaintext email — the
          -- same identity the classification itself is keyed on. Only
          -- lots with a fully-resolved bridge (cb_email/f.first_ever_bid_at
          -- non-null) ever contribute here, so an unclassified lot can
          -- never be miscounted as a distinct New/Returning bidder.
          uniqExactIf(
            cb_email,
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS new_bidders,

          countIf(
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS returning_bidder_lots,
          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS returning_bidders_bid_amount,

          uniqExactIf(
            cb_email,
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS returning_bidders

        FROM settled_lots sl

        LEFT JOIN posting_customer
          ON sl.auction_number = pc_auction_number AND sl.lot_number = pc_lot_number

        LEFT JOIN customer_bridge
          ON pc_customer_id = br_customer_id

        LEFT JOIN cms_bidder_email
          ON br_hmr_customer_id = cb_customer_id

        LEFT JOIN bidder_first_ever_bid f
          ON cb_email = f.bidder_key
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // Per-auction breakdown of the same settled/bridge classification.
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
            any(v.bid_amount) AS lot_bid_amount

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number
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
            any(lowerUTF8(trim(email))) AS cb_email

          FROM cms.mart_cms_bidder_registrations

          WHERE customer_id IS NOT NULL
            AND email IS NOT NULL

          GROUP BY customer_id
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
        )

        SELECT
          sl.auction_number AS auction_number,
          any(sl.store_name) AS store_name,

          sum(ifNull(sl.lot_bid_amount, 0)) AS settled_bid_amount,

          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_new_bid_amount,

          countIf(
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_new_lots,

          uniqExactIf(
            cb_email,
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_new_bidders,

          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_returning_bid_amount,

          countIf(
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_returning_lots,

          uniqExactIf(
            cb_email,
            f.first_ever_bid_at IS NOT NULL
            AND f.first_ever_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS settled_returning_bidders,

          sumIf(ifNull(sl.lot_bid_amount, 0), f.first_ever_bid_at IS NULL) AS settled_unclassified_bid_amount,

          countIf(f.first_ever_bid_at IS NULL) AS settled_unclassified_lots

        FROM settled_lots sl

        LEFT JOIN posting_customer
          ON sl.auction_number = pc_auction_number AND sl.lot_number = pc_lot_number

        LEFT JOIN customer_bridge
          ON pc_customer_id = br_customer_id

        LEFT JOIN cms_bidder_email
          ON br_hmr_customer_id = cb_customer_id

        LEFT JOIN bidder_first_ever_bid f
          ON cb_email = f.bidder_key

        GROUP BY sl.auction_number
        ORDER BY sl.auction_number
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const compositionRows = await compositionResult.json();
    const auctionRows = await perAuctionResult.json();
    const settledCompositionRows = await settledCompositionResult.json();
    const settledPerAuctionRows = await settledPerAuctionResult.json();

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