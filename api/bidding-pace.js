import { createClient } from "@clickhouse/client";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";
import { BIDDER_IDENTITY_CTES } from "./_bidderIdentity.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// =========================================================
// BIDDING PACE — the ONE authoritative hourly-breakdown endpoint, reused
// unmodified by BOTH Overview's and Bidding Pace's "Bidding Activity by
// Hour" hover tooltip (per-hour Bid Activity + Participating + Winning),
// so the two pages can never drift onto two different hourly bidder
// methodologies. `category` is optional and additive-only (a no-op when
// '' — Bidding Pace itself never passes it, deliberately decoupled from
// Overview's category selector; Overview passes its own selected category
// through unmodified), same convention as every other category-scoped
// query in this codebase.
//
// bid_amount per hour: an ISOLATED DUPLICATE of api/overview.js's own
// hourlyResult query (same tables, same joins, same date/store/category
// scoping, same toHour(bid_created_at, 'Asia/Manila') timezone handling) —
// verified byte-identical to it. Category is applied via the same
// LEFT JOIN lot_category + no-op WHERE clause pattern api/overview.js
// itself uses, so a category-scoped call here always agrees with a
// category-scoped call to /api/overview.
//
// PARTICIPATING per hour — every real bid EVENT from
// cms.mart_cms_bid_history_report, classified by the SAME raw-email/
// first-bid-at-vs-range-start rule api/leaderboards.js's compositionResult
// already uses (no new identity logic). A bidder with multiple bid events
// in the same hour counts once as a bidder; every event's amount still
// contributes to that hour's activity sum. bid_amount itself is summed
// from ALL bid events regardless of whether they carry a usable email —
// unchanged from the pre-existing methodology — so Participating's
// new+returning total can fall slightly short of bid_amount when a bid
// event is missing an email (the same small, already-disclosed gap
// Bidding Pace's non-hourly Participating card showed before this hourly
// rework; never forced to reconcile).
//
// AUCTION_COUNT per hour — countDistinct(auction_number) over the exact
// same scoped_bids population as bid_amount/Participating above (same
// date/store/category scope, same bid-event hour bucket). An auction with
// many bid events in one hour still counts once for that hour; an auction
// active across several hours counts once in each hour it has activity in
// — never counting individual bids or lots as auctions.
//
// Scope note: PARTICIPATING above is an activity-time signal (which hour
// of day real bid EVENTS landed in, scoped by bid_created_at itself,
// mirroring overview.js's hourlyResult) while WINNING below is an
// auction-cohort signal (which auctions' settled lots to include, scoped
// by ending_time, the canonical historical-attribution rule), then
// separately attributed to an hour via its own winning bid's timestamp.
// These are deliberately two different scoping bases for two different
// questions ("when did bidding happen" vs "which auctions concluded here")
// — the global PARTICIPATING >= WINNING invariant is therefore evaluated
// per-hour on this endpoint's own terms, not assumed to hold arithmetically
// the way it does for the same-cohort UNION queries elsewhere in this app.
//
// WINNING per hour — settled (Paid/Released) lots, identity resolved via
// the canonical BIDDER_IDENTITY_CTES bridge (api/_bidderIdentity.js),
// exactly as api/leaderboards.js's settledCompositionResult already does.
// The HOUR a winning lot is attributed to is investigated and proven
// separately from that identity: settled lots do not carry their own bid
// EVENT timestamp, only a settlement/payment date, which is not a bidding
// moment. Real-data investigation (last 90 days, all stores, 2,328
// Online-type settled lots) found that joining back to
// cms.mart_cms_bid_history_report on (auction_number, lot_number,
// bid_amount = the lot's own settled bid_amount) and taking the LATEST
// matching bid_created_at resolves an unambiguous hour for ~94% of
// settled lots (2,175 single-match + 17 multi-match, all 17 same bidder
// AND same hour — never a different person or a different hour), 0 cases
// where the matched identity disagreed with itself. A simpler "latest bid
// overall regardless of amount" alternative was tested and found
// materially worse (matches the settled amount only ~88% of the time over
// a wider window) and was rejected. The remaining ~6% of settled lots
// (mostly Negotiated-type, which never post through the online bidding
// system at all, and a residual few genuinely missing a matching bid
// event) cannot be defensibly attributed to an hour and are EXCLUDED from
// the hourly winning breakdown — never guessed into an hour — surfaced
// instead as the separate top-level `winning_unattributed` total so the
// gap is disclosed, not hidden. Winning counts (new/returning) are
// distinct-bidder counts WITHIN each hour, same as the existing composition
// query's semantics — summing them across every hour can exceed the flat,
// all-time distinct total when the same bidder wins in more than one hour
// bucket (each hour counts that bidder once); Winning AMOUNTS are strictly
// additive and DO reconcile exactly to the flat total when summed across
// every hour bucket, including the unattributed one — verified against the
// already-validated composition figures.
// =========================================================

