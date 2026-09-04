import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";
import { BIDDER_IDENTITY_CTES } from "./_bidderIdentity.js";
import { STATUS_PRIORITY_SQL } from "./_lotStatus.js";
import { pickBucketGrain, enumerateBuckets, zeroFillBuckets } from "./_bucketing.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export default async function handler(req, res) {
  try {
    const { from, to, store = "", category = "", type = "" } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    // =========================================================
    // VENDOR ANALYTICS TIME SERIES (type=vendor-time-series) — folded
    // into this existing endpoint (rather than a new serverless
    // function) to stay within the Vercel Hobby-plan function-count
    // limit. "Active & New Vendors by Period" only — Active Vendors/New
    // Vendors/Top-5 Concentration/Stuck Inventory/Top 10 Vendors totals
    // all already come from this SAME endpoint's vendor_analytics field
    // (below) — this branch exists purely for the bucketed trend that
    // flat aggregate can't produce. No identity bridge (vendor is a real
    // field, not a resolved bidder identity), so this is a single light
    // query, dynamic bucket granularity (never hardcoded to "month").
    // =========================================================
    if (type === "vendor-time-series") {
      const { preset = "" } = req.query;
      const vtsParams = { from, to, store, category };
      const { fn: bucketFn, label: bucketLabel } = pickBucketGrain(preset, from, to);
      const bucketExpr = (col) => `${bucketFn}(${col}, 'Asia/Manila')`;

      const vtsResult = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT auction_number, store_name, ${bucketExpr("ending_time")} AS bucket
            FROM xv3.mart_auction_productivity_report
            WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
              AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
              AND ({store:String} = '' OR store_name = {store:String})
          ),
          lots AS (
            SELECT
              v.auction_number AS auction_number,
              v.lot_number AS lot_number,
              any(s.bucket) AS bucket,
              any(ifNull(v.vendor, 'Unknown Vendor')) AS vendor,
              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
            FROM xv3.mart_auction_vendor_analysis v
            INNER JOIN selected_auctions s ON v.auction_number = s.auction_number
            WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
            GROUP BY v.auction_number, v.lot_number
            HAVING ({category:String} = '' OR lot_category = {category:String})
          ),
          vendor_bucket AS (
            SELECT DISTINCT bucket, vendor FROM lots
          ),
          vendor_first_seen AS (
            SELECT ifNull(vendor, 'Unknown Vendor') AS vendor, min(date_created) AS first_seen
            FROM xv3.mart_auction_vendor_analysis
            WHERE vendor IS NOT NULL
            GROUP BY vendor
          )
          SELECT
            vb.bucket AS bucket,
            uniqExact(vb.vendor) AS total,
            uniqExactIf(vb.vendor, ${bucketExpr("vfs.first_seen")} = vb.bucket) AS new_vendors,
            uniqExactIf(vb.vendor, ${bucketExpr("vfs.first_seen")} != vb.bucket OR vfs.first_seen IS NULL) AS returning_vendors
          FROM vendor_bucket vb
          LEFT JOIN vendor_first_seen vfs ON vb.vendor = vfs.vendor
          GROUP BY vb.bucket
          ORDER BY bucket
        `,
        query_params: vtsParams,
        format: "JSONEachRow",
      });
      const vtsRows = await vtsResult.json();

      const expectedBuckets = enumerateBuckets(bucketLabel, from, to);

      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      return res.status(200).json({
        bucket_label: bucketLabel,
        bucket_count: expectedBuckets.length,
        by_period: zeroFillBuckets(expectedBuckets, vtsRows, ["total", "new_vendors", "returning_vendors"]),
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
    // VENDOR ANALYTICS SUMMARY (type=vendor-summary) — P1 request
    // architecture cleanup: Vendor Analytics only ever reads this
    // response's `vendor_analytics` field (see VendorAnalyticsView.jsx /
    // useVendorAnalytics.js), yet the DEFAULT (no-type) response below
    // also runs 5+ SERIALIZED heavy queries through BIDDER_IDENTITY_CTES
    // (composition/settledBidders/perAuctionParticipatingUnion/etc — the
    // settledBiddersQuery alone reads ~19M rows, see its own comment)
    // purely for fields Vendor Analytics never uses. This branch runs
    // ONLY the two genuinely vendor-scoped queries — no identity bridge,
    // no bidder-side computation at all — for a real ClickHouse cost
    // reduction on every Vendor Analytics tab load/filter change.
    // Deliberately a small amount of duplicated SQL against the default
    // path's own vendor block below (same query, same definitions) rather
    // than a shared refactor — an early-return branch here cannot regress
    // the already-validated default path for Overview/CategoryView/Bidder
    // Analytics, which still need the full response.
    // =========================================================
    if (type === "vendor-summary") {
      const vendorAllLotsResult = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT auction_number, store_name
            FROM xv3.mart_auction_productivity_report
            WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
              AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
              AND ({store:String} = '' OR store_name = {store:String})
          ),
          lots AS (
            SELECT
              v.auction_number AS auction_number,
              v.lot_number AS lot_number,
              any(a.store_name) AS store_name,
              argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
              any(ifNull(v.bid_amount, 0)) AS bid_amount,
              any(ifNull(v.sold_price, 0)) AS sold_price,
              any(ifNull(v.commission, 0)) AS commission_pct,
              any(ifNull(v.vendor, 'Unknown Vendor')) AS vendor,
              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
            FROM xv3.mart_auction_vendor_analysis v
            INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
            WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
            GROUP BY v.auction_number, v.lot_number
            HAVING ({category:String} = '' OR lot_category = {category:String})
          )
          SELECT
            vendor,
            count() AS lots_listed,
            countIf(status IN ('Outstanding', 'Paid', 'Unpaid', 'Released')) AS lots_sold,
            sumIf(ifNull(bid_amount, 0), status IN ('Paid', 'Released')) AS settled_bid_amount,
            sumIf(ifNull(sold_price, 0) - ifNull(bid_amount, 0), status IN ('Paid', 'Released')) AS buyers_premium_income,
            sumIf(ifNull(bid_amount, 0) * ifNull(commission_pct, 0) / 100, status IN ('Paid', 'Released')) AS commission_income,
            uniqExact(auction_number) AS auction_events,
            uniqExact(store_name) AS branches,
            -- Branch NAMES (not just the count above) for the hover's
            -- "Branches Supplied" list — same current-period scope as
            -- every other figure in this row, not all-time coverage.
            groupUniqArray(store_name) AS branch_names
          FROM lots
          GROUP BY vendor
          ORDER BY settled_bid_amount DESC
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      });

      const vendorFirstSeenResult = await client.query({
        query: `
          SELECT
            ifNull(vendor, 'Unknown Vendor') AS vendor,
            min(date_created) AS first_seen
          FROM xv3.mart_auction_vendor_analysis
          WHERE vendor IS NOT NULL
          GROUP BY vendor
        `,
        query_params: {},
        format: "JSONEachRow",
      });

      // ACCOUNT EXECUTIVE — account_executive lives directly on
      // xv3.mart_auction_vendor_analysis, the SAME row/table every other
      // vendor figure above already comes from, keyed by the exact same
      // `vendor` column — no separate join, no fuzzy name matching, no
      // inference from branch/category/auction. All-time/unscoped (an AE
      // assignment is a vendor-level attribute, not a per-period one — same
      // convention as vendorFirstSeenResult above). A vendor can show more
      // than one AE across different lots/times in the source data; rather
      // than arbitrarily pick one, this reports the MOST RECENT (by that
      // lot's own date_created — the closest real timestamp available,
      // since no dedicated AE-assignment-date field exists) via argMax,
      // plus the full distinct set so the UI can honestly show "multiple
      // assigned" instead of silently hiding the ambiguity.
      const vendorAccountExecutiveResult = await client.query({
        query: `
          SELECT
            ifNull(vendor, 'Unknown Vendor') AS vendor,
            argMax(account_executive, date_created) AS latest_account_executive,
            groupUniqArray(account_executive) AS all_account_executives
          FROM xv3.mart_auction_vendor_analysis
          WHERE vendor IS NOT NULL AND account_executive IS NOT NULL AND trim(account_executive) != ''
          GROUP BY vendor
        `,
        query_params: {},
        format: "JSONEachRow",
      });

      const vendorAllLotsRows = await vendorAllLotsResult.json();
      const vendorFirstSeenRows = await vendorFirstSeenResult.json();
      const vendorAccountExecutiveRows = await vendorAccountExecutiveResult.json();

      const vendorFirstSeenMap = new Map(vendorFirstSeenRows.map((r) => [r.vendor, r.first_seen]));
      const vendorAccountExecutiveMap = new Map(vendorAccountExecutiveRows.map((r) => [r.vendor, r]));
      const activeVendorsCount = vendorAllLotsRows.length;
      const totalVendorBidAmount = vendorAllLotsRows.reduce((s, r) => s + (Number(r.settled_bid_amount) || 0), 0);
      const top5VendorRows = vendorAllLotsRows.slice(0, 5);
      const top5BidAmount = top5VendorRows.reduce((s, r) => s + (Number(r.settled_bid_amount) || 0), 0);
      const newVendorsCount = vendorAllLotsRows.filter((r) => {
        const firstSeen = vendorFirstSeenMap.get(r.vendor);
        return firstSeen && firstSeen >= `${from} 00:00:00` && firstSeen < `${to} 23:59:59.999`;
      }).length;

      // Same cache semantics as the default response below — settled/
      // historical, no live "right now" concept, no per-user data.
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      return res.status(200).json({
        vendor_analytics: {
          active_vendors: activeVendorsCount,
          new_vendors: newVendorsCount,
          total_vendor_bid_amount: totalVendorBidAmount,
          top5_vendor_bid_amount: top5BidAmount,
          top5_vendor_concentration_pct: totalVendorBidAmount > 0 ? (top5BidAmount / totalVendorBidAmount) * 100 : null,
          all_lots: vendorAllLotsRows.map((row) => {
            const ae = vendorAccountExecutiveMap.get(row.vendor);
            const allAEs = ae?.all_account_executives ?? [];
            return {
              vendor: row.vendor,
              lots_listed: Number(row.lots_listed ?? 0),
              lots_sold: Number(row.lots_sold ?? 0),
              settled_bid_amount: Number(row.settled_bid_amount ?? 0),
              buyers_premium_income: Number(row.buyers_premium_income ?? 0),
              commission_income: Number(row.commission_income ?? 0),
              auction_events: Number(row.auction_events ?? 0),
              branches: Number(row.branches ?? 0),
              branch_names: row.branch_names ?? [],
              first_seen: vendorFirstSeenMap.get(row.vendor) ?? null,
              // account_executive: null when this vendor genuinely has no
              // account_executive value on file — never fabricated.
              // all_account_executives.length > 1 flags a real multi-AE
              // case (see vendorAccountExecutiveResult comment) so the UI
              // can say "multiple assigned" instead of silently picking one.
              account_executive: ae?.latest_account_executive ?? null,
              all_account_executives: allAEs,
            };
          }),
        },
      });
    }

    // ---------------------------------------------------------
    // PERFORMANCE NOTE (Architecture Phase 2A): these 7 queries are
    // independent of each other's results — none reads a value computed by
    // a prior query before building its own SQL — so they're launched
    // together via Promise.all below instead of one `await` per query
    // (previously ~11-12s sequential; each query's own text/semantics are
    // UNCHANGED). A deeper consolidation (sharing one settled_lots scan
    // across the 5 queries that each independently rebuild it) was
    // deliberately NOT done here: 3 of these 5 (compositionResult's
    // period_bidders, settledCompositionResult, perAuctionResult's
    // classified_auction_bidders) use uniqExact-style distinct bidder
    // counts that do NOT sum safely across a per-auction breakdown (a
    // bidder active in 2 auctions would be double-counted) — merging them
    // without a verified-safe technique (e.g. WITH TOTALS) risked exactly
    // the kind of silent metric drift this phase is required to avoid. See
    // the Architecture Audit / Phase 2A report for the deferred plan.
    // ---------------------------------------------------------
    // ---------------------------------------------------------
    // GLOBAL INVARIANT: Participating >= Winning always holds, because
    // Participating is the real deduplicated UNION of (A) every bidder with
    // a real bid-history event on an auction in this cohort and (B) every
    // settled lot's resolved winning identity in this same cohort — see
    // perAuctionParticipatingUnionQuery below for the identical technique
    // at per-auction grain. A winner who never generated a bid-history
    // event (a Negotiated sale with no online bidding) is still counted
    // once via side (B) — never fabricated bid activity, just a real
    // resolved identity. This guarantees Winning subset-of Participating
    // structurally, not via Math.max()/addition.
    //
    // Auction cohort: ending_time in range (an auction belongs to the
    // period it ENDS in — see the ENDING_TIME COHORT task), same
    // selected_auctions definition settledCompositionQuery below uses, so
    // the two cards are always comparing the same auctions. category, when
    // set, is applied identically to both sides (lot_category join on the
    // bid-history side, settled_lots HAVING on the winning side) so a
    // category-scoped comparison (e.g. "Vehicles and Automotive") never
    // mixes an all-category Participating count against a category-scoped
    // Winning count.
    // ---------------------------------------------------------
    const compositionQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        lot_category AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
          FROM xv3.mart_auction_vendor_analysis v
          WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
        ),

        -- Every real bidder on an auction in this cohort — no bid_created_at
        -- date filter (an auction is never split by when within its run a
        -- bid happened, same rule as the ending_time cohort itself).
        bid_history_bidders AS (
          SELECT
            lowerUTF8(trim(b.email)) AS bidder_key,
            sum(b.bid_amount) AS bid_amount
          FROM cms.mart_cms_bid_history_report b
          INNER JOIN selected_auctions s ON b.auction_number = s.auction_number
          LEFT JOIN lot_category lc ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number
          WHERE b.email IS NOT NULL AND trim(b.email) != ''
            AND ({category:String} = '' OR lc.lot_category = {category:String})
          GROUP BY bidder_key
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.or_number) AS or_number,
            any(v.date_time_paid) AS date_time_paid,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
          FROM xv3.mart_auction_vendor_analysis v
          INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
          WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),

        ${BIDDER_IDENTITY_CTES},

        winning_bidder_keys AS (
          SELECT DISTINCT rli.resolved_email AS bidder_key
          FROM settled_lots sl
          INNER JOIN resolved_lot_identity rli
            ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number
          WHERE rli.resolved_email IS NOT NULL
        ),

        union_bidder_keys AS (
          SELECT bidder_key FROM bid_history_bidders
          UNION DISTINCT
          SELECT bidder_key FROM winning_bidder_keys
        )

        -- New/Returning classification uses bidder_first_ever (from
        -- BIDDER_IDENTITY_CTES — covers BOTH competitive bid-history AND
        -- negotiated-purchase first participation), joined via LEFT JOIN,
        -- NOT the narrower bid-history-only bidder_first_bid via INNER
        -- JOIN — a negotiated winner with zero bid-history rows has no
        -- entry in a bid-history-only lookup at all, so an INNER JOIN
        -- there would silently drop them from Participating entirely,
        -- which is exactly how a real Winning > Participating violation
        -- was found during this task's own validation (see
        -- perAuctionParticipatingUnionQuery's identical, already-correct
        -- technique below). A union member resolving through neither path
        -- is genuinely unclassified — counted in the total, never
        -- guessed into New or Returning.
        SELECT
          countIf(fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS new_bidders,
          countIf(fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS returning_bidders,
          sumIf(ifNull(bha.bid_amount, 0), fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS new_bidders_bid_amount,
          sumIf(ifNull(bha.bid_amount, 0), fe.first_ever_at IS NULL OR fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS returning_bidders_bid_amount,
          countIf(fe.first_ever_at IS NULL) AS unclassified_bidders,
          sumIf(ifNull(bha.bid_amount, 0), fe.first_ever_at IS NULL) AS unclassified_bid_amount

        FROM union_bidder_keys u

        LEFT JOIN bidder_first_ever fe
          ON u.bidder_key = fe.fe_key

        LEFT JOIN bid_history_bidders bha
          ON u.bidder_key = bha.bidder_key
      `,
      query_params: queryParams,
      format: "JSONEachRow",
      // Now heavy (BIDDER_IDENTITY_CTES) — see settledCompositionQuery's
      // identical safety-net comment below.
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    };

    // =========================================================
    // PER-AUCTION PARTICIPATING BIDDERS
    //
    // Grain:
    // auction_number + bidder
    //
    // A bidder participating in 3 auctions is therefore counted
    // once in EACH of those 3 auctions.
    // =========================================================
    const perAuctionQuery = {
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
    };

    // =========================================================
    // SETTLED BIDDER COMPOSITION (Paid/Released) — the business
    // definition of Bidder Composition going forward.
    //
    // Uses the EXACT SAME population/field as Total Bid Amount in
    // api/overview.js: xv3.mart_auction_vendor_analysis, status IN
    // ('Paid','Released'), deduped by (auction_number, lot_number),
    // authoritative amount = bid_amount, scoped by the auction's
    // ending_time (the canonical historical reporting rule — an auction
    // belongs to the period it ENDS in — not any vendor_analysis-native
    // date field — see overview.js for why). Optionally further scoped by
    // category —
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
    const settledCompositionQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
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
          -- Distinct-BIDDER unclassified count (PART 8 Won-Bidders panel:
          -- "Unmatched/Unclassified if genuinely unresolved") — a resolved
          -- identity with no first-ever record on either bridge, never
          -- guessed into New or Returning.
          uniqExactIf(rli.resolved_email, fe.first_ever_at IS NULL) AS unclassified_bidders,

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
      // Safety net, not the primary fix (that's the serialized execution
      // below) — spills aggregation state to disk instead of growing
      // memory unbounded if a scope ever pushes this well past its normal
      // ~350-490MB peak. Same correct result, just slower on the rare
      // scope that needs it. Set above observed normal peak so it doesn't
      // trigger on typical requests.
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    };

    // Per-auction breakdown of the same settled/bridge classification —
    // uses the identical BIDDER_IDENTITY_CTES bridge as settledCompositionResult
    // above, just grouped by auction instead of summed overall.
    const settledPerAuctionQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
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
      // See settledCompositionQuery's identical comment above.
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    };

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
    const perAuctionParticipatingUnionQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
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
      // See settledCompositionQuery's identical comment above.
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    };

    // =========================================================
    // TOP 10 VENDORS (settled) — same Paid/Released settled population as
    // Total Bid Amount. vendor comes directly off vendor_analysis's own
    // row (verified 0% missing across 1.43M Paid/Released rows sampled),
    // no identity bridge needed.
    // =========================================================
    const settledVendorsQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,
            any(ifNull(v.vendor, 'Unknown Vendor')) AS vendor,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category,
            -- Cheap hover-preview fields (PART 19) — same settled_lots
            -- scan already in place, no extra join/scan needed.
            any(v.sold_price) AS lot_sold_price,
            any(v.commission) AS lot_commission_pct

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
          sum(ifNull(lot_bid_amount, 0)) AS settled_bid_amount,
          -- PART 19 hover fields — all cheap aggregates over the SAME
          -- settled_lots population already scanned above, no new scan.
          uniqExact(auction_number) AS auction_events,
          -- Same formula as api/overview.js's SERVICE INCOME (SETTLED)
          -- query: Buyer's Premium Income = sold_price - bid_amount,
          -- Commission Income = bid_amount * commission / 100.
          sum(ifNull(lot_sold_price, 0) - ifNull(lot_bid_amount, 0)) AS buyers_premium_income,
          sum(ifNull(lot_bid_amount, 0) * ifNull(lot_commission_pct, 0) / 100) AS commission_income

        FROM settled_lots

        GROUP BY vendor
        ORDER BY settled_bid_amount DESC
        LIMIT 10
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    };

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
    const settledBiddersQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,
            any(a.store_name) AS store_name,
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
        ),

        -- PART 20 hover-preview fields: this bidder's own bidding activity
        -- WITHIN this cohort's auctions (not all-time) — Total Bids,
        -- Distinct Lots Bid On (auction_number + lot_number, never
        -- lot_number alone), Auctions Participated, Max Bid Usage Rate
        -- numerator. Bounded to selected_auctions (not an unscoped
        -- bid_history scan) via the INNER JOIN, so this is cheap relative
        -- to bidder_first_competitive above.
        bidder_bid_stats AS (
          SELECT
            lowerUTF8(trim(b.email)) AS bidder_key,
            count() AS total_bids,
            uniqExact(b.auction_number, b.lot_number) AS distinct_lots,
            uniqExact(b.auction_number) AS auctions_participated,
            countIf(b.max_bid_indicator = 'Max Bid') AS max_bid_events
          FROM cms.mart_cms_bid_history_report b
          INNER JOIN selected_auctions s ON b.auction_number = s.auction_number
          WHERE b.email IS NOT NULL AND trim(b.email) != ''
          GROUP BY bidder_key
        ),

        -- PART 22/20 "Winning via Max Bid" — same safest-available
        -- reconciliation as api/overview.js's winningMaxBidQuery (see that
        -- comment for the full rationale): match each settled lot's actual
        -- winning bid_history event by (auction_number, lot_number,
        -- bid_amount = the settled winning amount), argMax-tie-broken by
        -- the chronologically last such event.
        lot_winning_bid_match AS (
          SELECT
            b.auction_number AS auction_number,
            b.lot_number AS lot_number,
            argMax(b.max_bid_indicator, b.bid_created_at) AS winning_indicator
          FROM cms.mart_cms_bid_history_report b
          INNER JOIN selected_auctions s ON b.auction_number = s.auction_number
          INNER JOIN settled_lots sl ON b.auction_number = sl.auction_number AND b.lot_number = sl.lot_number
          WHERE b.bid_amount = sl.lot_bid_amount
          GROUP BY b.auction_number, b.lot_number
        )

        SELECT
          cb_email AS bidder_email,
          any(firstname) AS firstname,
          any(lastname) AS lastname,
          count() AS settled_lots,
          sum(ifNull(sl.lot_bid_amount, 0)) AS settled_bid_amount,
          uniqExact(sl.auction_number) AS winning_auctions,
          uniqExact(sl.store_name) AS branches,
          countIf(m.winning_indicator = 'Max Bid') AS winning_via_max_bid,

          if(
            min(fc.first_competitive_at) >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila'),
            'new',
            'returning'
          ) AS new_or_returning,

          -- any() (not sum/max across the JOIN fan-out): bidder_bid_stats
          -- is already one row per bidder_key, so any() here is a safe
          -- dedup of a single-valued join, never an aggregation choice.
          any(bbs.total_bids) AS total_bids,
          any(bbs.distinct_lots) AS distinct_lots,
          any(bbs.auctions_participated) AS auctions_participated,
          any(bbs.max_bid_events) AS max_bid_events

        FROM settled_lots sl

        INNER JOIN posting_customer
          ON sl.auction_number = pc_auction_number AND sl.lot_number = pc_lot_number

        INNER JOIN customer_bridge
          ON pc_customer_id = br_customer_id

        INNER JOIN cms_bidder_email
          ON br_hmr_customer_id = cb_customer_id

        LEFT JOIN bidder_first_competitive fc
          ON cb_email = fc.fc_bidder_key

        LEFT JOIN bidder_bid_stats bbs
          ON cb_email = bbs.bidder_key

        LEFT JOIN lot_winning_bid_match m
          ON sl.auction_number = m.auction_number AND sl.lot_number = m.lot_number

        GROUP BY cb_email
        ORDER BY settled_bid_amount DESC
        LIMIT 10
      `,
      query_params: queryParams,
      format: "JSONEachRow",
      // See settledCompositionQuery's identical comment above — this is
      // the heaviest of the 7 by rows read (~19M, an unscoped bid_history
      // scan for bidder_first_competitive).
      clickhouse_settings: { max_bytes_before_external_group_by: "500000000" },
    };

    // =========================================================
    // VENDOR ANALYTICS — all-lots-per-vendor aggregate (Top 10 Vendors,
    // Stuck Inventory, Active/New Vendor counts, Top-5 Concentration). ONE
    // bounded query serves ALL of these (PART 36: batch missing aggregates
    // rather than one-tiny-query-per-metric). Deliberately the BROADER
    // "listed"/"sold" population (same STATUS_PRIORITY_SQL definition as
    // api/overview.js's Lots Sold/Listed KPI — Outstanding/Paid/Unpaid/
    // Released all count as Sold), NOT the settled-only population
    // settledVendorsQuery above already serves for the existing Top Vendor
    // hover (left untouched — this is a separate, additive query, not a
    // replacement). No identity bridge — light, safe in the concurrent
    // batch below.
    // =========================================================
    const vendorAllLotsQuery = {
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE ending_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND ending_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        ),
        lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(a.store_name) AS store_name,
            argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
            any(ifNull(v.bid_amount, 0)) AS bid_amount,
            any(ifNull(v.sold_price, 0)) AS sold_price,
            any(ifNull(v.commission, 0)) AS commission_pct,
            any(ifNull(v.vendor, 'Unknown Vendor')) AS vendor,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
          FROM xv3.mart_auction_vendor_analysis v
          INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
          WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
          HAVING ({category:String} = '' OR lot_category = {category:String})
        )
        SELECT
          vendor,
          count() AS lots_listed,
          countIf(status IN ('Outstanding', 'Paid', 'Unpaid', 'Released')) AS lots_sold,
          sumIf(ifNull(bid_amount, 0), status IN ('Paid', 'Released')) AS settled_bid_amount,
          -- Same Buyer's Premium/Service Fee (commission) definitions as
          -- settledVendorsQuery above and api/overview.js's SERVICE INCOME
          -- query — added here (not just there) so the FULL vendor list
          -- (not just the top 10 by settled_bid_amount) can be ranked
          -- either "By Sold Bid Value" or "By Lots Sold" while still
          -- showing Service Income, entirely client-side, no second query.
          sumIf(ifNull(sold_price, 0) - ifNull(bid_amount, 0), status IN ('Paid', 'Released')) AS buyers_premium_income,
          sumIf(ifNull(bid_amount, 0) * ifNull(commission_pct, 0) / 100, status IN ('Paid', 'Released')) AS commission_income,
          uniqExact(auction_number) AS auction_events,
          uniqExact(store_name) AS branches
        FROM lots
        GROUP BY vendor
        ORDER BY settled_bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    };

    // Vendor first-ever-activity timestamp, ALL-TIME/unscoped (needed to
    // classify New Vendors within the selected period — PART 26: "best
    // reliable existing vendor first-seen field"). date_created is the
    // per-lot creation timestamp on vendor_analysis — the earliest
    // available proxy for when a vendor's consignment first entered the
    // system; no dedicated "vendor since" field exists on any mart
    // currently queried by this dashboard. Documented limitation: a vendor
    // whose very first-ever lot predates this warehouse's own retention/
    // ingestion window would be misclassified as "new" if their true first
    // activity isn't present at all — not something this query can detect.
    const vendorFirstSeenQuery = {
      query: `
        SELECT
          ifNull(vendor, 'Unknown Vendor') AS vendor,
          min(date_created) AS first_seen
        FROM xv3.mart_auction_vendor_analysis
        WHERE vendor IS NOT NULL
        GROUP BY vendor
      `,
      query_params: {},
      format: "JSONEachRow",
    };

    // ---------------------------------------------------------
    // PRODUCTION INCIDENT (2026-08-28): all 7 queries used to run via one
    // Promise.all. Investigated system.query_log around a real "(total)
    // memory limit exceeded ... While executing AggregatingTransform"
    // production failure and found 4 of the 7 each touch the full
    // BIDDER_IDENTITY_CTES bridge (or an equivalent partial bridge),
    // reading ~19M rows and peaking at roughly 350-510MB of their own.
    // Fixed by serializing those 4 (never more than ~500MB added to shared
    // server memory at any instant, instead of up to ~2GB from all 4 at
    // once) while the genuinely light queries stayed concurrent. See the
    // commit that introduced this split for the full incident writeup.
    //
    // GLOBAL BIDDER INVARIANT (this task): compositionQuery was redesigned
    // to guarantee Participating >= Winning (the real bid-history-UNION-
    // winners technique, not Math.max()/addition — see its own comment),
    // which requires the same BIDDER_IDENTITY_CTES bridge settledComposition
    // Query already uses. That moves it from the light batch into the
    // heavy serial chain below — 5 heavy queries now instead of 4, still
    // never overlapping each other, so peak added memory per request is
    // unchanged (~500MB, whichever single heavy query is running) even
    // though total request latency rises a bit further. perAuctionQuery
    // stays light and concurrent — it's no longer read by anything (see
    // App.jsx's participatingByAuction, now sourced from
    // perAuctionParticipatingUnion instead) but is left in place rather
    // than removed, to keep this change scoped to correctness, not cleanup.
    // ---------------------------------------------------------
    const [perAuctionResult, settledVendorsResult, vendorAllLotsResult, vendorFirstSeenResult] = await Promise.all([
      client.query(perAuctionQuery),
      client.query(settledVendorsQuery),
      client.query(vendorAllLotsQuery),
      client.query(vendorFirstSeenQuery),
    ]);

    const compositionResult = await client.query(compositionQuery);
    const settledCompositionResult = await client.query(settledCompositionQuery);
    const settledPerAuctionResult = await client.query(settledPerAuctionQuery);
    const perAuctionParticipatingUnionResult = await client.query(perAuctionParticipatingUnionQuery);
    const settledBiddersResult = await client.query(settledBiddersQuery);

    const [
      compositionRows,
      auctionRows,
      settledCompositionRows,
      settledPerAuctionRows,
      perAuctionParticipatingUnionRows,
      settledVendorRows,
      settledBidderRows,
    ] = await Promise.all([
      compositionResult.json(),
      perAuctionResult.json(),
      settledCompositionResult.json(),
      settledPerAuctionResult.json(),
      perAuctionParticipatingUnionResult.json(),
      settledVendorsResult.json(),
      settledBiddersResult.json(),
    ]);

    const vendorAllLotsRows = await vendorAllLotsResult.json();
    const vendorFirstSeenRows = await vendorFirstSeenResult.json();

    const composition = compositionRows[0] ?? {};
    const settledComposition = settledCompositionRows[0] ?? {};

    // VENDOR ANALYTICS derived figures — all from the ONE vendorAllLotsRows
    // aggregate above (already sorted settled_bid_amount DESC).
    const vendorFirstSeenMap = new Map(vendorFirstSeenRows.map((r) => [r.vendor, r.first_seen]));
    const activeVendorsCount = vendorAllLotsRows.length;
    const totalVendorBidAmount = vendorAllLotsRows.reduce((s, r) => s + (Number(r.settled_bid_amount) || 0), 0);
    const top5VendorRows = vendorAllLotsRows.slice(0, 5);
    const top5BidAmount = top5VendorRows.reduce((s, r) => s + (Number(r.settled_bid_amount) || 0), 0);
    // New Vendors: first-ever activity (all-time, unscoped) falls within
    // the selected [from, to] window AND the vendor is actually active
    // (has a listed lot) in this same period — never a vendor whose
    // first-ever lot was outside this window but who happens to reappear.
    const newVendorsCount = vendorAllLotsRows.filter((r) => {
      const firstSeen = vendorFirstSeenMap.get(r.vendor);
      return firstSeen && firstSeen >= `${from} 00:00:00` && firstSeen < `${to} 23:59:59.999`;
    }).length;

    // Phase 2C: cached at Vercel's Edge Network for 60s, keyed implicitly
    // by the full request URL (from/to/store/category — same stable,
    // order-consistent query-string convention as api/overview.js's
    // fetchJson()). Longer TTL than Overview's 30s is safe here: this
    // response is entirely settled/historical (composition, vendors,
    // bidders) with no live "right now" concept and no per-user/session
    // data, so a 60-90s-old snapshot carries no freshness risk beyond what
    // the 30s frontend poll already tolerates.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
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
        unclassified_lots: Number(settledComposition.unclassified_lots ?? 0),
        // Distinct unresolved-identity WINNING bidders (PART 8) — see the
        // query's own comment above.
        unclassified_bidders: Number(settledComposition.unclassified_bidders ?? 0),

        total_lots: Number(settledComposition.total_lots ?? 0),
        total_bid_amount: Number(settledComposition.total_bid_amount ?? 0),
      },

      // TOP VENDORS (settled, Paid/Released) — ranked by settled_bid_amount
      // descending. Replaces the previous mock-data leaderboard.
      vendors: settledVendorRows.map((row) => {
        const settled_lots = Number(row.settled_lots ?? 0);
        const settled_bid_amount = Number(row.settled_bid_amount ?? 0);
        const auction_events = Number(row.auction_events ?? 0);
        const buyers_premium_income = Number(row.buyers_premium_income ?? 0);
        const commission_income = Number(row.commission_income ?? 0);
        return {
          vendor: row.vendor,
          settled_lots,
          settled_bid_amount,
          average_bid_amount_per_lot: settled_lots > 0 ? settled_bid_amount / settled_lots : 0,
          // PART 19 hover-preview fields. Lots Listed/Sell-through Rate/
          // Unsold Lots/Unsold Reserve Value/Participating-Winning bidder
          // engagement are DEFERRED (see final report) — each would
          // require a separate full all-lots-per-vendor scan (status
          // dedup) or a per-vendor bidder-identity join, disproportionate
          // for a decorative hover per this task's own guidance.
          auction_events,
          service_income: buyers_premium_income + commission_income,
          avg_bid_per_auction: auction_events > 0 ? settled_bid_amount / auction_events : null,
          avg_bid_per_sold_lot: settled_lots > 0 ? settled_bid_amount / settled_lots : null,
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
        const totalBids = Number(row.total_bids ?? 0);
        const distinctLots = Number(row.distinct_lots ?? 0);
        const maxBidEvents = Number(row.max_bid_events ?? 0);
        return {
          bidder_name,
          // Canonical email key (same lowerUTF8(trim(email)) identity as
          // api/overview.js's bidder_engagement bidder_key) — exposed so
          // the frontend can deterministically cross-reference this
          // settled-bidder row against that SAME already-fetched dataset's
          // registration/most-frequent-store/months-active enrichment
          // (see BidderAnalyticsView.jsx) by KEY, never by name matching.
          bidder_email: row.bidder_email ?? null,
          settled_lots,
          settled_wins: settled_lots,
          settled_bid_amount,
          average_bid_amount_per_win: settled_lots > 0 ? settled_bid_amount / settled_lots : 0,
          new_or_returning: row.new_or_returning ?? "returning",
          // PART 20/21/22 hover-preview fields — this bidder's own bidding
          // activity within THIS cohort's auctions (bidder_bid_stats),
          // never a fabricated 0 when the bridge legitimately finds none.
          winning_auctions: Number(row.winning_auctions ?? 0),
          auctions_participated: Number(row.auctions_participated ?? 0),
          distinct_lots_bid_on: distinctLots,
          total_bids: totalBids,
          avg_bids_per_lot: distinctLots > 0 ? totalBids / distinctLots : null,
          max_bid_usage_pct: totalBids > 0 ? (maxBidEvents / totalBids) * 100 : null,
          winning_via_max_bid: Number(row.winning_via_max_bid ?? 0),
          // PART 23 (Bidder Analytics Top 10 Bidders table) — distinct
          // branches this bidder actually won a lot in, same settled_lots
          // population as settled_bid_amount above.
          branches: Number(row.branches ?? 0),
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

      // Real deduplicated UNION of bid-history participants and resolved
      // winning bidders, per auction. See the perAuctionParticipatingUnionResult
      // query comment above for the full rule (Participating >= Winning,
      // Bid Activity never fabricated for winner-only bidders). Now also
      // consumed by Overview's own Auctions Concluded/Lots Sold drilldown
      // (see App.jsx's participatingByAuction) — the older
      // perAuctionBiddingActivity (bid-history-only, no winner union)
      // could show Participating < Winning for a Negotiated auction with
      // no bid-history at all, violating the global invariant.
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

      // GLOBAL BIDDER INVARIANT: compositionQuery above now computes the
      // real deduplicated UNION of bid-history participants and resolved
      // winning bidders (same technique as perAuctionParticipatingUnion,
      // collapsed to one overall row instead of per-auction) — no longer
      // the pure bid-history-activity-only definition this field's name
      // suggests. Field name kept unchanged (still feeds Overview's
      // top-level "Participating Bidders" card via participatingComposition)
      // so nothing built on this field needs to change, only what it
      // guarantees: Winning is now always <= this value, structurally.
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

        // Unclassified: a union member (real bidder or resolved winner)
        // whose identity resolves through neither the competitive nor the
        // negotiated first-ever-participation bridge — kept for internal
        // reconciliation visibility only, same convention as settled
        // Winning's own unclassified_bid_amount above; never surfaced as a
        // normal third UI category. Its peso amount is already folded into
        // returning_bidders_bid_amount (real money must land somewhere),
        // its count is not (never guessed into New or Returning).
        unclassified_bidders: Number(
          composition.unclassified_bidders ?? 0,
        ),
        unclassified_bid_amount: Number(
          composition.unclassified_bid_amount ?? 0,
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

      // VENDOR ANALYTICS — see vendorAllLotsQuery/vendorFirstSeenQuery
      // comments above. all_lots is the one bounded aggregate every
      // Vendor Analytics section (Top 10 Vendors, Stuck Inventory,
      // Active/New Vendor counts, Top-5 Concentration) derives from —
      // never a per-vendor request.
      vendor_analytics: {
        active_vendors: activeVendorsCount,
        new_vendors: newVendorsCount,
        total_vendor_bid_amount: totalVendorBidAmount,
        top5_vendor_bid_amount: top5BidAmount,
        top5_vendor_concentration_pct: totalVendorBidAmount > 0 ? (top5BidAmount / totalVendorBidAmount) * 100 : null,
        all_lots: vendorAllLotsRows.map((row) => ({
          vendor: row.vendor,
          lots_listed: Number(row.lots_listed ?? 0),
          lots_sold: Number(row.lots_sold ?? 0),
          settled_bid_amount: Number(row.settled_bid_amount ?? 0),
          // Same components as settledVendorsQuery's vendors[] above,
          // computed for EVERY vendor (not just the top 10 by settled
          // value) so Vendor Analytics' Top 10 can be ranked either way
          // (by Sold Bid Value or by Lots Sold) and still show Service
          // Income for whichever 10 vendors end up in view.
          buyers_premium_income: Number(row.buyers_premium_income ?? 0),
          commission_income: Number(row.commission_income ?? 0),
          auction_events: Number(row.auction_events ?? 0),
          branches: Number(row.branches ?? 0),
          first_seen: vendorFirstSeenMap.get(row.vendor) ?? null,
        })),
      },
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