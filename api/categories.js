import { chQuery } from "./_clickhouse.js";
import { parseDateParams, buildWhere, storeCondition } from "./_util.js";

// Category breakdown by bid amount, for the "Where the money is coming
// from" section, plus the sale-channel ("Online Bidding" / "Live Auction" /
// "Simulcast" / "Buy Now") breakdown for the Sale Channels tab — folded in
// here rather than its own route to stay under Vercel's 12-function cap.
export default async function handler(req, res) {
  let from, to;
  try {
    ({ from, to } = parseDateParams(req));
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }
  const { store } = req.query;

  const where = buildWhere("date_created", from, to, [
    "category != ''",
    "category IS NOT NULL",
    storeCondition("branch", store),
  ].filter(Boolean));

  const productivityWhere = buildWhere("starting_time", from, to, [storeCondition("store_name", store)].filter(Boolean));
  const endedProductivityWhere = buildWhere(
    "starting_time",
    from,
    to,
    [storeCondition("store_name", store), "ending_time <= now()"].filter(Boolean)
  );

  try {
    // category is a deep " - "-chained hierarchy (e.g. "GENERAL MERCHANDISE
    // - BULK GOODS - PALLETIZED") — rolling up to just the top-level segment
    // avoids a dozen near-duplicate rows all reading "GENERAL MERCHANDISE".
    const [categoryRows, channelRows, channelSoldRows] = await Promise.all([
      chQuery(`
        SELECT splitByString(' - ', assumeNotNull(category))[1] AS category, sum(bid_amount) AS bid_amount
        FROM mart_auction_vendor_analysis
        ${where}
        GROUP BY category
        ORDER BY bid_amount DESC
        FORMAT JSON
      `),
      chQuery(`
        SELECT
          category AS channel,
          sum(total_bid_amount) AS bid_amount,
          sumIf(lot_count, ending_time <= now()) AS ended_lots_listed
        FROM mart_auction_productivity_report
        ${productivityWhere}
        GROUP BY channel
        ORDER BY bid_amount DESC
        FORMAT JSON
      `),
      // Sell-through per channel, same definition as the Overview fix:
      // scoped to auctions that have ended, counting anything past "Unsold"
      // (Outstanding/Released/Paid) as sold.
      chQuery(`
        SELECT
          a.category AS channel,
          countIf(v.status IN ('Outstanding', 'Released', 'Paid')) AS ended_lots_sold
        FROM mart_auction_vendor_analysis v
        INNER JOIN (
          SELECT auction_number, category FROM mart_auction_productivity_report ${endedProductivityWhere}
        ) a ON v.auction_number = a.auction_number
        GROUP BY channel
        FORMAT JSON
      `),
    ]);

    const soldByChannel = Object.fromEntries(channelSoldRows.map((r) => [r.channel, Number(r.ended_lots_sold) || 0]));
    const channels = channelRows.map((r) => ({
      channel: r.channel,
      bidAmount: Number(r.bid_amount) || 0,
      endedLotsListed: Number(r.ended_lots_listed) || 0,
      endedLotsSold: soldByChannel[r.channel] || 0,
    }));

    res.status(200).json({ categories: categoryRows, channels });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
