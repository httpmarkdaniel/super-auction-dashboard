import { createClient } from "@clickhouse/client";

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export default async function handler(req, res) {
  try {
    const { from, to, store = "", type } = req.query;

    if (!type) {
      return res.status(400).json({
        error: "Missing type parameter",
      });
    }

    // =========================================================
    // ACTIVE AUCTIONS
    // Live right now, same definition as overview.js
    // =========================================================
    if (type === "active-auctions") {
      const result = await client.query({
        query: `
          SELECT
            auction_number,
            any(name) AS name,
            any(store_name) AS store_name,
            min(starting_time) AS starting_time,
            max(ending_time) AS ending_time,
            max(lot_count) AS lot_count

          FROM xv3.mart_auction_productivity_report

          WHERE starting_time <= now()
            AND ending_time >= now()

            AND (
              {store:String} = ''
              OR store_name = {store:String}
            )

          GROUP BY auction_number
          ORDER BY ending_time ASC
        `,

        query_params: {
          store,
        },

        format: "JSONEachRow",
      });

      const rows = await result.json();

      return res.status(200).json({
        type: "active-auctions",
        total: rows.length,

        rows: rows.map((row) => ({
          auction_number: row.auction_number,
          name: row.name,
          store_name: row.store_name,
          starting_time: row.starting_time,
          ending_time: row.ending_time,
          lot_count: Number(row.lot_count ?? 0),
        })),
      });
    }

    // The lot drill-downs require the selected period.
    if (!from || !to) {
      return res.status(400).json({
        error: "Missing from/to date parameters",
      });
    }

    // =========================================================
    // LOTS SOLD / LISTED
    //
    // Same definitions as overview.js:
    //
    // SOLD:
    // Outstanding
    // Paid
    // Unpaid
    // Released
    //
    // UNSOLD:
    // Unsold
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

        query_params: {
          from,
          to,
          store,
        },

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
        (row) => row.disposition === "Sold"
      ).length;

      const unsold = mappedRows.filter(
        (row) => row.disposition === "Unsold"
      ).length;

      return res.status(200).json({
        type: "lots",

        summary: {
          listed: mappedRows.length,
          sold,
          unsold,
          sell_through_rate:
            mappedRows.length > 0
              ? Number(
                  ((sold / mappedRows.length) * 100).toFixed(1)
                )
              : 0,
        },

        rows: mappedRows,
      });
    }

    // =========================================================
    // UNSOLD LOTS
    // Same 376 / ₱1,067,500 population as overview.js
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

        query_params: {
          from,
          to,
          store,
        },

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
        0
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

    return res.status(400).json({
      error: "Invalid detail type",
    });
  } catch (err) {
    console.error("Overview details API error:", err);

    return res.status(500).json({
      error: "Failed to load overview details",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}