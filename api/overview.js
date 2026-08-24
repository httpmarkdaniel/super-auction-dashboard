import { createClient } from "@clickhouse/client";
import { getLiveLotsSafe } from "./_liveBids.js";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

// cms.hmr.ph is an external, not-fully-trusted upstream — a malformed
// current_bid (empty string, "N/A", etc.) must never become NaN and
// silently poison a running total via +=. Anything that doesn't parse to
// a finite number is treated as 0.
function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// vendor_analysis fans out one row per item_barcode within a lot, and
// those rows can disagree on `status` when a lot's items were updated at
// slightly different times mid-transition (e.g. some barcodes flipped to
// 'Released' while a couple stayed at 'Paid'). any(status) is therefore
// non-deterministic — ClickHouse doesn't guarantee which row it picks,
// so the same query can return different Sold/Unsold counts across runs.
//
// Investigated against real data (see conversation record): released_date
// is populated only on 'Released' rows and never on 'Paid' rows, and is
// shared across all truly-Released rows in a lot — confirming Released is
// a strictly later lifecycle stage than Paid, never the reverse. This
// priority order lets argMax(status, priority) deterministically pick the
// most-advanced status per lot instead of an arbitrary one:
//   Released > Paid > Refunded > Returned > Outstanding > Unpaid > Unsold
// Refunded/Returned (rare, real statuses not in the original 5-value set)
// only ever co-occur with Released in the data checked, so their exact
// rank relative to Paid doesn't move any real result — they're ranked
// below Released on the same "actual transaction happened" logic used for
// Unsold: if ANY row in a lot shows real transaction evidence, that
// outranks a status claiming nothing happened.
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

