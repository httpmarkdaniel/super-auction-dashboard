import { createClient } from "@clickhouse/client";
import { getLiveLotsSafe } from "./_liveBids.js";
import { CATEGORY_CLASSIFICATION_SQL } from "./_category.js";
import { BIDDER_IDENTITY_CTES } from "./_bidderIdentity.js";

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

// Every "YYYY-MM-DD" calendar day from fromStr through toStr inclusive.
// Pure UTC calendar-part arithmetic (not local Date math), so this is
// correct regardless of the server process's own timezone and never
// double-counts/skips a day across a DST-less UTC day boundary.
function enumerateCalendarDays(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  const days = [];
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86400000) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
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

// for_approval_status (xv3.mart_auction_vendor_analysis) is a real warehouse
// field, not a frontend derivation — verified against real data: 1,409,706
// rows 'Approved', 20,864 'For Approval', 70,572 genuinely NULL (no blank
// values found). Deduped the same way as status: item_barcode fan-out rows
// within a lot agree 99.7%+ of the time (150/55,918 multi-row lots
// disagree); for that rare remainder, argMax picks the more-advanced state
// of the approval workflow ('Approved' over 'For Approval') by the same
// "most-advanced-state-wins" logic as STATUS_PRIORITY_SQL, rather than an
// arbitrary any(). A genuinely NULL warehouse value is preserved as NULL
// (displayed as "—"), never fabricated.
const APPROVAL_PRIORITY_SQL = `
  CASE for_approval_status
    WHEN 'Approved' THEN 2
    WHEN 'For Approval' THEN 1
    ELSE 0
  END
`;


// Overview is now ClickHouse/warehouse-only by design — it must never call
// cms.hmr.ph. The LIVE BID CORRECTION block below is kept in place (not
// deleted) because its cms.hmr.ph plumbing (getLiveLotsSafe et al.) is
// reserved for the Online Bidding feature, but it must not execute from
// this endpoint. Do not flip this to true without moving Overview off
// warehouse-only first.
const OVERVIEW_LIVE_CORRECTION_ENABLED = false;

