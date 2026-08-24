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
    // =========================================================
    if (type === "lots") {
      const result = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT
              auction_number,
              store_name

            FROM xv3.mart_auction_productivity_report

            WHERE starting_time >= {from:Date}
              AND starting_time < addDays({to:Date}, 1)

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
              any(v.status) AS status,
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
            status,
            reserved_price,
            sold_price,
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

          WHERE status IN (
            'Outstanding',
            'Paid',
            'Unpaid',
            'Released',
            'Unsold'
          )

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
        store_name: row.store_name,
        status: row.status,
        disposition: row.disposition,
        reserved_price: Number(row.reserved_price ?? 0),
        sold_price: Number(row.sold_price ?? 0),
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
    // =========================================================
    if (type === "unsold-lots") {
      const result = await client.query({
        query: `
          WITH selected_auctions AS (
            SELECT DISTINCT
              auction_number,
              store_name

            FROM xv3.mart_auction_productivity_report

            WHERE starting_time >= {from:Date}
              AND starting_time < addDays({to:Date}, 1)

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
              any(v.status) AS status,
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
        store_name: row.store_name,
        status: row.status,
        reserved_price: Number(row.reserved_price ?? 0),
        sold_price: Number(row.sold_price ?? 0),
      }));

      const unsoldValue = mappedRows.reduce(
        (sum, row) => sum + row.reserved_price,
        0,
      );

      return res.status(200).json({
        type: "unsold-lots",

        summary: {
          count: mappedRows.length,
          value: unsoldValue,
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

    // ---------------------------------------------------------
    // BID AMOUNT BY BRANCH
    //
    // Same latest-per-lot definition as TOTAL BID AMOUNT — grouped by
    // branch instead of collapsed to a single scalar. Uses the identical
    // lot_latest_bid CTE (same joins, same filters) as totalResult, so
    // sum(branches.bid_amount) is structurally guaranteed to equal
    // total_bid_amount's raw baseline.
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
    // BID AMOUNT BY CATEGORY
    //
    // Same latest-per-lot definition as TOTAL BID AMOUNT. lot_category is
    // joined with LEFT JOIN + coalesce to 'Uncategorized' (not INNER JOIN)
    // so a lot with bid history but no matching vendor_analysis row still
    // contributes its bid somewhere, rather than being silently dropped —
    // required so sum(categories.bid_amount) is guaranteed to equal
    // total_bid_amount's raw baseline exactly, the same way branch does.
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
    // ---------------------------------------------------------
    const lotStatusResult = await client.query({
      query: `
        WITH selected_auctions AS (
          SELECT DISTINCT
            auction_number

          FROM xv3.mart_auction_productivity_report

          WHERE starting_time >= {from:Date}
            AND starting_time < addDays({to:Date}, 1)

            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )
        ),

        lots AS (
          SELECT
            v.auction_number,
            v.lot_number,
            any(v.status) AS status,
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
          ) AS unsold_value

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

    const todayManila = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());
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
      total_bid_amount: correctedTotalBidAmount,

      todays_bid_amount: correctedTodaysBidAmount,

      active_auctions: Number(activeAuction.active_auctions ?? 0),

      listed_lots: listedLots,
      sold_lots: soldLots,
      unsold_lots: unsoldLots,
      sell_through_rate: sellThroughRate,
      unsold_value: Number(lotStatus.unsold_value ?? 0),

      branches: correctedBranches,

      categories: correctedCategories,

      // Temporary diagnostic fields for validating the live bid
      // correction — not for permanent frontend consumption yet.
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