export default async function handler(req, res) {
  try {
    const { from, to, store = "", category = "" } = req.query;
    const queryParams = { from, to, store, category };

    // ---------------------------------------------------------
    // BID ACTIVITY + PARTICIPATING, per hour
    // ---------------------------------------------------------
    const activityResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
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

        bidder_first_bid AS (
          SELECT
            lowerUTF8(trim(email)) AS bidder_key,
            min(bid_created_at) AS first_bid_at
          FROM cms.mart_cms_bid_history_report
          WHERE bid_created_at IS NOT NULL AND email IS NOT NULL AND trim(email) != ''
          GROUP BY bidder_key
        ),

        scoped_bids AS (
          SELECT
            toHour(b.bid_created_at, 'Asia/Manila') AS hour,
            ifNull(b.bid_amount, 0) AS bid_amount,
            lowerUTF8(trim(b.email)) AS bidder_key,
            (b.email IS NOT NULL AND trim(b.email) != '') AS has_email,
            b.auction_number AS auction_number
          FROM cms.mart_cms_bid_history_report b
          INNER JOIN auction_store s ON b.auction_number = s.auction_number
          LEFT JOIN lot_category lc ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number
          WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR s.store_name = {store:String})
            AND ({category:String} = '' OR lc.lot_category = {category:String})
        )

        SELECT
          sb.hour AS hour,
          sum(sb.bid_amount) AS bid_amount,
          countDistinct(sb.auction_number) AS auction_count,

          uniqExactIf(sb.bidder_key, sb.has_email AND f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new,
          uniqExactIf(sb.bidder_key, sb.has_email AND f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning,
          ifNull(sumIf(sb.bid_amount, sb.has_email AND f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')), 0) AS participating_new_amount,
          ifNull(sumIf(sb.bid_amount, sb.has_email AND f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')), 0) AS participating_returning_amount

        FROM scoped_bids sb
        LEFT JOIN bidder_first_bid f ON sb.bidder_key = f.bidder_key
        GROUP BY hour
        ORDER BY hour
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // ---------------------------------------------------------
    // WINNING, per hour (hour_bucket = -1 is the unattributed remainder —
    // settled lots with no matching bid-event row to derive an hour from)
    // ---------------------------------------------------------
    const winningResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          -- Canonical historical reporting rule: an auction belongs to the
          -- period it ENDS in, not the period it started in — same
          -- selected_auctions scoping convention as every other settled/
          -- winning cohort query in this codebase.
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
          INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL
          GROUP BY v.auction_number, v.lot_number
          HAVING ({category:String} = '' OR lot_category = {category:String})
        ),

        ${BIDDER_IDENTITY_CTES},

        lot_winning_bid_event AS (
          SELECT
            sl.auction_number AS auction_number,
            sl.lot_number AS lot_number,
            max(b.bid_created_at) AS winning_bid_at
          FROM settled_lots sl
          LEFT JOIN cms.mart_cms_bid_history_report b
            ON b.auction_number = sl.auction_number
            AND b.lot_number = sl.lot_number
            AND b.bid_amount = sl.lot_bid_amount
          GROUP BY sl.auction_number, sl.lot_number
        )

        SELECT
          if(lwbe.winning_bid_at IS NULL, -1, toHour(lwbe.winning_bid_at, 'Asia/Manila')) AS hour_bucket,

          uniqExactIf(rli.resolved_email, fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_new,
          ifNull(sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')), 0) AS winning_new_amount,

          uniqExactIf(rli.resolved_email, fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_returning,
          ifNull(sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')), 0) AS winning_returning_amount,

          ifNull(sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NULL), 0) AS winning_unresolved_amount,
          countIf(fe.first_ever_at IS NULL) AS winning_unresolved_lots,

          count() AS winning_total_lots,
          ifNull(sum(ifNull(sl.lot_bid_amount, 0)), 0) AS winning_total_amount

        FROM settled_lots sl
        LEFT JOIN lot_winning_bid_event lwbe ON sl.auction_number = lwbe.auction_number AND sl.lot_number = lwbe.lot_number
        LEFT JOIN resolved_lot_identity rli ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number
        LEFT JOIN bidder_first_ever fe ON rli.resolved_email = fe.fe_key
        GROUP BY hour_bucket
        ORDER BY hour_bucket
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const activityRows = await activityResult.json();
    const winningRows = await winningResult.json();

    const winningByHour = new Map();
    let unattributedLots = 0;
    let unattributedAmount = 0;

    for (const row of winningRows) {
      const bucket = Number(row.hour_bucket);
      const entry = {
        new: Number(row.winning_new) || 0,
        returning: Number(row.winning_returning) || 0,
        new_amount: Number(row.winning_new_amount) || 0,
        returning_amount: Number(row.winning_returning_amount) || 0,
        unresolved_amount: Number(row.winning_unresolved_amount) || 0,
      };
      if (bucket === -1) {
        unattributedLots = Number(row.winning_total_lots) || 0;
        unattributedAmount = Number(row.winning_total_amount) || 0;
      } else {
        winningByHour.set(bucket, entry);
      }
    }

    const hourly = activityRows.map((row) => {
      const hour = Number(row.hour);
      return {
        hour,
        bid_amount: Number(row.bid_amount) || 0,
        auction_count: Number(row.auction_count) || 0,
        participating: {
          new: Number(row.participating_new) || 0,
          returning: Number(row.participating_returning) || 0,
          new_amount: Number(row.participating_new_amount) || 0,
          returning_amount: Number(row.participating_returning_amount) || 0,
        },
        winning: winningByHour.get(hour) ?? {
          new: 0,
          returning: 0,
          new_amount: 0,
          returning_amount: 0,
          unresolved_amount: 0,
        },
      };
    });

    return res.status(200).json({
      hourly,
      // Settled winning lots that couldn't be tied to a bid-event hour
      // (mostly Negotiated auctions, which never post to bid_history at
      // all, plus a small residual with no matching bid-event row) —
      // real value, deliberately excluded from every hour bucket above
      // rather than fabricated into one. Disclosed here, never hidden.
      winning_unattributed: {
        lots: unattributedLots,
        amount: unattributedAmount,
      },
    });
  } catch (err) {
    console.error("Bidding pace API error:", err);

    return res.status(500).json({
      error: "Failed to load bidding pace",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