export default async function handler(req, res) {
  try {
    const { from, to, store = "", category = "", type = "summary", compareFrom = "", compareTo = "" } = req.query;

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

    // category is OPTIONAL and additive-only: every existing query below
    // that doesn't reference {category:String} in its SQL text simply
    // ignores this param (ClickHouse tolerates unreferenced named
    // parameters), so passing it through the shared queryParams object
    // cannot change any existing Overview behavior when category is ''.
    const queryParams = { from, to, store, category };

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
              argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
              max(ifNull(v.reserved_price, 0)) AS reserved_price,
              max(ifNull(v.sold_price, 0)) AS sold_price,
              any(v.bid_amount) AS bid_amount,
              any(a.store_name) AS store_name,
              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY
              v.auction_number,
              v.lot_number

            -- Filtered post-aggregation on the SAME per-lot canonical
            -- category computed above (any() of a single dedup'd name),
            -- never on raw pre-GROUP BY rows — a lot with multiple
            -- underlying vendor_analysis rows could otherwise match a
            -- category filter on a row whose name differs from the lot's
            -- own canonical any(name), silently disagreeing with
            -- settledCategoryResult's identical any()-based classification.
            HAVING (
              {category:String} = ''
              OR category = {category:String}
            )
          )

          SELECT
            auction_number,
            lot_number,
            name,
            vendor,
            status,
            for_approval_status,
            reserved_price,
            sold_price,
            bid_amount,
            store_name,
            category,

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
        category: row.category,
        // status: the REAL resolved warehouse lifecycle status (Paid,
        // Released, Outstanding, Unpaid, Unsold, Refunded, Returned) — NOT
        // the Sold/Unsold disposition. disposition is kept separately below
        // for tab-bucket membership only (Lots Sold/Listed's Sold/Unsold
        // split), never as a displayed "status".
        status: row.status,
        for_approval_status: row.for_approval_status ?? null,
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
              argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
              max(ifNull(v.reserved_price, 0)) AS reserved_price,
              max(ifNull(v.sold_price, 0)) AS sold_price,
              any(a.store_name) AS store_name,
              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY
              v.auction_number,
              v.lot_number

            -- Post-aggregation filter on the per-lot canonical
            -- lot_category — see type=lots' identical comment.
            HAVING (
              {category:String} = ''
              OR lot_category = {category:String}
            )
          )

          SELECT
            auction_number,
            lot_number,
            name,
            vendor,
            status,
            for_approval_status,
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
        for_approval_status: row.for_approval_status ?? null,
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
              argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
              argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
              any(v.bid_amount) AS bid_amount,

              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.status IN ('Paid', 'Released')
              AND v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY v.auction_number, v.lot_number

            -- Post-aggregation filter on the per-lot canonical category —
            -- see type=lots' identical comment.
            HAVING (
              {category:String} = ''
              OR category = {category:String}
            )
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
            sl.for_approval_status AS for_approval_status,
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
          for_approval_status: row.for_approval_status ?? null,
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
    // SERVICE INCOME DRILL-DOWN
    //
    // The exact lot-level population behind the Service Income KPI: the
    // SAME settled_lots CTE as the Total Bid Amount / settled-lots
    // drilldown above (status IN ('Paid','Released'), deduped by
    // auction_number + lot_number, same date/store scoping), with
    // buyers_premium_income (sold_price - bid_amount) and commission_income
    // (bid_amount * commission / 100) computed per row. Structurally
    // guaranteed: sum(rows.total_service_income) == service_income_total,
    // sum(rows.buyers_premium_income) == service_income_buyers_premium,
    // sum(rows.commission_income) == service_income_commission.
    // =========================================================
    if (type === "service-income") {
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
              argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
              argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
              any(v.bid_amount) AS bid_amount,
              any(v.sold_price) AS sold_price,
              any(v.buyers_premium) AS buyers_premium_pct,
              any(v.commission) AS commission_pct,

              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.status IN ('Paid', 'Released')
              AND v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY v.auction_number, v.lot_number

            -- Post-aggregation filter on the per-lot canonical category —
            -- see type=lots' identical comment.
            HAVING (
              {category:String} = ''
              OR category = {category:String}
            )
          )

          SELECT
            auction_number,
            lot_number,
            vendor,
            status,
            for_approval_status,
            store_name,
            category,
            ifNull(bid_amount, 0) AS bid_amount,
            ifNull(buyers_premium_pct, 0) AS buyers_premium_pct,
            ifNull(commission_pct, 0) AS commission_pct,
            ifNull(sold_price, 0) - ifNull(bid_amount, 0) AS buyers_premium_income,
            ifNull(bid_amount, 0) * ifNull(commission_pct, 0) / 100 AS commission_income

          FROM settled_lots

          ORDER BY auction_number, lot_number
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      });

      const rows = await result.json();

      const mappedRows = rows.map((row) => {
        const buyersPremiumIncome = Number(row.buyers_premium_income ?? 0);
        const commissionIncome = Number(row.commission_income ?? 0);
        return {
          auction_number: row.auction_number,
          lot_number: row.lot_number,
          store_name: row.store_name,
          category: row.category,
          vendor: row.vendor,
          status: row.status,
          for_approval_status: row.for_approval_status ?? null,
          bid_amount: Number(row.bid_amount ?? 0),
          buyers_premium_pct: Number(row.buyers_premium_pct ?? 0),
          buyers_premium_income: buyersPremiumIncome,
          commission_pct: Number(row.commission_pct ?? 0),
          commission_income: commissionIncome,
          total_service_income: buyersPremiumIncome + commissionIncome,
        };
      });

      const summaryBuyersPremium = mappedRows.reduce((sum, row) => sum + row.buyers_premium_income, 0);
      const summaryCommission = mappedRows.reduce((sum, row) => sum + row.commission_income, 0);

      return res.status(200).json({
        type: "service-income",

        summary: {
          count: mappedRows.length,
          service_income_buyers_premium: summaryBuyersPremium,
          service_income_commission: summaryCommission,
          service_income_total: summaryBuyersPremium + summaryCommission,
        },

        rows: mappedRows,
      });
    }

    // =========================================================
    // FOR APPROVAL DRILL-DOWN
    //
    // Population: lots whose deterministically-resolved for_approval_status
    // (argMax with APPROVAL_PRIORITY_SQL, same dedup already validated
    // elsewhere) is exactly 'For Approval' — completely independent of
    // lifecycle status. NOT restricted to any status: Unsold, Outstanding,
    // Unpaid, Paid, Released, Returned, and Refunded lots can all
    // legitimately appear here, since approval and status are separate
    // dimensions. Same auction_number+lot_number dedup and status
    // resolution as the "lots" drilldown above — just filtered down.
    //
    // Bid Amount is the KPI's monetary value; Reserve Price is exposed as
    // a separate informational column only, never blended into Bid Amount.
    // A lot with bid_amount = 0 (e.g. still Unsold) is a valid, correct
    // ₱0 contribution — never backfilled from reserved_price.
    // =========================================================
    if (type === "for-approval") {
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
              argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
              any(v.bid_amount) AS bid_amount,
              max(ifNull(v.reserved_price, 0)) AS reserved_price,
              any(a.store_name) AS store_name,
              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

            FROM xv3.mart_auction_vendor_analysis v

            INNER JOIN selected_auctions a
              ON v.auction_number = a.auction_number

            WHERE v.auction_number IS NOT NULL
              AND v.lot_number IS NOT NULL

            GROUP BY
              v.auction_number,
              v.lot_number

            -- Post-aggregation filter on the per-lot canonical
            -- lot_category — see type=lots' identical comment.
            HAVING (
              {category:String} = ''
              OR lot_category = {category:String}
            )
          )

          SELECT
            auction_number,
            lot_number,
            name,
            vendor,
            status,
            for_approval_status,
            ifNull(bid_amount, 0) AS bid_amount,
            reserved_price,
            store_name

          FROM lots

          WHERE for_approval_status = 'For Approval'

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
        for_approval_status: row.for_approval_status,
        bid_amount: Number(row.bid_amount ?? 0),
        reserved_price: Number(row.reserved_price ?? 0),
      }));

      const forApprovalBidAmount = mappedRows.reduce((sum, row) => sum + row.bid_amount, 0);

      return res.status(200).json({
        type: "for-approval",

        summary: {
          count: mappedRows.length,
          for_approval_bid_amount: forApprovalBidAmount,
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
    // Still respects the selected store, and now the selected category —
    // same additive-only convention as every other category-scoped query
    // in this file (a no-op when category is ''). cms.mart_cms_bid_history_report
    // has no category of its own, so it's joined to the same per-lot
    // canonical classification (xv3.mart_auction_vendor_analysis ->
    // CATEGORY_CLASSIFICATION_SQL(name)) every other category-scoped query
    // uses — never re-derived from bid_history's own `description` field.
    //
    // Same latest-per-lot definition as TOTAL BID AMOUNT above — see that
    // comment for why sum(bid_amount) across events is the wrong metric.
    // ---------------------------------------------------------
    const todayBidResultPromise = client.query({
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
        v.auction_number AS auction_number,
        v.lot_number AS lot_number,
        any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

      FROM xv3.mart_auction_vendor_analysis v

      WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL

      GROUP BY v.auction_number, v.lot_number
    ),

    lot_latest_bid AS (
      SELECT
        b.auction_number AS auction_number,
        b.lot_number AS lot_number,
        argMax(b.bid_amount, b.bid_created_at) AS latest_bid_amount,
        any(lc.lot_category) AS lot_category

      FROM cms.mart_cms_bid_history_report b

      INNER JOIN auction_store s
        ON b.auction_number = s.auction_number

      LEFT JOIN lot_category lc
        ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number

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

      HAVING (
        {category:String} = ''
        OR lot_category = {category:String}
      )
    )

    SELECT
      ifNull(sum(latest_bid_amount), 0) AS todays_bid_amount

    FROM lot_latest_bid
  `,

      query_params: {
        store,
        category,
      },

      format: "JSONEachRow",
    });

    // ---------------------------------------------------------
    // AUCTION-LEVEL SUMMARY (Overview KPI drilldowns) — moved up so that
    // TOTAL BID AMOUNT below can be derived from it in JS instead of running
    // its own duplicate scan (Phase 2B: verified byte-identical against the
    // prior standalone query across MTD/YTD, every canonical category, and
    // per-branch, using real production data — see commit notes).
    //
    // One row per auction contributing to this scope, covering every
    // Overview KPI that clicks through to an auction-first drilldown
    // (Total Bid Amount, Auctions Concluded, Avg Bid/Auction, Avg Bid/Sold
    // Lot, Lots Sold/Listed) from ONE query instead of one per KPI.
    //
    // lots_listed/lots_sold/lots_unsold reuse the exact same status
    // resolution and "Sold" population (Outstanding/Paid/Unpaid/Released)
    // as the type=lots drilldown/summary lotStatusResult above.
    // settled_bid_amount/settled_lot_count are the SAME Paid/Released-only
    // population as TOTAL BID AMOUNT below, just grouped by auction instead
    // of collapsed to a scalar — so SUM(settled_bid_amount) here reconciles
    // exactly to Total Bid Amount, and COUNT of rows with settled_lot_count
    // > 0 reconciles to Auctions Concluded.
    //
    // Phase 2B: runs concurrently with todayBidResult and
    // settledServiceIncomeResult below (bounded 3-query batch — none of
    // these three read a JS value the others produce, only static
    // queryParams) instead of one-at-a-time, to cut wall-clock round trips.
    // ---------------------------------------------------------
    const auctionSummaryResultPromise = client.query({
      query: `
        WITH selected_auctions AS (
          SELECT
            auction_number,
            any(name) AS auction_name,
            any(store_name) AS auction_store_name,
            any(starting_time) AS auction_starting_time,
            any(sub_type) AS auction_sub_type
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
          GROUP BY auction_number
        ),

        -- Type (Online/Onsite/Negotiated) — same xv3.auctions.type source
        -- already established/reused verbatim by api/revenue-breakdown.js
        -- and api/auction-detail.js, not a new classifier.
        auction_type AS (
          SELECT auction_number, any(type) AS auction_type
          FROM xv3.auctions
          WHERE auction_number IS NOT NULL
          GROUP BY auction_number
        ),

        lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
            any(v.bid_amount) AS bid_amount,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number

          HAVING ({category:String} = '' OR lot_category = {category:String})
        )

        SELECT
          l.auction_number AS auction_number,
          any(a.auction_name) AS name,
          any(a.auction_store_name) AS store_name,
          any(a.auction_starting_time) AS starting_time,
          any(a.auction_sub_type) AS sub_type,
          any(at.auction_type) AS type,

          count() AS lots_listed,
          countIf(status IN ('Outstanding', 'Paid', 'Unpaid', 'Released')) AS lots_sold,
          countIf(status = 'Unsold') AS lots_unsold,

          sumIf(ifNull(bid_amount, 0), status IN ('Paid', 'Released')) AS settled_bid_amount,
          countIf(status IN ('Paid', 'Released')) AS settled_lot_count

        FROM lots l

        INNER JOIN selected_auctions a
          ON l.auction_number = a.auction_number

        LEFT JOIN auction_type at
          ON l.auction_number = at.auction_number

        GROUP BY l.auction_number
        ORDER BY settled_bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // ---------------------------------------------------------
    // SERVICE INCOME (SETTLED)
    //
    // Same population as Total Bid Amount below: status IN ('Paid',
    // 'Released'), deduped by auction_number + lot_number, same
    // starting_time/date-range/store scoping. Two components:
    //
    // - Buyer's Premium Income = sold_price - bid_amount. buyers_premium is
    //   a PERCENTAGE RATE, not a peso amount (proven: sold_price =
    //   bid_amount * (1 + buyers_premium/100) exactly, 0 mismatches across
    //   511 real settled rows) — so the peso figure is the difference, not
    //   sum(buyers_premium) directly.
    // - Commission Income = bid_amount * commission / 100. commission is
    //   also a percentage rate (varies by vendor/auction agreement — 0, 10,
    //   17, 18, 20, 25, 29, 30, 35 observed), a vendor-side commission rate,
    //   not a peso Service Fee — same reasoning as buyers_premium above.
    //
    // Both rate fields are consistent across a lot's item_barcode fan-out
    // rows (verified: 0 lots with >1 distinct value for either field across
    // 484 settled lots), so any() is a safe dedup here, same as bid_amount.
    //
    // Phase 2B: kept as its OWN independent query rather than folded into
    // auctionSummaryResult's per-lot CTE. Investigated a merge (computing
    // sold_price/commission there via a status-conditioned aggregate) and
    // found a real, if tiny, drift at YTD scope: ClickHouse's any()/max() are
    // non-deterministic when a lot's item_barcode rows already agree on
    // status but genuinely disagree on the commission rate itself (5 lots
    // out of 5,916 checked in production, e.g. one lot's 4 "Released" rows
    // recording commission as both 15 and 18) — a different query shape can
    // pick a different arbitrary row. Per this phase's abort-on-drift rule,
    // this query stays independent (runs concurrently with todayBidResult/
    // auctionSummaryResult below instead, which IS safe — parallelizing
    // doesn't change which row any() picks, only merging the SQL does).
    // ---------------------------------------------------------
    const settledServiceIncomeResultPromise = client.query({
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
            any(v.sold_price) AS lot_sold_price,
            any(v.commission) AS lot_commission_pct,
            max(ifNull(v.reserved_price, 0)) AS lot_reserved_price,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number

          -- Post-aggregation filter on the per-lot canonical lot_category —
          -- see type=lots' identical comment.
          HAVING (
            {category:String} = ''
            OR lot_category = {category:String}
          )
        )

        SELECT
          sum(ifNull(lot_sold_price, 0) - ifNull(lot_bid_amount, 0)) AS service_income_buyers_premium,
          sum(ifNull(lot_bid_amount, 0) * ifNull(lot_commission_pct, 0) / 100) AS service_income_commission,
          sum(ifNull(lot_bid_amount, 0)) AS settled_bid_amount_for_rates,

          -- Reserve Price Performance — CategoryView only, computed here to
          -- reuse the exact same settled_lots population rather than a
          -- separate query. A lot only has a meaningful reserve comparison
          -- when reserved_price > 0 (many settled lots never had a reserve
          -- set at all) — lots with reserved_price = 0 are excluded from
          -- this specific classification entirely, never treated as "at or
          -- below" a reserve that doesn't exist.
          countIf(lot_reserved_price > 0 AND lot_bid_amount <= lot_reserved_price) AS sold_at_or_below_reserve,
          countIf(lot_reserved_price > 0 AND lot_bid_amount > lot_reserved_price) AS sold_above_reserve,

          -- Average premium over reserve, for the sold-above-reserve subset
          -- only: SUM(excess) / SUM(reserve), a value-weighted ratio — NOT
          -- a naive average of each lot's own percentage, which would let a
          -- single tiny-reserve lot with a huge % skew the result. 0 when
          -- no lot in scope sold above its reserve (avoids a division by
          -- zero producing a meaningless percentage).
          sumIf(lot_bid_amount - lot_reserved_price, lot_reserved_price > 0 AND lot_bid_amount > lot_reserved_price) AS above_reserve_excess,
          sumIf(lot_reserved_price, lot_reserved_price > 0 AND lot_bid_amount > lot_reserved_price) AS above_reserve_base

        FROM settled_lots
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

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
    //
    // Phase 2B: investigated deriving this from auctionSummaryResult's
    // settled_bid_amount/settled_lot_count instead of running its own query
    // (both are nominally "the same settled population"), and initial tests
    // (MTD across every category, YTD across every branch) matched exactly.
    // A wider check surfaced a real, reproducible counter-example though:
    // auction 127SUC lot 5 has TWO item_barcode rows with genuinely
    // different descriptions and statuses (one Unsold item whose name
    // happens to contain "car", one Paid "Chair And Table Stand"). This
    // query's any(category) is computed only over the Paid/Released-
    // filtered rows (correctly resolving "Chair And Table Stand" ->
    // General Merchandise), whereas auctionSummaryResult's any(category) is
    // computed over ALL rows before the status filter is applied server-
    // side, so it can pick the Unsold row's name instead and misclassify
    // the lot as Vehicles and Automotive — a real, if rare, drift (confirmed
    // via direct ClickHouse diagnostic; not floating-point noise). Per this
    // phase's abort-on-drift rule, this stays its OWN independent query
    // (still runs concurrently with todayBidResult/auctionSummaryResult/
    // settledServiceIncomeResult below — parallelizing doesn't change which
    // rows any() sees, only merging the SQL does).
    // ---------------------------------------------------------
    const settledTotalResultPromise = client.query({
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
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number

          -- Post-aggregation filter on the per-lot canonical lot_category
          -- (any() of a single dedup'd name) — never on raw pre-GROUP BY
          -- rows, so this always agrees with settledCategoryResult's
          -- identical any()-based classification. See type=lots' comment.
          HAVING (
            {category:String} = ''
            OR lot_category = {category:String}
          )
        )

        SELECT
          sum(ifNull(lot_bid_amount, 0)) AS settled_total_bid_amount,
          countDistinct(auction_number) AS settled_auction_count,
          count() AS settled_lot_count

        FROM settled_lots
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // Bounded 4-query batch: none of these read a JS value another one of
    // them produces — only static queryParams/from/to/store/category — so
    // running them concurrently changes wall-clock time only, never results.
    const [todayBidResult, auctionSummaryResult, settledServiceIncomeResult, settledTotalResult] =
      await Promise.all([
        todayBidResultPromise,
        auctionSummaryResultPromise,
        settledServiceIncomeResultPromise,
        settledTotalResultPromise,
      ]);

    const todayBidRows = await todayBidResult.json();
    const todayBid = todayBidRows[0] ?? {};

    const todayManila = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());

    const auctionSummaryRows = await auctionSummaryResult.json();

    const settledTotalRows = await settledTotalResult.json();
    const settledTotalBidAmount = Number(settledTotalRows[0]?.settled_total_bid_amount ?? 0);
    // Denominator for Avg Bid / Sold Lot — count() over the EXACT same
    // settled_lots population as settled_total_bid_amount above, never the
    // broader lot_status "sold_lots" figure (Outstanding/Paid/Unpaid/
    // Released) computed later in this file, which is a different
    // population from a different query. Keeping the numerator and
    // denominator from the same CTE is what makes SUM(settled bid)/COUNT
    // (settled lots) a correct per-lot average rather than a mismatched
    // ratio between two different lot populations.
    const settledLotCount = Number(settledTotalRows[0]?.settled_lot_count ?? 0);
    // "Total Auctions" for CategoryView: no existing Overview definition
    // scopes "auction count" by date range + category (Active Auctions is
    // a "right now" concept, unrelated to either) — this is a natural
    // derived count from the SAME settled population as Total Bid Amount
    // above, not a fabricated new business metric, but it is a judgment
    // call rather than an already-validated definition. Flagged in the
    // implementation report.
    const settledAuctionCount = Number(settledTotalRows[0]?.settled_auction_count ?? 0);

    // NOTE: Today's Bid Amount no longer uses a settled (Paid/Released)
    // definition — see todayBidResult above (warehouse-only, latest bid
    // per lot from cms.mart_cms_bid_history_report for today's Asia/Manila
    // calendar day), wired into the response as todays_bid_amount below.
    // Total Bid Amount (settled, range-scoped) is unaffected by this.

    const settledServiceIncomeRows = await settledServiceIncomeResult.json();
    const serviceIncomeBuyersPremium = Number(settledServiceIncomeRows[0]?.service_income_buyers_premium ?? 0);
    const serviceIncomeCommission = Number(settledServiceIncomeRows[0]?.service_income_commission ?? 0);

    // Weighted-average rates for CategoryView's Commission & Fees section:
    // SUM(income component) / SUM(bid_amount) — a value-weighted blended
    // rate, deliberately NOT an AVG() of each lot's own buyers_premium/
    // commission percentage field. A naive per-lot average would weight a
    // ₱200 lot the same as a ₱200,000 lot, which misrepresents "what % of
    // this category's real money became premium/commission." 0 when there
    // is no settled bid amount in scope (avoids a division by zero).
    const settledBidAmountForRates = Number(settledServiceIncomeRows[0]?.settled_bid_amount_for_rates ?? 0);
    const avgBuyersPremiumPct =
      settledBidAmountForRates > 0 ? (serviceIncomeBuyersPremium / settledBidAmountForRates) * 100 : 0;
    const avgCommissionPct =
      settledBidAmountForRates > 0 ? (serviceIncomeCommission / settledBidAmountForRates) * 100 : 0;

    const soldAtOrBelowReserve = Number(settledServiceIncomeRows[0]?.sold_at_or_below_reserve ?? 0);
    const soldAboveReserve = Number(settledServiceIncomeRows[0]?.sold_above_reserve ?? 0);
    const aboveReserveExcess = Number(settledServiceIncomeRows[0]?.above_reserve_excess ?? 0);
    const aboveReserveBase = Number(settledServiceIncomeRows[0]?.above_reserve_base ?? 0);
    const avgPremiumOverReservePct = aboveReserveBase > 0 ? (aboveReserveExcess / aboveReserveBase) * 100 : 0;

    // ---------------------------------------------------------
    // BID TREND — always daily, one point per calendar day in range.
    //
    // WINNING side: same settled_lots population as Total Bid Amount,
    // bucketed by the auction's own starting_time day (same scoping
    // convention as every other settled query in this file). Identity
    // resolved through the SAME canonical bridge as Bidder Composition
    // (BIDDER_IDENTITY_CTES) — not a new classifier. Unresolved identity
    // is folded into the returning amount server-side, matching the
    // established Overview presentation rule (never a separate Unresolved
    // bucket), while returning/new COUNTS only ever include a resolved
    // identity — an unresolved lot's value is real and must still land
    // somewhere, but it never manufactures a returning bidder who doesn't
    // exist.
    // ---------------------------------------------------------
    const bidTrendResultPromise = client.query({
      query: `
        WITH selected_auctions AS (
          SELECT
            auction_number,
            any(starting_time) AS auction_starting_time
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
          GROUP BY auction_number
        ),

        settled_lots AS (
          SELECT
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            any(v.bid_amount) AS lot_bid_amount,
            any(v.or_number) AS or_number,
            any(v.date_time_paid) AS date_time_paid,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category,
            any(a.auction_starting_time) AS auction_starting_time

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
          toDate(sl.auction_starting_time) AS bucket,
          sum(ifNull(sl.lot_bid_amount, 0)) AS bid_amount,
          countDistinct(sl.auction_number) AS auctions_concluded,
          count() AS lots_sold,

          uniqExactIf(
            rli.resolved_email,
            fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS winning_new,
          uniqExactIf(
            rli.resolved_email,
            fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS winning_returning,
          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          ) AS winning_new_amount,
          sumIf(
            ifNull(sl.lot_bid_amount, 0),
            (fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila'))
            OR fe.first_ever_at IS NULL
          ) AS winning_returning_amount

        FROM settled_lots sl

        LEFT JOIN resolved_lot_identity rli
          ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number

        LEFT JOIN bidder_first_ever fe
          ON rli.resolved_email = fe.fe_key

        GROUP BY bucket
        ORDER BY bucket
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // ---------------------------------------------------------
    // BID TREND — PARTICIPATING side, bucketed by the bid EVENT's own day
    // (bid_created_at), not the auction's starting_time — Participating is
    // an activity signal (when did the bidding happen), unlike Winning's
    // settled/auction-anchored day. Same first-ever-bid classification and
    // source table as api/leaderboards.js's compositionResult, just
    // grouped by day instead of collapsed to one number.
    // ---------------------------------------------------------
    const bidTrendParticipatingResultPromise = client.query({
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

        daily_bidder_activity AS (
          SELECT
            toDate(b.bid_created_at, 'Asia/Manila') AS bucket,
            lowerUTF8(trim(b.email)) AS bidder_key,
            sum(b.bid_amount) AS bidder_day_amount,
            max(b.bid_created_at) AS bidder_day_last_bid

          FROM cms.mart_cms_bid_history_report b

          INNER JOIN auction_store s
            ON b.auction_number = s.auction_number

          LEFT JOIN lot_category lc
            ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number

          WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR s.store_name = {store:String})
            AND b.email IS NOT NULL AND trim(b.email) != ''
            AND ({category:String} = '' OR lc.lot_category = {category:String})

          GROUP BY bucket, bidder_key
        )

        SELECT
          d.bucket AS bucket,

          uniqExactIf(d.bidder_key, f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new,
          uniqExactIf(d.bidder_key, f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning,
          sumIf(d.bidder_day_amount, f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new_amount,
          sumIf(d.bidder_day_amount, f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning_amount

        FROM daily_bidder_activity d

        INNER JOIN bidder_first_bid f
          ON d.bidder_key = f.bidder_key

        GROUP BY bucket
        ORDER BY bucket
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    const [bidTrendResult, bidTrendParticipatingResult] = await Promise.all([
      bidTrendResultPromise,
      bidTrendParticipatingResultPromise,
    ]);
    const bidTrendWinningRows = await bidTrendResult.json();
    const bidTrendParticipatingRows = await bidTrendParticipatingResult.json();

    // Merge the two per-day result sets (different source tables/bucket
    // dimensions — see each query's own comment) by bucket date into one
    // row per day. A day with settled value but no participating rows (or
    // vice versa) still gets a row — never silently dropped.
    const bidTrendByBucket = new Map();
    function bidTrendBucket(key) {
      if (!bidTrendByBucket.has(key)) {
        bidTrendByBucket.set(key, {
          bucket: key,
          bid_amount: 0,
          auctions_concluded: 0,
          lots_sold: 0,
          winning_new: 0,
          winning_returning: 0,
          winning_new_amount: 0,
          winning_returning_amount: 0,
          participating_new: 0,
          participating_returning: 0,
          participating_new_amount: 0,
          participating_returning_amount: 0,
        });
      }
      return bidTrendByBucket.get(key);
    }
    for (const row of bidTrendWinningRows) {
      const b = bidTrendBucket(row.bucket);
      b.bid_amount = Number(row.bid_amount ?? 0);
      b.auctions_concluded = Number(row.auctions_concluded ?? 0);
      b.lots_sold = Number(row.lots_sold ?? 0);
      b.winning_new = Number(row.winning_new ?? 0);
      b.winning_returning = Number(row.winning_returning ?? 0);
      b.winning_new_amount = Number(row.winning_new_amount ?? 0);
      b.winning_returning_amount = Number(row.winning_returning_amount ?? 0);
    }
    for (const row of bidTrendParticipatingRows) {
      const b = bidTrendBucket(row.bucket);
      b.participating_new = Number(row.participating_new ?? 0);
      b.participating_returning = Number(row.participating_returning ?? 0);
      b.participating_new_amount = Number(row.participating_new_amount ?? 0);
      b.participating_returning_amount = Number(row.participating_returning_amount ?? 0);
    }

    // Zero-fill: the chart must contain every calendar day in the selected
    // range, not just the days ClickHouse happened to return a row for —
    // otherwise a real zero-activity day (e.g. Aug 21-22) gets silently
    // skipped and the line falsely connects Aug 20 straight to Aug 23,
    // hiding the drop to zero. bidTrendBucket() is idempotent (only
    // creates a zero-value entry if the key isn't already present), so
    // calling it for every day in [from, to] after the two result sets are
    // merged just fills the gaps without touching real data. Pure UTC
    // calendar-part arithmetic (not local Date math) so this is correct
    // regardless of the server process's own timezone.
    for (const day of enumerateCalendarDays(from, to)) {
      bidTrendBucket(day);
    }

    const bidTrendRows = [...bidTrendByBucket.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

    // ---------------------------------------------------------
    // REGISTRATION -> BIDDER CONVERSION
    //
    // Population: cms.mart_cms_bidder_registrations, the authoritative
    // per-(auction, customer) registration mart already used elsewhere in
    // this codebase for bidder identity (see api/_bidderIdentity.js). Its
    // own is_participating_bidder flag is the SAME authoritative signal
    // the table already carries — not a second classifier invented here.
    //
    // Cohort: customers registered for an auction whose starting_time
    // falls in the selected range (same selected_auctions scoping
    // convention as every other query in this file, for the same reason —
    // bidder_registered_at coverage wasn't independently verified here,
    // whereas starting_time via productivity_report is the established
    // ~100%-covering join key throughout this endpoint). Registered =
    // distinct customers with a registration row for one of those
    // auctions. Participating = the same cohort, filtered to
    // is_participating_bidder = 1. Both sides of the ratio are therefore
    // the same comparable cohort, not lifetime registrations vs. a
    // period's participants.
    //
    // Not category-scoped: this mart has no lot/category dimension (same
    // reasoning as ACTIVE AUCTIONS RIGHT NOW above, which is also
    // deliberately global for this reason).
    // ---------------------------------------------------------
    const registrationResultPromise = client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT auction_number
          FROM xv3.mart_auction_productivity_report
          WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
            AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
            AND ({store:String} = '' OR store_name = {store:String})
        )

        SELECT
          uniqExact(r.customer_id) AS registered,
          uniqExactIf(r.customer_id, r.is_participating_bidder = 1) AS participating

        FROM cms.mart_cms_bidder_registrations r

        INNER JOIN selected_auctions a
          ON r.auction_number = a.auction_number

        WHERE r.customer_id IS NOT NULL
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // ---------------------------------------------------------
    // FOR APPROVAL
    //
    // Count + Bid Amount for the same population as the "for-approval"
    // drilldown above — see that block's comment for the full population
    // definition (for_approval_status = 'For Approval', independent of
    // lifecycle status, no restriction to Paid/Released). This is a
    // scalar-aggregate version of the identical lots CTE, so
    // count(rows) == for_approval_lots and sum(rows.bid_amount) ==
    // for_approval_bid_amount are structurally guaranteed for the same
    // from/to/store.
    // ---------------------------------------------------------
    const forApprovalResultPromise = client.query({
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
            v.auction_number AS auction_number,
            v.lot_number AS lot_number,
            argMax(v.for_approval_status, ${APPROVAL_PRIORITY_SQL}) AS for_approval_status,
            any(v.bid_amount) AS bid_amount,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number

          -- Post-aggregation filter on the per-lot canonical lot_category —
          -- see type=lots' identical comment.
          HAVING (
            {category:String} = ''
            OR lot_category = {category:String}
          )
        )

        SELECT
          count() AS for_approval_lots,
          sum(ifNull(bid_amount, 0)) AS for_approval_bid_amount

        FROM lots

        WHERE for_approval_status = 'For Approval'
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // ---------------------------------------------------------
    // BID VALUE BY BRANCH (SETTLED)
    //
    // Same population/definition as TOTAL BID AMOUNT above — literally
    // the same settled_lots CTE (now including the same category
    // HAVING filter TOTAL BID AMOUNT uses), just grouped by store_name
    // instead of collapsed to a scalar. This structurally guarantees
    // sum(branches.bid_amount) == total_bid_amount, since both are sums
    // over the exact same rows, category filter included.
    // ---------------------------------------------------------
    const settledBranchResultPromise = client.query({
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
            any(v.bid_amount) AS lot_bid_amount,
            any(v.sold_price) AS lot_sold_price,
            any(v.commission) AS lot_commission_pct,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number

          HAVING (
            {category:String} = ''
            OR lot_category = {category:String}
          )
        )

        SELECT
          store_name AS branch,
          sum(ifNull(lot_bid_amount, 0)) AS bid_amount,
          countDistinct(auction_number) AS auction_count,
          count() AS lots_sold,
          sum(ifNull(lot_sold_price, 0) - ifNull(lot_bid_amount, 0)) AS buyers_premium_income,
          sum(ifNull(lot_bid_amount, 0) * ifNull(lot_commission_pct, 0) / 100) AS commission_income

        FROM settled_lots

        GROUP BY store_name
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

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
    const settledCategoryResultPromise = client.query({
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
            any(v.sold_price) AS lot_sold_price,
            any(v.commission) AS lot_commission_pct,

            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.status IN ('Paid', 'Released')
            AND v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number

          -- Respects the sidebar's global Category filter so that when a
          -- specific category is selected, this Category Breakdown
          -- collapses to just that one category (sum reconciles to the
          -- now-category-scoped Total Bid Amount) — same convention as
          -- settledBranchResult just above.
          HAVING (
            {category:String} = ''
            OR category = {category:String}
          )
        )

        SELECT
          category,
          sum(ifNull(lot_bid_amount, 0)) AS bid_amount,
          countDistinct(auction_number) AS auction_count,
          count() AS lots_sold,
          sum(ifNull(lot_sold_price, 0) - ifNull(lot_bid_amount, 0)) AS buyers_premium_income,
          sum(ifNull(lot_bid_amount, 0) * ifNull(lot_commission_pct, 0) / 100) AS commission_income

        FROM settled_lots

        GROUP BY category
        ORDER BY bid_amount DESC
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

    // Bounded 4-query batch: registration/for-approval/branch/category are
    // all independent scalar-or-grouped aggregates over static queryParams —
    // none depends on another's JS result, so running them concurrently
    // only changes wall-clock time.
    const [registrationResult, forApprovalResult, settledBranchResult, settledCategoryResult] =
      await Promise.all([
        registrationResultPromise,
        forApprovalResultPromise,
        settledBranchResultPromise,
        settledCategoryResultPromise,
      ]);

    const registrationRows = await registrationResult.json();
    const registeredCustomers = Number(registrationRows[0]?.registered ?? 0);
    const participatingRegisteredBidders = Number(registrationRows[0]?.participating ?? 0);

    const forApprovalRows = await forApprovalResult.json();
    const forApprovalLots = Number(forApprovalRows[0]?.for_approval_lots ?? 0);
    const forApprovalBidAmount = Number(forApprovalRows[0]?.for_approval_bid_amount ?? 0);

    const settledBranchRows = await settledBranchResult.json();
    const settledCategoryRows = await settledCategoryResult.json();

    // ---------------------------------------------------------
    // BRANCH / CATEGORY BIDDER COMPOSITION (for the Overview hover panel)
    //
    // Same two populations as the top-level Bidder Composition section,
    // just grouped by store_name/category instead of collapsed to one
    // number — so hovering ONE branch/category shows bidder counts/
    // amounts scoped to ONLY that entity, never the overall Overview
    // totals. WINNING reuses the exact same settled_lots + canonical
    // BIDDER_IDENTITY_CTES bridge as the Bid Trend query (identity never
    // redefined per-entity). PARTICIPATING reuses the exact same bid-
    // activity/bidder_first_bid definition as the Bid Trend Participating
    // query, just grouped by branch/category instead of day. All four
    // queries run once here (server-side, part of this same /api/overview
    // call) — hovering in the UI triggers zero additional requests.
    // ---------------------------------------------------------
    const [
      winningByBranchResult,
      winningByCategoryResult,
      participatingByBranchResult,
      participatingByCategoryResult,
    ] = await Promise.all([
      client.query({
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
            INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
            WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
            GROUP BY v.auction_number, v.lot_number
            HAVING ({category:String} = '' OR lot_category = {category:String})
          ),
          ${BIDDER_IDENTITY_CTES}
          SELECT
            sl.store_name AS branch,
            uniqExactIf(rli.resolved_email, fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_new,
            uniqExactIf(rli.resolved_email, fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_returning,
            sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_new_amount,
            sumIf(ifNull(sl.lot_bid_amount, 0), (fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) OR fe.first_ever_at IS NULL) AS winning_returning_amount
          FROM settled_lots sl
          LEFT JOIN resolved_lot_identity rli ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number
          LEFT JOIN bidder_first_ever fe ON rli.resolved_email = fe.fe_key
          GROUP BY sl.store_name
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      }),
      client.query({
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
              any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category
            FROM xv3.mart_auction_vendor_analysis v
            INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
            WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
            GROUP BY v.auction_number, v.lot_number
          ),
          ${BIDDER_IDENTITY_CTES}
          SELECT
            sl.category AS category,
            uniqExactIf(rli.resolved_email, fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_new,
            uniqExactIf(rli.resolved_email, fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_returning,
            sumIf(ifNull(sl.lot_bid_amount, 0), fe.first_ever_at IS NOT NULL AND fe.first_ever_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS winning_new_amount,
            sumIf(ifNull(sl.lot_bid_amount, 0), (fe.first_ever_at IS NOT NULL AND fe.first_ever_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) OR fe.first_ever_at IS NULL) AS winning_returning_amount
          FROM settled_lots sl
          LEFT JOIN resolved_lot_identity rli ON sl.auction_number = rli.ri_auction_number AND sl.lot_number = rli.ri_lot_number
          LEFT JOIN bidder_first_ever fe ON rli.resolved_email = fe.fe_key
          GROUP BY sl.category
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      }),
      client.query({
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
            SELECT lowerUTF8(trim(email)) AS bidder_key, min(bid_created_at) AS first_bid_at
            FROM cms.mart_cms_bid_history_report
            WHERE bid_created_at IS NOT NULL AND email IS NOT NULL AND trim(email) != ''
            GROUP BY bidder_key
          ),
          branch_bidder_activity AS (
            SELECT
              s.store_name AS store_name,
              lowerUTF8(trim(b.email)) AS bidder_key,
              sum(b.bid_amount) AS bidder_amount
            FROM cms.mart_cms_bid_history_report b
            INNER JOIN auction_store s ON b.auction_number = s.auction_number
            LEFT JOIN lot_category lc ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number
            WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
              AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
              AND ({store:String} = '' OR s.store_name = {store:String})
              AND b.email IS NOT NULL AND trim(b.email) != ''
              AND ({category:String} = '' OR lc.lot_category = {category:String})
            GROUP BY store_name, bidder_key
          )
          SELECT
            ba.store_name AS branch,
            uniqExactIf(ba.bidder_key, f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new,
            uniqExactIf(ba.bidder_key, f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning,
            sumIf(ba.bidder_amount, f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new_amount,
            sumIf(ba.bidder_amount, f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning_amount
          FROM branch_bidder_activity ba
          INNER JOIN bidder_first_bid f ON ba.bidder_key = f.bidder_key
          GROUP BY ba.store_name
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      }),
      client.query({
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
            SELECT lowerUTF8(trim(email)) AS bidder_key, min(bid_created_at) AS first_bid_at
            FROM cms.mart_cms_bid_history_report
            WHERE bid_created_at IS NOT NULL AND email IS NOT NULL AND trim(email) != ''
            GROUP BY bidder_key
          ),
          category_bidder_activity AS (
            SELECT
              lc.lot_category AS lot_category,
              lowerUTF8(trim(b.email)) AS bidder_key,
              sum(b.bid_amount) AS bidder_amount
            FROM cms.mart_cms_bid_history_report b
            INNER JOIN auction_store s ON b.auction_number = s.auction_number
            INNER JOIN lot_category lc ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number
            WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
              AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
              AND ({store:String} = '' OR s.store_name = {store:String})
              AND b.email IS NOT NULL AND trim(b.email) != ''
            GROUP BY lot_category, bidder_key
          )
          SELECT
            ca.lot_category AS category,
            uniqExactIf(ca.bidder_key, f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new,
            uniqExactIf(ca.bidder_key, f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning,
            sumIf(ca.bidder_amount, f.first_bid_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_new_amount,
            sumIf(ca.bidder_amount, f.first_bid_at < toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')) AS participating_returning_amount
          FROM category_bidder_activity ca
          INNER JOIN bidder_first_bid f ON ca.bidder_key = f.bidder_key
          GROUP BY ca.lot_category
        `,
        query_params: queryParams,
        format: "JSONEachRow",
      }),
    ]);

    const winningByBranchRows = await winningByBranchResult.json();
    const winningByCategoryRows = await winningByCategoryResult.json();
    const participatingByBranchRows = await participatingByBranchResult.json();
    const participatingByCategoryRows = await participatingByCategoryResult.json();

    const winningByBranchMap = new Map(winningByBranchRows.map((r) => [r.branch, r]));
    const winningByCategoryMap = new Map(winningByCategoryRows.map((r) => [r.category, r]));
    const participatingByBranchMap = new Map(participatingByBranchRows.map((r) => [r.branch, r]));
    const participatingByCategoryMap = new Map(participatingByCategoryRows.map((r) => [r.category, r]));

    function bidderComposition(winningRow, participatingRow) {
      const w = winningRow || {};
      const p = participatingRow || {};
      return {
        participating_new: Number(p.participating_new ?? 0),
        participating_returning: Number(p.participating_returning ?? 0),
        participating_new_amount: Number(p.participating_new_amount ?? 0),
        participating_returning_amount: Number(p.participating_returning_amount ?? 0),
        winning_new: Number(w.winning_new ?? 0),
        winning_returning: Number(w.winning_returning ?? 0),
        winning_new_amount: Number(w.winning_new_amount ?? 0),
        winning_returning_amount: Number(w.winning_returning_amount ?? 0),
      };
    }

    // ---------------------------------------------------------
    // BIDDING ACTIVITY BY HOUR (Asia/Manila local hour)
    //
    // For CategoryView's "Bidding Activity by Hour" — the main Overview UI
    // doesn't currently render this, but the field is harmless when
    // category is '' (same additive convention as every other
    // CategoryView-only field in this response).
    //
    // Source: cms.mart_cms_bid_history_report, the same table
    // api/leaderboards.js already uses for its "activity-based" bidder
    // composition. Investigated against real data before writing this:
    // bid_amount here is the STANDING/leading bid value at each row, not a
    // per-bid delta (a lot's rows climb 500 -> 550 -> 600 -> ... as
    // successive bidders outbid each other) — confirmed by inspecting a
    // real multi-bid lot's full history ordered by bid_created_at.
    // sum(bid_amount) therefore does NOT equal settled/final value; it's
    // the same "sum of every bid EVENT" activity definition
    // api/leaderboards.js already ships as bidding_activity_composition
    // (see its comment: "sum of every bid EVENT per bidder, not settled
    // value"). Reused here rather than inventing a new formula, per that
    // same already-established convention — this section is an activity
    // signal, not a settled-value one.
    //
    // Category: derived from the SAME xv3.mart_auction_vendor_analysis ->
    // CATEGORY_CLASSIFICATION_SQL(name) classification every other
    // category-scoped query in this file uses (never re-derived from
    // bid_history's own `description` field), joined in by
    // (auction_number, lot_number) so it can never disagree with Overview's
    // category definition.
    //
    // Store: resolved via xv3.mart_auction_productivity_report, the same
    // auction_number -> store_name lookup api/leaderboards.js's
    // compositionResult already uses for this exact table — deliberately
    // NOT date-scoped itself (only used for the store name), matching that
    // existing query's convention. Date range is applied directly on
    // bid_created_at (an absolute-instant comparison against a
    // Asia/Manila-tagged boundary — timezone-correct regardless of the
    // column's own stored zone), also matching that existing convention.
    //
    // Hour bucket: bid_created_at is stored in server-local (UTC) time —
    // confirmed empirically (a raw toHour() clusters activity at UTC
    // 2-7, i.e. 10am-3pm Manila, which only makes sense once shifted;
    // toHour(bid_created_at, 'Asia/Manila') produces the expected
    // business-hours-shaped distribution instead), so the explicit
    // timezone argument is required here even though the date-range
    // comparison above doesn't need one.
    // ---------------------------------------------------------
    const hourlyResultPromise = client.query({
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

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY v.auction_number, v.lot_number
        )

        SELECT
          toHour(b.bid_created_at, 'Asia/Manila') AS hour,
          sum(ifNull(b.bid_amount, 0)) AS bid_amount

        FROM cms.mart_cms_bid_history_report b

        INNER JOIN auction_store s
          ON b.auction_number = s.auction_number

        LEFT JOIN lot_category lc
          ON b.auction_number = lc.auction_number AND b.lot_number = lc.lot_number

        WHERE b.bid_created_at >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
          AND b.bid_created_at < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)

          AND (
            {store:String} = ''
            OR s.store_name = {store:String}
          )

          AND (
            {category:String} = ''
            OR lc.lot_category = {category:String}
          )

        GROUP BY hour
        ORDER BY hour
      `,
      query_params: queryParams,
      format: "JSONEachRow",
    });

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
    const branchResultPromise = client.query({
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
    const categoryResultPromise = client.query({
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

    // ---------------------------------------------------------
    // ACTIVE AUCTIONS RIGHT NOW
    //
    // Deliberately NOT category-scoped. This is an auction-level count
    // (xv3.mart_auction_productivity_report has no lot/category
    // information at all), and an auction can contain lots from multiple
    // categories — "how many active auctions contain at least one lot in
    // category X" is a definable rule (join to vendor_analysis, count
    // distinct auction_number with a matching lot), but it's a genuinely
    // different metric from today's plain "in progress right now" count,
    // and mixing a real-time auction-level concept with a lot-level
    // reporting filter needs an explicit product decision, not an
    // assumption. Investigated and intentionally left global; category is
    // not referenced in this query's SQL text, so passing it is a no-op
    // even if a caller sent one.
    // ---------------------------------------------------------
    const activeAuctionResultPromise = client.query({
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
    const lotStatusResultPromise = client.query({
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
            max(ifNull(v.reserved_price, 0)) AS reserved_price,
            any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category

          FROM xv3.mart_auction_vendor_analysis v

          INNER JOIN selected_auctions a
            ON v.auction_number = a.auction_number

          WHERE v.auction_number IS NOT NULL
            AND v.lot_number IS NOT NULL

          GROUP BY
            v.auction_number,
            v.lot_number

          -- Post-aggregation filter on the per-lot canonical lot_category —
          -- see type=lots' identical comment.
          HAVING (
            {category:String} = ''
            OR lot_category = {category:String}
          )
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

    // Bounded 5-query batch: hourly activity, current-bid-value by branch/
    // category (a different, live-standing population from the settled
    // queries above), active-auctions-right-now, and lot status are all
    // independent of each other and of everything already resolved above —
    // only static queryParams/store — so this only changes wall-clock time.
    const [hourlyResult, branchResult, categoryResult, activeAuctionResult, lotStatusResult] =
      await Promise.all([
        hourlyResultPromise,
        branchResultPromise,
        categoryResultPromise,
        activeAuctionResultPromise,
        lotStatusResultPromise,
      ]);

    const hourlyRows = await hourlyResult.json();
    const branchRows = await branchResult.json();
    const categoryRows = await categoryResult.json();

    const activeAuctionRows = await activeAuctionResult.json();
    const activeAuction = activeAuctionRows[0] ?? {};

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

    if (OVERVIEW_LIVE_CORRECTION_ENABLED) {
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

    // ---------------------------------------------------------
    // DYNAMIC COMPARISON PERIOD — only runs when the frontend sent a
    // comparable previous window (see resolveComparisonRange in
    // src/utils/dateRange.js: same elapsed weekday/day-of-month/
    // calendar-date window as the current selection, never a blanket
    // rolling shift). Mirrors the exact same settled/lot-status/service-
    // income/registration queries above, just against [compareFrom,
    // compareTo] — same population, same definitions, nothing new. Custom
    // ranges always resolve a comparison window (immediately preceding
    // period of identical length), so this is skipped only if the
    // frontend genuinely sent nothing.
    // ---------------------------------------------------------
    let comparison = null;
    if (compareFrom && compareTo) {
      const compareParams = { from: compareFrom, to: compareTo, store, category };

      const [cmpSettledResult, cmpLotStatusResult, cmpServiceIncomeResult, cmpRegistrationResult, cmpCategoryResult] = await Promise.all([
        client.query({
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
              INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
              WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
              GROUP BY v.auction_number, v.lot_number
              HAVING ({category:String} = '' OR lot_category = {category:String})
            )
            SELECT
              sum(ifNull(lot_bid_amount, 0)) AS total_bid_amount,
              countDistinct(auction_number) AS auctions_concluded,
              count() AS settled_lot_count
            FROM settled_lots
          `,
          query_params: compareParams,
          format: "JSONEachRow",
        }),
        client.query({
          query: `
            WITH selected_auctions AS (
              SELECT DISTINCT auction_number
              FROM xv3.mart_auction_productivity_report
              WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
                AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
                AND ({store:String} = '' OR store_name = {store:String})
            ),
            lots AS (
              SELECT
                v.auction_number,
                v.lot_number,
                argMax(v.status, ${STATUS_PRIORITY_SQL}) AS status,
                max(ifNull(v.reserved_price, 0)) AS reserved_price,
                any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
              FROM xv3.mart_auction_vendor_analysis v
              INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
              WHERE v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
              GROUP BY v.auction_number, v.lot_number
              HAVING ({category:String} = '' OR lot_category = {category:String})
            )
            SELECT
              count() AS listed_lots,
              countIf(status IN ('Outstanding', 'Paid', 'Unpaid', 'Released')) AS sold_lots,
              countIf(status = 'Unsold') AS unsold_lots,
              sumIf(reserved_price, status = 'Unsold') AS unsold_value
            FROM lots
          `,
          query_params: compareParams,
          format: "JSONEachRow",
        }),
        client.query({
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
                any(v.sold_price) AS lot_sold_price,
                any(v.commission) AS lot_commission_pct,
                any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS lot_category
              FROM xv3.mart_auction_vendor_analysis v
              INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
              WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
              GROUP BY v.auction_number, v.lot_number
              HAVING ({category:String} = '' OR lot_category = {category:String})
            )
            SELECT
              sum(ifNull(lot_sold_price, 0) - ifNull(lot_bid_amount, 0)) AS service_income_buyers_premium,
              sum(ifNull(lot_bid_amount, 0) * ifNull(lot_commission_pct, 0) / 100) AS service_income_commission
            FROM settled_lots
          `,
          query_params: compareParams,
          format: "JSONEachRow",
        }),
        client.query({
          query: `
            WITH selected_auctions AS (
              SELECT DISTINCT auction_number
              FROM xv3.mart_auction_productivity_report
              WHERE starting_time >= toDateTime(concat({from:String}, ' 00:00:00'), 'Asia/Manila')
                AND starting_time < addDays(toDateTime(concat({to:String}, ' 00:00:00'), 'Asia/Manila'), 1)
                AND ({store:String} = '' OR store_name = {store:String})
            )
            SELECT
              uniqExact(r.customer_id) AS registered,
              uniqExactIf(r.customer_id, r.is_participating_bidder = 1) AS participating
            FROM cms.mart_cms_bidder_registrations r
            INNER JOIN selected_auctions a ON r.auction_number = a.auction_number
            WHERE r.customer_id IS NOT NULL
          `,
          query_params: compareParams,
          format: "JSONEachRow",
        }),
        // Previous-period counterpart of settledCategoryResult below — same
        // Date/Store scope shifted to [compareFrom, compareTo], same
        // deliberate independence from the sidebar's {category:String}
        // filter, powering the Avg Bid cards' per-category comparison
        // (section 6/7) with the SAME category on both sides, never the
        // blended All-Categories previous value.
        client.query({
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
                any(${CATEGORY_CLASSIFICATION_SQL("v.name")}) AS category
              FROM xv3.mart_auction_vendor_analysis v
              INNER JOIN selected_auctions a ON v.auction_number = a.auction_number
              WHERE v.status IN ('Paid', 'Released') AND v.auction_number IS NOT NULL AND v.lot_number IS NOT NULL
              GROUP BY v.auction_number, v.lot_number
            )
            SELECT
              category,
              sum(ifNull(lot_bid_amount, 0)) AS bid_amount,
              countDistinct(auction_number) AS auction_count,
              count() AS lots_sold
            FROM settled_lots
            GROUP BY category
          `,
          query_params: compareParams,
          format: "JSONEachRow",
        }),
      ]);

      const cmpSettled = (await cmpSettledResult.json())[0] ?? {};
      const cmpLotStatus = (await cmpLotStatusResult.json())[0] ?? {};
      const cmpServiceIncome = (await cmpServiceIncomeResult.json())[0] ?? {};
      const cmpRegistration = (await cmpRegistrationResult.json())[0] ?? {};
      const cmpCategoryRows = await cmpCategoryResult.json();

      const cmpTotalBidAmount = Number(cmpSettled.total_bid_amount ?? 0);
      const cmpAuctionsConcluded = Number(cmpSettled.auctions_concluded ?? 0);
      const cmpSettledLotCount = Number(cmpSettled.settled_lot_count ?? 0);
      const cmpListedLots = Number(cmpLotStatus.listed_lots ?? 0);
      const cmpSoldLots = Number(cmpLotStatus.sold_lots ?? 0);
      const cmpUnsoldLots = Number(cmpLotStatus.unsold_lots ?? 0);
      const cmpUnsoldValue = Number(cmpLotStatus.unsold_value ?? 0);
      const cmpServiceIncomeTotal =
        Number(cmpServiceIncome.service_income_buyers_premium ?? 0) + Number(cmpServiceIncome.service_income_commission ?? 0);
      const cmpRegistered = Number(cmpRegistration.registered ?? 0);
      const cmpParticipatingRegistered = Number(cmpRegistration.participating ?? 0);

      // Safe % change: null (never a fabricated number) whenever the prior
      // period had nothing to compare against.
      const pctChange = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : null);

      comparison = {
        from: compareFrom,
        to: compareTo,
        total_bid_amount: cmpTotalBidAmount,
        total_bid_amount_pct: pctChange(settledTotalBidAmount, cmpTotalBidAmount),
        auctions_concluded: cmpAuctionsConcluded,
        auctions_concluded_pct: pctChange(settledAuctionCount, cmpAuctionsConcluded),
        avg_bid_per_auction_pct: pctChange(
          settledAuctionCount > 0 ? settledTotalBidAmount / settledAuctionCount : null,
          cmpAuctionsConcluded > 0 ? cmpTotalBidAmount / cmpAuctionsConcluded : null,
        ),
        avg_bid_per_sold_lot_pct: pctChange(
          settledLotCount > 0 ? settledTotalBidAmount / settledLotCount : null,
          cmpSettledLotCount > 0 ? cmpTotalBidAmount / cmpSettledLotCount : null,
        ),
        lots_sold_pct: pctChange(soldLots, cmpSoldLots),
        lots_listed_pct: pctChange(listedLots, cmpListedLots),
        unsold_lots: cmpUnsoldLots,
        unsold_lots_pct: pctChange(unsoldLots, cmpUnsoldLots),
        unsold_value_pct: pctChange(Number(lotStatus.unsold_value ?? 0), cmpUnsoldValue),
        service_income_pct: pctChange(serviceIncomeBuyersPremium + serviceIncomeCommission, cmpServiceIncomeTotal),
        registration_conversion_pct: pctChange(
          registeredCustomers > 0 ? (participatingRegisteredBidders / registeredCustomers) * 100 : null,
          cmpRegistered > 0 ? (cmpParticipatingRegistered / cmpRegistered) * 100 : null,
        ),

        // Previous-period category-level Avg Bid aggregates — same shape as
        // the top-level `categories` field below, one row per canonical
        // category that had settled activity in [compareFrom, compareTo].
        // A category absent here had zero settled results last period
        // (safe division downstream, never a fabricated ₱0 average).
        categories: cmpCategoryRows.map((row) => ({
          category: row.category,
          bid_amount: Number(row.bid_amount ?? 0),
          auction_count: Number(row.auction_count ?? 0),
          lots_sold: Number(row.lots_sold ?? 0),
        })),
      };
    }

    // =========================================================
    // SUMMARY RESPONSE
    // =========================================================
    //
    // Phase 2C: cached at Vercel's Edge Network for 30s (matching the
    // frontend's own 30s poll interval — see useLiveOverview.js), keyed
    // implicitly by the full request URL (from/to/store/category/
    // compareFrom/compareTo are all query params, and fetchJson() always
    // emits them in the same order with empty values omitted, so identical
    // scopes always produce byte-identical URLs and never collide with a
    // different scope). Only ClickHouse-derived, business-logic-free HTTP
    // caching — no new infrastructure, no in-process Map. Applies ONLY to
    // this 200 response; the type=... branches above and the 500 catch
    // block below are untouched (never cached).
    //
    // CAVEAT (documented per Phase 2C's explicit instructions): this
    // response mixes historical/settled fields (Total Bid Amount, Service
    // Income, category/branch breakdowns, Bid Trend, etc.) with a handful
    // of genuinely live fields (todays_bid_amount, current_bid_value,
    // current_bid_value_today, current_bid_value_branches/_categories,
    // active_auctions, live_bid_correction_delta/live_corrected_auctions/
    // unmapped_live_lots) in ONE JSON payload. A clean split (live always
    // fresh, historical cached) would require bundling ~20 intermediate
    // query results across every batch above into a separate cache path —
    // assessed as disproportionate surgery for this phase given Phase 2B's
    // own experience finding a subtle correctness bug in a smaller, similar
    // refactor. Net effect: on a cache HIT, the live fields above can be up
    // to ~30-60s stale (30s fresh window + up to 30s stale-while-revalidate
    // window) instead of reflecting the exact instant of that request. This
    // is not a regression in practice — the frontend already only samples
    // these fields once per 30s poll, so a shared 30-60s-old snapshot is
    // close to what a single user already experiences; it just means
    // multiple concurrent tabs/users now sometimes share one snapshot
    // instead of each re-computing their own. Do not raise this TTL without
    // separating live from historical fields first.
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=30");
    return res.status(200).json({
      // Business definition of Total Bid Amount: settled (Paid/Released)
      // bid_amount only. See the SETTLED query comments above.
      total_bid_amount: settledTotalBidAmount,

      // Dynamic period-over-period comparison — see DYNAMIC COMPARISON
      // PERIOD query comment above. null when the frontend didn't send a
      // comparable window (never a fabricated comparison).
      comparison,

      // Today's Bid Amount: warehouse-only "latest bid placed today" — NOT
      // the settled Paid/Released definition used by Total Bid Amount
      // above. See todayBidResult: argMax(bid_amount, bid_created_at) per
      // auction_number + lot_number, scoped to today's Asia/Manila
      // calendar day, from cms.mart_cms_bid_history_report. These are
      // intentionally different business metrics and are not expected to
      // reconcile with each other.
      todays_bid_amount: Number(todayBid.todays_bid_amount ?? 0),

      // Service Income: real warehouse revenue from the SAME settled
      // Paid/Released population as Total Bid Amount — Buyer's Premium
      // Income (sold_price - bid_amount) + Commission Income (bid_amount *
      // commission / 100). See the SERVICE INCOME (SETTLED) query comments
      // above for why buyers_premium/commission are rates, not pesos.
      service_income_buyers_premium: serviceIncomeBuyersPremium,
      service_income_commission: serviceIncomeCommission,
      service_income_total: serviceIncomeBuyersPremium + serviceIncomeCommission,

      // CategoryView-only fields below (harmless when category is '' —
      // nothing in the main Overview UI reads them). Same settled
      // Paid/Released population as Total Bid Amount/Service Income above.
      //
      // buyers_premium_amount/service_fee_amount: peso totals for
      // CategoryView's Money Flow waterfall — service_fee_amount here is
      // actually Commission Income (bid_amount * commission / 100), kept
      // under this existing field name so CategoryView.jsx's read doesn't
      // need to change; only its displayed label does (see that file).
      buyers_premium_amount: serviceIncomeBuyersPremium,
      service_fee_amount: serviceIncomeCommission,

      // avg_buyers_premium_pct/avg_commission_pct: value-weighted blended
      // rates (SUM(income component) / SUM(bid_amount) * 100) — see the
      // SERVICE INCOME (SETTLED) query comments above for why this is
      // deliberately NOT a naive AVG() of each lot's own rate field.
      avg_buyers_premium_pct: avgBuyersPremiumPct,
      avg_commission_pct: avgCommissionPct,

      // Reserve Price Performance: settled lots with reserved_price > 0
      // only (a lot with no reserve set has nothing to compare against —
      // never classified as "at/below" a reserve that doesn't exist).
      // avg_premium_over_reserve_pct is a value-weighted ratio over the
      // sold-above-reserve subset (SUM(excess)/SUM(reserve)), not a naive
      // per-lot average — see the query comments above.
      sold_at_or_below: soldAtOrBelowReserve,
      sold_above: soldAboveReserve,
      avg_premium_over_reserve_pct: avgPremiumOverReservePct,

      // "Total Auctions" for CategoryView — a derived distinct-auction
      // count over the same settled population as Total Bid Amount, not an
      // already-validated Overview definition (Active Auctions is a
      // "right now" concept unrelated to date range/category) — see the
      // TOTAL BID AMOUNT (SETTLED) query comment above.
      total_auctions: settledAuctionCount,
      // Same figure under an explicit name — "Auctions Concluded" KPI.
      auctions_concluded: settledAuctionCount,
      settled_lot_count: settledLotCount,

      // Auction-grain summary behind the Total Bid Amount / Auctions
      // Concluded / Avg Bid per Auction / Avg Bid per Sold Lot / Lots Sold
      // drilldowns — see AUCTION-LEVEL SUMMARY query comment above.
      auction_summary: auctionSummaryRows.map((row) => ({
        auction_number: row.auction_number,
        name: row.name,
        store_name: row.store_name,
        starting_time: row.starting_time,
        type: row.type ?? null,
        sub_type: row.sub_type ?? null,
        lots_listed: Number(row.lots_listed ?? 0),
        lots_sold: Number(row.lots_sold ?? 0),
        lots_unsold: Number(row.lots_unsold ?? 0),
        settled_bid_amount: Number(row.settled_bid_amount ?? 0),
        settled_lot_count: Number(row.settled_lot_count ?? 0),
      })),

      // Bid Trend — always daily, each row is that single day only (never
      // a cumulative/period total) — see BID TREND query comments above.
      bid_trend: bidTrendRows.map((row) => ({
        bucket: row.bucket,
        bid_amount: row.bid_amount,
        auctions_concluded: row.auctions_concluded,
        lots_sold: row.lots_sold,
        winning: {
          new: row.winning_new,
          returning: row.winning_returning,
          new_amount: row.winning_new_amount,
          returning_amount: row.winning_returning_amount,
        },
        participating: {
          new: row.participating_new,
          returning: row.participating_returning,
          new_amount: row.participating_new_amount,
          returning_amount: row.participating_returning_amount,
        },
      })),

      // Registration -> Bidder Conversion — see REGISTRATION -> BIDDER
      // CONVERSION query comment above for cohort definition.
      registered_customers: registeredCustomers,
      participating_registered_bidders: participatingRegisteredBidders,

      // For Approval: lots whose resolved for_approval_status is exactly
      // 'For Approval', independent of lifecycle status (Unsold/Outstanding/
      // Unpaid/Paid/Released/Returned/Refunded can all appear). Value is
      // SUM(bid_amount) only — never backfilled from reserved_price; a lot
      // with bid_amount = 0 (e.g. still Unsold) legitimately contributes
      // ₱0. This replaces the old mock-only pending_payment_count/
      // pending_payment_value definition (see METHODOLOGY.forApproval in
      // HeroKPIs.jsx for the prior "pending payment" framing being retired).
      for_approval_lots: forApprovalLots,
      for_approval_bid_amount: forApprovalBidAmount,

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
        auction_count: Number(row.auction_count ?? 0),
        lots_sold: Number(row.lots_sold ?? 0),
        buyers_premium_income: Number(row.buyers_premium_income ?? 0),
        commission_income: Number(row.commission_income ?? 0),
        ...bidderComposition(winningByBranchMap.get(row.branch), participatingByBranchMap.get(row.branch)),
      })),

      categories: settledCategoryRows.map((row) => ({
        category: row.category,
        bid_amount: Number(row.bid_amount ?? 0),
        auction_count: Number(row.auction_count ?? 0),
        lots_sold: Number(row.lots_sold ?? 0),
        buyers_premium_income: Number(row.buyers_premium_income ?? 0),
        commission_income: Number(row.commission_income ?? 0),
        ...bidderComposition(winningByCategoryMap.get(row.category), participatingByCategoryMap.get(row.category)),
      })),

      // Bidding Activity by Hour (CategoryView-only today) — see the
      // BIDDING ACTIVITY BY HOUR query comment above for source/definition.
      hourly: hourlyRows.map((row) => ({
        hour: Number(row.hour),
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
