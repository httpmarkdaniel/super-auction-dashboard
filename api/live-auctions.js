import { chQuery } from "./_clickhouse.js";
import { storeCondition, escapeSqlString } from "./_util.js";

// Which auctions are live right now, per ClickHouse (starting_time already
// passed, ending_time not yet reached or unset). This is how we discover
// which {auction} IDs to poll against the cms.hmr.ph real-time API — that
// API needs a specific auction ID and has no "list live auctions" endpoint
// of its own.
//
// Pass auction_number instead to look up one specific auction (live or
// not) — used to cross-check ClickHouse's auction_number against
// cms.hmr.ph's own internal auction id.
export default async function handler(req, res) {
  const { store, auction_number, when } = req.query;
  const upcoming = when === "upcoming";
  const extra = auction_number
    ? [`auction_number = '${escapeSqlString(auction_number)}'`]
    : upcoming
    ? ["starting_time > now()", storeCondition("store_name", store)].filter(Boolean)
    : [
        "starting_time <= now()",
        "(ending_time IS NULL OR ending_time >= now())",
        storeCondition("store_name", store),
      ].filter(Boolean);

  try {
    const rows = await chQuery(`
      SELECT auction_id, auction_number, store_name, category, starting_time, ending_time, lot_count, paid_count
      FROM mart_auction_productivity_report
      WHERE ${extra.join(" AND ")}
      ORDER BY starting_time ${upcoming ? "ASC" : "DESC"}
      ${upcoming ? "LIMIT 30" : ""}
      FORMAT JSON
    `);
    res.status(200).json({ auctions: rows });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