export default async function handler(req, res) {
  try {
    const { from, to, store = "", type = "summary" } = req.query;

    if (type === "active-auctions") {
      const result = await client.query({
        query: `
      SELECT
        auction_number,
        any(name) AS auction_name,
        any(store_name) AS auction_store_name,
        min(starting_time) AS auction_starting_time,
        max(ending_time) AS auction_ending_time,
        max(lot_count) AS auction_lot_count

      FROM xv3.mart_auction_productivity_report

      WHERE starting_time <= now()
        AND ending_time >= now()
        AND (
          {store:String} = ''
          OR store_name = {store:String}
        )

      GROUP BY auction_number
      ORDER BY auction_ending_time ASC
    `,

        query_params: { store },
        format: "JSONEachRow",
      });

      const rows = await result.json();

      return res.status(200).json({
        type: "active-auctions",
        total: rows.length,

        rows: rows.map((row) => ({
          auction_number: row.auction_number,
          name: row.auction_name,
          store_name: row.auction_store_name,
          starting_time: row.auction_starting_time,
          ending_time: row.auction_ending_time,
          lot_count: Number(row.auction_lot_count ?? 0),
        })),
      });
    }

    // ONLY SUMMARY / LOT DRILLDOWNS REQUIRE DATES
    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    const queryParams = { from, to, store };

    // ...rest of your existing code

    // =========================================================
    // LOTS SOLD / LISTED DRILL-DOWN
    //
    // Listed = every deduped lot in date-scoped auctions. Sold = any lot
    // past the Unsold stage (Outstanding, Paid, Unpaid, Released) — kept
    // unchanged per investigation (the dedup fix below doesn't change
    // which statuses count as Sold, only which single status a lot with
    // disagreeing duplicate rows resolves to). See STATUS_PRIORITY_SQL's
    // comment for why any(status) was replaced with a deterministic pick.
    // Date scoping is now Asia/Manila-aware, matching every settled query.
    // =========================================================
    if (type === "lots") {
      const result = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT
              auction_number,
              store_name

            FROM xv3.mart_auction_productivity_report

            WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
              AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)

              AND (
                {store:String} = ''
                OR store_name = {store:String}
              )
          ),

          lots AS (
            SELECT
              v.auction_number,
              v.lot_number,
              any(v.name) AS name,
              any(v.vendor) AS vendor,
              argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
              max(ifNull(v.reserved_price, 0)) AS reserved_price,
              max(ifNull(v.sold_price, 0)) AS sold_price,
              any(v.bid_amount) AS bid_amount,
              any(a.store_name) AS store_name

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY
              v.auction_number,
              v.lot_number
          )

          SELECT
            auction_number,
            lot_number,
            name,
            vendor,
            status,
            reserved_price,
            sold_price,
            bid_amount,
            store_name,

            if(
              status IN (
                'Outstanding',
                'Paid',
                'Unpaid',
                'Released'
              ),
              'Sold',
              'Unsold'
            ) AS disposition

          FROM lots

          ORDER BY
            auction_number,
            lot_number
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
        store_name: row.store_name,
        status: row.status,
        disposition: row.disposition,
        reserved_price: Number(row.reserved_price ?? 0),
        sold_price: Number(row.sold_price ?? 0),
        bid_amount: Number(row.bid_amount ?? 0),
      }));

      const sold = mappedRows.filter(
        (row) => row.disposition === "Sold",
      ).length;

      const unsold = mappedRows.filter(
        (row) => row.disposition === "Unsold",
      ).length;

      return res.status(200).json({
        type: "lots",

        summary: {
          listed: mappedRows.length,
          sold,
          unsold,
          sell_through_rate:
            mappedRows.length > 0
              ? Number(((sold / mappedRows.length) * 100).toFixed(1))
              : 0,
        },

        rows: mappedRows,
      });
    }

    // =========================================================
    // UNSOLD LOTS DRILL-DOWN
    //
    // Definition: status = 'Unsold' (strict), deduped by auction_number +
    // lot_number, value = reserved_price. Same deterministic status
    // resolution and Asia/Manila date scoping as the "lots" drilldown
    // above.
    //
    // NOTE: strict status='Unsold' is a NARROWER population than "not
    // Sold" — a lot resolved to 'Refunded' or 'Returned' (real statuses,
    // confirmed present in real data, outside the original 5-value set)
    // is neither in the Sold list nor literally 'Unsold', so
    // sold_lots + unsold_lots will not always sum to listed_lots when
    // such lots exist in range. Flagged, not silently resolved — see
    // implementation report.
    // =========================================================
    if (type === "unsold-lots") {
      const result = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT
              auction_number,
              store_name

            FROM xv3.mart_auction_productivity_report

            WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
              AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)

              AND (
                {store:String} = ''
                OR store_name = {store:String}
              )
          ),

          lots AS (
            SELECT
              v.auction_number,
              v.lot_number,
              any(v.name) AS name,
              any(v.vendor) AS vendor,
              argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
              max(ifNull(v.reserved_price, 0)) AS reserved_price,
              max(ifNull(v.sold_price, 0)) AS sold_price,
              any(a.store_name) AS store_name

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY
              v.auction_number,
              v.lot_number
          )

          SELECT
            auction_number,
            lot_number,
            name,
            vendor,
            status,
            reserved_price,
            sold_price,
            store_name

          FROM lots

          WHERE status = 'Unsold'

          ORDER BY
            reserved_price DESC,
            auction_number,
            lot_number
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
        store_name: row.store_name,
        status: row.status,
        reserved_price: Number(row.reserved_price ?? 0),
        sold_price: Number(row.sold_price ?? 0),
      }));

      const unsoldValue = mappedRows.reduce(
        (sum, row) => sum + row.reserved_price,
        0,
      );

      const withReserveRows = mappedRows.filter((row) => row.reserved_price > 0);
      const withReserveValue = withReserveRows.reduce(
        (sum, row) => sum + row.reserved_price,
        0,
      );

      return res.status(200).json({
        type: "unsold-lots",

        summary: {
          count: mappedRows.length,
          value: unsoldValue,
          // With Reserve Price: same population, filtered to
          // reserved_price > 0 — see api/overview.js's summary branch for
          // the corresponding unsold_with_reserve_count/value KPI fields.
          with_reserve_count: withReserveRows.length,
          with_reserve_value: withReserveValue,
        },

        rows: mappedRows,
      });
    }

    // =========================================================
    // TOTAL BID AMOUNT DRILL-DOWN (settled lots)
    //
    // The exact lot-level population behind the settled Total Bid Amount
    // KPI: status IN ('Paid','Released'), deduped by auction_number +
    // lot_number, amount = bid_amount, same Asia/Manila date scoping and
    // store filter as the summary's settledTotalResult query below —
    // literally the same CTE, so sum(rows.bid_amount) is structurally
    // guaranteed to equal total_bid_amount for the same from/to/store.
    //
    // Bidder identity uses the same deterministic ID bridge already
    // validated for Bidder Composition / Top Bidders (vendor_analysis ->
    // xv3.auctions -> xv3.postings -> xv3.customers ->
    // cms.mart_cms_bidder_registrations). No fuzzy matching. A row whose
    // identity can't be bridged returns bidder_name: null — the frontend
    // renders that as "—", never a fabricated name.
    // =========================================================
    if (type === "settled-lots") {
      const result = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT
              auction_number,
              store_name
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
              any(v.name) AS name,
              any(v.vendor) AS vendor,
              any(v.status) AS status,
              any(v.bid_amount) AS bid_amount,

              any(
                CASE
                  WHEN v.name ILIKE '%bulk%' OR v.name ILIKE '%pallet%' THEN 'Bulk Auction'
                  WHEN v.name ILIKE '%vehicle%' OR v.name ILIKE '%motorcycle%' OR v.name ILIKE '%car%'
                    OR v.name ILIKE '%truck%' OR v.name ILIKE '%van%' OR v.name ILIKE '%electric vehicle%'
                    THEN 'Vehicles and Automotive'
                  WHEN v.name ILIKE '%equipment%' OR v.name ILIKE '%industrial%' OR v.name ILIKE '%generator%'
                    OR v.name ILIKE '%backhoe%' OR v.name ILIKE '%excavator%' OR v.name ILIKE '%construction%'
                    THEN 'Equipment and Industrial'
                  ELSE 'General Merchandise'
                END
              ) AS category

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
            INNER JOIN xv3.auctions au ON p.auction_id = au.auction_id
            WHERE p.customer_id IS NOT NULL AND p.customer_id != 0
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
              any(customer_firstname) AS firstname,
              any(customer_lastname) AS lastname
            FROM cms.mart_cms_bidder_registrations
            WHERE customer_id IS NOT NULL AND email IS NOT NULL
            GROUP BY customer_id
          )

          SELECT
            sl.auction_number AS auction_number,
            sl.lot_number AS lot_number,
            sl.name AS name,
            sl.vendor AS vendor,
            sl.status AS status,
            sl.bid_amount AS bid_amount,
            sl.store_name AS store_name,
            sl.category AS category,
            cb.firstname AS bidder_firstname,
            cb.lastname AS bidder_lastname

          FROM settled_lots sl

          LEFT JOIN posting_customer pc
            ON sl.auction_number = pc.pc_auction_number AND sl.lot_number = pc.pc_lot_number

          LEFT JOIN customer_bridge br
            ON pc.pc_customer_id = br.br_customer_id

          LEFT JOIN cms_bidder_email cb
            ON br.br_hmr_customer_id = cb.cb_customer_id

          ORDER BY sl.auction_number, sl.lot_number
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      });

      const rows = await result.json();

      const mappedRows = rows.map((row) => {
        const bidderName = [row.bidder_lastname, row.bidder_firstname].filter(Boolean).join(", ") || null;
        return {
          auction_number: row.auction_number,
          lot_number: row.lot_number,
          name: row.name,
          vendor: row.vendor,
          status: row.status,
          store_name: row.store_name,
          category: row.category,
          bidder_name: bidderName,
          bid_amount: Number(row.bid_amount ?? 0),
        };
      });

      const totalBidAmount = mappedRows.reduce((sum, row) => sum + row.bid_amount, 0);

      return res.status(200).json({
        type: "settled-lots",

        summary: {
          count: mappedRows.length,
          total_bid_amount: totalBidAmount,
        },

        rows: mappedRows,
      });
    }

    // =========================================================
    // SUMMARY
    // =========================================================

    // ---------------------------------------------------------
    // TOTAL BID AMOUNT
    //
    // Represents the sum of each lot's CURRENT/STANDING bid — not the sum
    // of every bid ever placed. bid_history has one row per bid EVENT, so
    // naively summing bid_amount across events measures cumulative bidding
    // activity, not a lot's current value (confirmed against real data:
    // auction 134SUC lot 7 had 6 events summing to 4,050 while its actual
    // standing bid never exceeded 800). The correct per-lot figure is its
    // latest bid by time — argMax(bid_amount, bid_created_at) — summed
    // across lots. ClickHouse rejects sum(argMax(...)) at the same
    // aggregation level, so this is computed as a CTE grouped by
    // auction_number + lot_number first, then summed in the outer query.
    // ---------------------------------------------------------
    const totalResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        ),

        lot_latest_bid AS (
          SELECT
            b.auction_number AS auction_number,
            b.lot_number AS lot_number,
            argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount

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

          GROUP BY
            b.auction_number,
            b.lot_number
        )

        SELECT
          sum(latest_bid_amount) AS total_bid_amount

        FROM lot_latest_bid
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const totalRows = await totalResult.json();
    const total = totalRows[0] ?? {};

    // ---------------------------------------------------------
    // TODAY'S BID
    // Always uses the current Asia/Manila calendar day.
    // Still respects the selected store.
    //
    // Same latest-per-lot definition as TOTAL BID AMOUNT above — see that
    // comment for why sum(bid_amount) across events is the wrong metric.
    // ---------------------------------------------------------
    const todayBidResult = await client.query({
      query: `
    WITH auction_store AS (
      SELECT DISTINCT
        auction_number,
        store_name
      FROM xv3.mart_auction_productivity_report
      WHERE auction_number IS NOT NULL
    ),

    lot_latest_bid AS (
      SELECT
        b.auction_number AS auction_number,
        b.lot_number AS lot_number,
        argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount

      FROM cms.mart_cms_bid_history_report b

      INNER JOIN auction_store s
        ON b.auction_number = s.auction_number

      WHERE b.bid_created_at >= toStartOfDay(
        now('Asia/Manila')
      )

        AND b.bid_created_at < addDays(
          toStartOfDay(now('Asia/Manila')),
          1
        )

        AND (
          {store:String} = ''
          OR s.store_name = {store:String}
        )

      GROUP BY
        b.auction_number,
        b.lot_number
    )

    SELECT
      ifNull(sum(latest_bid_amount), 0) AS todays_bid_amount

    FROM lot_latest_bid
  `,

      query_params: {
        store,
      },

      format: "JSONEachRow",
    });

    const todayBidRows = await todayBidResult.json();
    const todayBid = todayBidRows[0] ?? {};

    const todayManila = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());

    // ---------------------------------------------------------
    // TOTAL BID AMOUNT (SETTLED) — the business definition of
    // "Total Bid Amount" going forward.
    //
    // Population: xv3.mart_auction_vendor_analysis, status IN ('Paid',
    // 'Released') only — a lot that's still being bid on, or won but not
    // yet paid/released, does not count. Authoritative amount field is
    // bid_amount (the hammer price) — NOT sold_price, which is bid_amount
    // + buyer's premium (confirmed against real rows: sold_price =
    // bid_amount * 1.15 exactly matching each row's own buyers_premium
    // field). sold_price already belongs to Service Income, a separate
    // metric — using it here would double-count the premium.
    //
    // vendor_analysis fans out one row per item_barcode within a lot, all
    // sharing the same bid_amount — deduped via GROUP BY auction_number,
    // lot_number + any() (verified: 97.4% of duplicate-key rows agree on
    // every value; the rest only disagree on status mid-transition).
    //
    // Scoped by the auction's starting_time (same convention as the
    // "lots"/sold_lots queries elsewhere in this file), not by any
    // settlement-timestamp field on vendor_analysis — those fields
    // (date_time_paid/released_date) are populated for only ~60-87% of
    // rows, whereas starting_time via productivity_report covers ~100%
    // of rows that have a real auction_number.
    // ---------------------------------------------------------
    const settledTotalResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
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

          GROUP BY
            v.auction_number,
            v.lot_number
        )

        SELECT
          sum(ifNull(lot_bid_amount, 0)) AS settled_total_bid_amount

        FROM settled_lots
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const settledTotalRows = await settledTotalResult.json();
    const settledTotalBidAmount = Number(settledTotalRows[0]?.settled_total_bid_amount ?? 0);

    // ---------------------------------------------------------
    // TODAY'S BID AMOUNT (SETTLED)
    // Same definition as above, fixed to today's Asia/Manila calendar
    // day regardless of the selected range — mirrors how the old
    // todays_bid_amount always meant "today" independent of the picker.
    // ---------------------------------------------------------
    const settledTodayResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({today:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({today:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
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

          GROUP BY
            v.auction_number,
            v.lot_number
        )

        SELECT
          sum(ifNull(lot_bid_amount, 0)) AS settled_today_bid_amount

        FROM settled_lots
      `,
      query_params: { today: todayManila, store },
      format: "JSONEachRow",
    });

    const settledTodayRows = await settledTodayResult.json();
    const settledTodayBidAmount = Number(settledTodayRows[0]?.settled_today_bid_amount ?? 0);

    // ---------------------------------------------------------
    // BID VALUE BY BRANCH (SETTLED)
    //
    // Same population/definition as TOTAL BID AMOUNT above — literally
    // the same settled_lots CTE, just grouped by store_name instead of
    // collapsed to a scalar. This structurally guarantees
    // sum(branches.bid_amount) == total_bid_amount, since both are sums
    // over the exact same rows.
    // ---------------------------------------------------------
    const settledBranchResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
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

          GROUP BY
            v.auction_number,
            v.lot_number
        )

        SELECT
          store_name AS branch,
          sum(ifNull(lot_bid_amount, 0)) AS bid_amount

        FROM settled_lots

        GROUP BY store_name
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const settledBranchRows = await settledBranchResult.json();

    // ---------------------------------------------------------
    // BID VALUE BY CATEGORY (SETTLED)
    //
    // Same population/definition as TOTAL BID AMOUNT above. Category is
    // derived from vendor_analysis's own `name` column on the SAME row
    // being summed (no join needed), with an unconditional ELSE branch —
    // so every settled lot always resolves to a category and no
    // "Uncategorized" fallback is structurally possible here. This
    // guarantees sum(categories.bid_amount) == total_bid_amount.
    // ---------------------------------------------------------
    const settledCategoryResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,

            any(
              CASE
                WHEN v.name ILIKE '%bulk%'
                  OR v.name ILIKE '%pallet%'
                  THEN 'Bulk Auction'

                WHEN v.name ILIKE '%vehicle%'
                  OR v.name ILIKE '%motorcycle%'
                  OR v.name ILIKE '%car%'
                  OR v.name ILIKE '%truck%'
                  OR v.name ILIKE '%van%'
                  OR v.name ILIKE '%electric vehicle%'
                  THEN 'Vehicles and Automotive'

                WHEN v.name ILIKE '%equipment%'
                  OR v.name ILIKE '%industrial%'
                  OR v.name ILIKE '%generator%'
                  OR v.name ILIKE '%backhoe%'
                  OR v.name ILIKE '%excavator%'
                  OR v.name ILIKE '%construction%'
                  THEN 'Equipment and Industrial'

                ELSE 'General Merchandise'
              END
            ) AS category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number
        )

        SELECT
          category,
          sum(ifNull(lot_bid_amount, 0)) AS bid_amount

        FROM settled_lots

        GROUP BY category
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const settledCategoryRows = await settledCategoryResult.json();

    // ---------------------------------------------------------
    // CURRENT BID VALUE BY BRANCH (live-corrected, current-standing) —
    // preserved under its own name, no longer exposed as "branches".
    //
    // Same latest-per-lot definition as CURRENT BID VALUE — grouped by
    // branch instead of collapsed to a single scalar. Uses the identical
    // lot_latest_bid CTE (same joins, same filters) as totalResult, so
    // sum(current_bid_value_branches.bid_amount) is structurally
    // guaranteed to equal current_bid_value's raw baseline.
    // ---------------------------------------------------------
    const branchResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        ),

        lot_latest_bid AS (
          SELECT
            b.auction_number AS auction_number,
            b.lot_number AS lot_number,
            any(s.store_name) AS store_name,
            argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount

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

          GROUP BY
            b.auction_number,
            b.lot_number
        )

        SELECT
          store_name AS branch,
          sum(latest_bid_amount) AS bid_amount

        FROM lot_latest_bid

        GROUP BY store_name
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const branchRows = await branchResult.json();

    // ---------------------------------------------------------
    // CURRENT BID VALUE BY CATEGORY (live-corrected, current-standing) —
    // preserved under its own name, no longer exposed as "categories".
    //
    // Same latest-per-lot definition as CURRENT BID VALUE. lot_category is
    // joined with LEFT JOIN + coalesce to 'Uncategorized' (not INNER JOIN)
    // so a lot with bid history but no matching vendor_analysis row still
    // contributes its bid somewhere, rather than being silently dropped —
    // required so sum(current_bid_value_categories.bid_amount) is
    // guaranteed to equal current_bid_value's raw baseline exactly, the
    // same way branch does.
    // ---------------------------------------------------------
    const categoryResult = await client.query({
      query: `
        WITH auction_store AS (
          SELECT DISTINCT
            auction_number,
            store_name
          FROM xv3.mart_auction_productivity_report
          WHERE auction_number IS NOT NULL
        ),

        lot_category AS (
          SELECT
            auction_number,
            lot_number,

            any(
              CASE
                WHEN name ILIKE '%bulk%'
                  OR name ILIKE '%pallet%'
                  THEN 'Bulk Auction'

                WHEN name ILIKE '%vehicle%'
                  OR name ILIKE '%motorcycle%'
                  OR name ILIKE '%car%'
                  OR name ILIKE '%truck%'
                  OR name ILIKE '%van%'
                  OR name ILIKE '%electric vehicle%'
                  THEN 'Vehicles and Automotive'

                WHEN name ILIKE '%equipment%'
                  OR name ILIKE '%industrial%'
                  OR name ILIKE '%generator%'
                  OR name ILIKE '%backhoe%'
                  OR name ILIKE '%excavator%'
                  OR name ILIKE '%construction%'
                  THEN 'Equipment and Industrial'

                ELSE 'General Merchandise'
              END
            ) AS auction_tags

          FROM xv3.mart_auction_vendor_analysis

          WHERE auction_number IS NOT NULL
            AND lot_number IS NOT NULL

          GROUP BY
            auction_number,
            lot_number
        ),

        lot_latest_bid AS (
          SELECT
            b.auction_number AS auction_number,
            b.lot_number AS lot_number,
            argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount

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

          GROUP BY
            b.auction_number,
            b.lot_number
        )

        SELECT
          coalesce(lc.auction_tags, 'Uncategorized') AS category,
          sum(l.latest_bid_amount) AS bid_amount

        FROM lot_latest_bid l

        LEFT JOIN lot_category lc
          ON l.auction_number = lc.auction_number
         AND l.lot_number = lc.lot_number

        GROUP BY category
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const categoryRows = await categoryResult.json();

    // ---------------------------------------------------------
    // ACTIVE AUCTIONS RIGHT NOW
    // ---------------------------------------------------------
    const activeAuctionResult = await client.query({
      query: `
        SELECT
          countDistinct(auction_number) AS active_auctions

        FROM xv3.mart_auction_productivity_report

        WHERE starting_time <= now()
          AND ending_time >= now()

          AND (
            {store:String} = ''
            OR store_name = {store:String}
          )
      `,
      query_params: { store },
      format: "JSONEachRow",
    });

    const activeAuctionRows = await activeAuctionResult.json();
    const activeAuction = activeAuctionRows[0] ?? {};

    // ---------------------------------------------------------
    // LOT STATUS KPIs
    //
    // Listed = every deduped lot in date-scoped auctions, regardless of
    // status. Sold = Outstanding/Paid/Unpaid/Released (unchanged — see
    // investigation). Unsold = strict status='Unsold'. Value = reserved
    // price. Asia/Manila-aware date scoping + deterministic status
    // resolution — see STATUS_PRIORITY_SQL's comment above for why
    // any(status) was replaced.
    //
    // unsold_with_reserve_count/value: same Unsold population, filtered
    // to reserved_price > 0 — the "With Reserve Price" KPI.
    // ---------------------------------------------------------
    const lotStatusResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number

          FROM xv3.mart_auction_productivity_report

          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)

            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
        ),

        lots AS (
          SELECT
            v.auction_number,
            v.lot_number,
            argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
            max(ifNull(v.reserved_price, 0)) AS reserved_price

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number
        )

        SELECT
          count() AS listed_lots,

          countIf(
            status IN (
              'Outstanding',
              'Paid',
              'Unpaid',
              'Released'
            )
          ) AS sold_lots,

          countIf(
            status = 'Unsold'
          ) AS unsold_lots,

          sumIf(
            reserved_price,
            status = 'Unsold'
          ) AS unsold_value,

          countIf(
            status = 'Unsold' AND reserved_price > 0
          ) AS unsold_with_reserve_count,

          sumIf(
            reserved_price,
            status = 'Unsold' AND reserved_price > 0
          ) AS unsold_with_reserve_value

        FROM lots
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const lotStatusRows = await lotStatusResult.json();
    const lotStatus = lotStatusRows[0] ?? {};

    const listedLots = Number(lotStatus.listed_lots ?? 0);
    const soldLots = Number(lotStatus.sold_lots ?? 0);
    const unsoldLots = Number(lotStatus.unsold_lots ?? 0);
    const unsoldWithReserveCount = Number(lotStatus.unsold_with_reserve_count ?? 0);
    const unsoldWithReserveValue = Number(lotStatus.unsold_with_reserve_value ?? 0);

    const sellThroughRate =
      listedLots > 0 ? Number(((soldLots / listedLots) * 100).toFixed(1)) : 0;

    // ---------------------------------------------------------
    // LIVE BID CORRECTION (cms.hmr.ph) — temporary diagnostic
    //
    // ClickHouse's bid_history mart can lag cms.hmr.ph by hours. For
    // auctions that are CURRENTLY ACTIVE, replace (not add to) that
    // auction's ClickHouse "latest bid per lot" contribution with the live
    // cms.hmr.ph current_bid figure, so a stale in-progress auction can't
    // distort the totals below. Auctions that have already ended are
    // untouched.
    //
    // Both sides now measure the SAME concept — each lot's current/standing
    // bid (ClickHouse: argMax(bid_amount, bid_created_at) per lot; live:
    // cms.hmr.ph's current_bid per lot) — validated against real data for
    // auction 134SUC (see conversation record). This replaces the earlier
    // sum(bid_amount)-based comparison, which mixed cumulative bid-event
    // activity with a current-standing snapshot.
    //
    // DATE-RANGE SEMANTICS: total_bid_amount reflects the SELECTED date
    // range and may represent a past, closed period — a live "right now"
    // snapshot must never rewrite history. So the live correction is only
    // ever applied to total_bid_amount when the selected [from, to] range
    // includes today's Asia/Manila date. todays_bid_amount is, by
    // definition, always about today regardless of the range picker, so it
    // is always eligible for correction.
    //
    // Defensive: any failure here (per-auction or query-level) falls back
    // to the raw ClickHouse totals so a live-source problem never breaks
    // the overview endpoint. An auction whose live lookup fails keeps its
    // ClickHouse latest-per-lot value untouched — its contribution is never
    // subtracted without a successful replacement.
    // ---------------------------------------------------------
    let correctedTotalBidAmount = Number(total.total_bid_amount ?? 0);
    let correctedTodaysBidAmount = Number(todayBid.todays_bid_amount ?? 0);
    let liveBidCorrectionDelta = 0;
    let liveCorrectedAuctions = [];

    // Branch/category corrections piggyback on the same per-auction
    // rangeDelta/liveAmount computed below — branch because one auction
    // maps to exactly one store, category because a lot's classification
    // never depends on which system (ClickHouse or cms.hmr.ph) reported
    // its bid. Both are keyed maps of name -> delta, applied to the raw
    // branchRows/categoryRows after the loop.
    let branchCorrectionDeltas = new Map();
    let categoryCorrectionDeltas = new Map();
    let unmappedLiveLots = [];

    const rangeIncludesToday = from <= todayManila && todayManila <= to;

    try {
      const activeAuctionListResult = await client.query({
        query: `
          SELECT DISTINCT auction_number, store_name
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time <= now()
            AND ending_time >= now()
            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
        `,
        query_params: { store },
        format: "JSONEachRow",
      });

      const activeAuctionRowsList = await activeAuctionListResult.json();
      const activeAuctionNumbers = activeAuctionRowsList.map((row) => row.auction_number);
      const activeAuctionBranchMap = Object.fromEntries(
        activeAuctionRowsList.map((row) => [row.auction_number, row.store_name]),
      );

      if (activeAuctionNumbers.length > 0) {
        const [chRangeResult, chTodayResult] = await Promise.all([
          client.query({
            query: `
              WITH auction_store AS (
                SELECT DISTINCT auction_number, store_name
                FROM xv3.mart_auction_productivity_report
                WHERE auction_number IS NOT NULL
              ),
              lot_latest_bid AS (
                SELECT
                  b.auction_number AS auction_number,
                  b.lot_number AS lot_number,
                  argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount
                FROM cms.mart_cms_bid_history_report b
                INNER JOIN auction_store s ON b.auction_number = s.auction_number
                WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
                  AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
                  AND ({store:String} = '' OR s.store_name = {store:String})
                  AND b.auction_number IN {activeAuctionNumbers:Array(String)}
                GROUP BY b.auction_number, b.lot_number
              )
              SELECT
                auction_number,
                sum(latest_bid_amount) AS ch_amount
              FROM lot_latest_bid
              GROUP BY auction_number
            `,
            query_params: { from, to, store, activeAuctionNumbers },
            format: "JSONEachRow",
          }),
          client.query({
            query: `
              WITH auction_store AS (
                SELECT DISTINCT auction_number, store_name
                FROM xv3.mart_auction_productivity_report
                WHERE auction_number IS NOT NULL
              ),
              lot_latest_bid AS (
                SELECT
                  b.auction_number AS auction_number,
                  b.lot_number AS lot_number,
                  argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount
                FROM cms.mart_cms_bid_history_report b
                INNER JOIN auction_store s ON b.auction_number = s.auction_number
                WHERE b.bid_created_at >= toStartOfDay(now('Asia/Manila'))
                  AND b.bid_created_at < addDays(toStartOfDay(now('Asia/Manila')), 1)
                  AND ({store:String} = '' OR s.store_name = {store:String})
                  AND b.auction_number IN {activeAuctionNumbers:Array(String)}
                GROUP BY b.auction_number, b.lot_number
              )
              SELECT
                auction_number,
                sum(latest_bid_amount) AS ch_amount
              FROM lot_latest_bid
              GROUP BY auction_number
            `,
            query_params: { store, activeAuctionNumbers },
            format: "JSONEachRow",
          }),
        ]);

        const chRangeMap = Object.fromEntries(
          (await chRangeResult.json()).map((r) => [r.auction_number, Number(r.ch_amount ?? 0)]),
        );
        const chTodayMap = Object.fromEntries(
          (await chTodayResult.json()).map((r) => [r.auction_number, Number(r.ch_amount ?? 0)]),
        );

        // Per-lot data needed for CATEGORY correction only — branch needs
        // no extra query since it reuses chRangeAmount/liveAmount below
        // (one auction = one store). Category needs per-lot granularity
        // because one auction can span multiple categories.
        const [lotCategoryResult, activeLotLatestBidResult] = await Promise.all([
          client.query({
            query: `
              SELECT
                auction_number,
                lot_number,

                any(
                  CASE
                    WHEN name ILIKE '%bulk%'
                      OR name ILIKE '%pallet%'
                      THEN 'Bulk Auction'

                    WHEN name ILIKE '%vehicle%'
                      OR name ILIKE '%motorcycle%'
                      OR name ILIKE '%car%'
                      OR name ILIKE '%truck%'
                      OR name ILIKE '%van%'
                      OR name ILIKE '%electric vehicle%'
                      THEN 'Vehicles and Automotive'

                    WHEN name ILIKE '%equipment%'
                      OR name ILIKE '%industrial%'
                      OR name ILIKE '%generator%'
                      OR name ILIKE '%backhoe%'
                      OR name ILIKE '%excavator%'
                      OR name ILIKE '%construction%'
                      THEN 'Equipment and Industrial'

                    ELSE 'General Merchandise'
                  END
                ) AS category

              FROM xv3.mart_auction_vendor_analysis

              WHERE auction_number IN {activeAuctionNumbers:Array(String)}
                AND lot_number IS NOT NULL

              GROUP BY auction_number, lot_number
            `,
            query_params: { activeAuctionNumbers },
            format: "JSONEachRow",
          }),
          client.query({
            query: `
              WITH auction_store AS (
                SELECT DISTINCT auction_number, store_name
                FROM xv3.mart_auction_productivity_report
                WHERE auction_number IS NOT NULL
              )
              SELECT
                b.auction_number AS auction_number,
                b.lot_number AS lot_number,
                argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount
              FROM cms.mart_cms_bid_history_report b
              INNER JOIN auction_store s ON b.auction_number = s.auction_number
              WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
                AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
                AND ({store:String} = '' OR s.store_name = {store:String})
                AND b.auction_number IN {activeAuctionNumbers:Array(String)}
              GROUP BY b.auction_number, b.lot_number
            `,
            query_params: { from, to, store, activeAuctionNumbers },
            format: "JSONEachRow",
          }),
        ]);

        const lotCategoryMap = new Map(
          (await lotCategoryResult.json()).map((r) => [`${r.auction_number}::${r.lot_number}`, r.category]),
        );

        const chLotsByAuction = new Map();
        for (const row of await activeLotLatestBidResult.json()) {
          if (!chLotsByAuction.has(row.auction_number)) chLotsByAuction.set(row.auction_number, []);
          chLotsByAuction.get(row.auction_number).push({
            lot_number: row.lot_number,
            latest_bid_amount: Number(row.latest_bid_amount ?? 0),
          });
        }

        const liveResults = await Promise.all(
          activeAuctionNumbers.map((auctionNumber) => getLiveLotsSafe(auctionNumber)),
        );

        activeAuctionNumbers.forEach((auctionNumber, i) => {
          const live = liveResults[i];
          const chRangeAmount = chRangeMap[auctionNumber] ?? 0;
          const chTodayAmount = chTodayMap[auctionNumber] ?? 0;

          if (!live) {
            console.error(
              `Live bid correction: cms.hmr.ph lookup failed for auction_number ${auctionNumber}, keeping ClickHouse latest-per-lot value`,
            );
            liveCorrectedAuctions.push({
              auction_number: auctionNumber,
              clickhouse_latest_bid_total: chRangeAmount,
              live_current_bid_total: null,
              correction_delta: 0,
              status: "live_lookup_failed",
            });
            return;
          }

          // Sum current_bid once per unique lot_number — null/undefined
          // and any malformed, non-numeric value (empty string, "N/A",
          // etc.) all resolve to 0 via toFiniteNumber, never NaN.
          const uniqueLots = new Map();
          for (const lot of live.lots) uniqueLots.set(lot.lot_number, lot.current_bid);
          const liveAmount = [...uniqueLots.values()].reduce(
            (sum, currentBid) => sum + toFiniteNumber(currentBid),
            0,
          );

          const rangeDelta = liveAmount - chRangeAmount;
          const todayDelta = liveAmount - chTodayAmount;

          // Defense in depth: even though liveAmount can no longer be NaN
          // by construction, verify all three values are finite before
          // ever applying them — a single bad auction must never poison
          // the running totals for every auction processed after it.
          if (
            !Number.isFinite(liveAmount) ||
            !Number.isFinite(rangeDelta) ||
            !Number.isFinite(todayDelta)
          ) {
            console.error(
              `Live bid correction: non-finite live bid data for auction_number ${auctionNumber}, keeping ClickHouse latest-per-lot value`,
            );
            liveCorrectedAuctions.push({
              auction_number: auctionNumber,
              clickhouse_latest_bid_total: chRangeAmount,
              live_current_bid_total: null,
              correction_delta: 0,
              status: "invalid_live_bid_data",
            });
            return;
          }

          // total_bid_amount only reflects "now" when the selected range
          // actually includes today — otherwise a historical period is
          // left untouched by the live snapshot. Branch/category follow
          // the exact same gate, for the exact same reason.
          if (rangeIncludesToday) {
            correctedTotalBidAmount += rangeDelta;
            liveBidCorrectionDelta += rangeDelta;

            // BRANCH: one auction maps to exactly one store, so its full
            // ClickHouse contribution (chRangeAmount) and full live
            // contribution (liveAmount) both move as a single unit —
            // reuses the values already computed above, no extra query.
            const branch = activeAuctionBranchMap[auctionNumber];
            if (branch) {
              branchCorrectionDeltas.set(
                branch,
                (branchCorrectionDeltas.get(branch) ?? 0) + rangeDelta,
              );
            }

            // CATEGORY: different lots in the same auction can belong to
            // different categories, so this must happen per lot. Remove
            // every one of this auction's stale ClickHouse per-lot
            // contributions from their categories, then add every live
            // per-lot contribution to its category — using the SAME
            // lot -> category mapping on both sides, so a given lot's
            // stale and live amounts always land in the same bucket.
            for (const chLot of chLotsByAuction.get(auctionNumber) ?? []) {
              const category =
                lotCategoryMap.get(`${auctionNumber}::${chLot.lot_number}`) ?? "Uncategorized";
              categoryCorrectionDeltas.set(
                category,
                (categoryCorrectionDeltas.get(category) ?? 0) - chLot.latest_bid_amount,
              );
            }

            for (const [lotNumber, currentBid] of uniqueLots) {
              const mappedCategory = lotCategoryMap.get(`${auctionNumber}::${lotNumber}`);
              const category = mappedCategory ?? "Uncategorized";
              if (!mappedCategory) {
                unmappedLiveLots.push({
                  auction_number: auctionNumber,
                  lot_number: lotNumber,
                  current_bid: toFiniteNumber(currentBid),
                  fallback_category: "Uncategorized",
                });
              }
              categoryCorrectionDeltas.set(
                category,
                (categoryCorrectionDeltas.get(category) ?? 0) + toFiniteNumber(currentBid),
              );
            }
          }
          // todays_bid_amount is always "today" by definition, so it is
          // always eligible for correction. (Branch/category breakdowns
          // are range-scoped, like total_bid_amount, so they have no
          // separate "today" variant to correct.)
          correctedTodaysBidAmount += todayDelta;

          liveCorrectedAuctions.push({
            auction_number: auctionNumber,
            clickhouse_latest_bid_total: chRangeAmount,
            live_current_bid_total: liveAmount,
            correction_delta: rangeIncludesToday ? rangeDelta : 0,
            status: rangeIncludesToday ? "ok" : "skipped_range_excludes_today",
          });
        });
      }
    } catch (correctionErr) {
      console.error(
        "Live bid correction failed, falling back to raw ClickHouse totals:",
        correctionErr,
      );
      correctedTotalBidAmount = Number(total.total_bid_amount ?? 0);
      correctedTodaysBidAmount = Number(todayBid.todays_bid_amount ?? 0);
      liveBidCorrectionDelta = 0;
      liveCorrectedAuctions = [];
      branchCorrectionDeltas = new Map();
      categoryCorrectionDeltas = new Map();
      unmappedLiveLots = [];
    }

    // Apply the accumulated branch/category deltas on top of the raw
    // ClickHouse rows. Any branch/category that only exists because of a
    // live correction (e.g. a brand-new active auction with zero
    // ClickHouse rows yet) is added here even though it had no raw row.
    const branchTotals = new Map(
      branchRows.map((row) => [row.branch, Number(row.bid_amount ?? 0)]),
    );
    for (const [branch, delta] of branchCorrectionDeltas) {
      branchTotals.set(branch, (branchTotals.get(branch) ?? 0) + delta);
    }
    const correctedBranches = [...branchTotals.entries()]
      .map(([branch, bid_amount]) => ({ branch, bid_amount }))
      .sort((a, b) => b.bid_amount - a.bid_amount);

    const categoryTotals = new Map(
      categoryRows.map((row) => [row.category, Number(row.bid_amount ?? 0)]),
    );
    for (const [category, delta] of categoryCorrectionDeltas) {
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + delta);
    }
    const correctedCategories = [...categoryTotals.entries()]
      .map(([category, bid_amount]) => ({ category, bid_amount }))
      .sort((a, b) => b.bid_amount - a.bid_amount);

    // =========================================================
    // SUMMARY RESPONSE
    // =========================================================
    return res.status(200).json({
      // Business definition of Total Bid Amount: settled (Paid/Released)
      // bid_amount only. See the SETTLED query comments above.
      total_bid_amount: settledTotalBidAmount,

      todays_bid_amount: settledTodayBidAmount,

      // The previous "Total Bid Amount" definition — current/standing bid
      // value across active + recently-bid lots, live-corrected against
      // cms.hmr.ph — is preserved here, not deleted, under its own name.
      current_bid_value: correctedTotalBidAmount,
      current_bid_value_today: correctedTodaysBidAmount,

      active_auctions: Number(activeAuction.active_auctions ?? 0),

      listed_lots: listedLots,
      sold_lots: soldLots,
      unsold_lots: unsoldLots,
      sell_through_rate: sellThroughRate,
      unsold_value: Number(lotStatus.unsold_value ?? 0),

      // With Reserve Price: unsold lots with reserved_price > 0. Same
      // dedup/date/store rules as unsold_lots above.
      unsold_with_reserve_count: unsoldWithReserveCount,
      unsold_with_reserve_value: unsoldWithReserveValue,

      // Bid Value by Branch/Category: now the settled (Paid/Released)
      // definition — see the SETTLED BRANCH/CATEGORY query comments
      // above. sum(branches.bid_amount) and sum(categories.bid_amount)
      // both reconcile exactly to total_bid_amount above.
      branches: settledBranchRows.map((row) => ({
        branch: row.branch,
        bid_amount: Number(row.bid_amount ?? 0),
      })),

      categories: settledCategoryRows.map((row) => ({
        category: row.category,
        bid_amount: Number(row.bid_amount ?? 0),
      })),

      // Current Bid Value's own branch/category breakdown — preserved,
      // not deleted, under its own name. sum() of each reconciles to
      // current_bid_value, NOT to the settled total_bid_amount above.
      current_bid_value_branches: correctedBranches,
      current_bid_value_categories: correctedCategories,

      // Temporary diagnostic fields for validating the live bid
      // correction on current_bid_value — not for permanent frontend
      // consumption yet.
      live_bid_correction_delta: liveBidCorrectionDelta,
      live_corrected_auctions: liveCorrectedAuctions,
      unmapped_live_lots: unmappedLiveLots,
    });
  } catch (err) {
    console.error("Overview API error:", err);

    return res.status(500).json({
      error: "Failed to load overview",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
