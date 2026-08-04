import { chQuery } from "./_clickhouse.js";
import { storeCondition } from "./_util.js";

// Real year-over-year figures for the Trends tab, 2020 (earliest real data)
// through the current year — folded into this endpoint via ?mode=trends
// rather than its own route, to stay under Vercel's 12-function cap.
// Metric definitions mirror ones already established elsewhere on the
// dashboard: sell-through counts anything past "Unsold" (Outstanding/
// Released/Paid) as sold, scoped to auctions that have ended (see
// api/overview.js); service income margin is (buyers premium + service
// fee) / gross bid amount (see OperationsTable's "Service Income" column).
async function fetchTrends(store) {
  const storeScope = storeCondition("store_name", store);
  const branchScope = storeCondition("branch", store);
  const yearWhere = (extra) =>
    [`starting_time >= '2020-01-01'`, `starting_time < '2027-01-01'`, ...extra].filter(Boolean).join(" AND ");

  const [productivityRows, bidderRows, soldRows] = await Promise.all([
    chQuery(`
      SELECT
        toYear(starting_time) AS year,
        COUNT(DISTINCT auction_id) AS auctions,
        uniqExact(store_name) AS branches,
        SUM(lot_count) AS lots,
        SUM(paid_count) AS paid,
        SUM(total_bid_amount) AS bid_amount,
        SUM(total_buyers_premium) AS buyers_premium,
        SUM(total_service_fee) AS service_fee,
        sumIf(lot_count, ending_time <= now()) AS ended_listed
      FROM mart_auction_productivity_report
      WHERE ${yearWhere([storeScope])}
      GROUP BY year
      ORDER BY year
      FORMAT JSON
    `),
    chQuery(`
      SELECT toYear(date_created) AS year, uniqExact(bidder_name) AS bidders
      FROM mart_auction_vendor_analysis
      WHERE date_created >= '2020-01-01' AND date_created < '2027-01-01'
        AND bidder_name != '' AND bidder_name IS NOT NULL
        ${branchScope ? `AND ${branchScope}` : ""}
      GROUP BY year
      ORDER BY year
      FORMAT JSON
    `),
    chQuery(`
      SELECT
        toYear(a.starting_time) AS year,
        countIf(v.status IN ('Outstanding', 'Released', 'Paid')) AS ended_sold
      FROM mart_auction_vendor_analysis v
      INNER JOIN (
        SELECT auction_number, starting_time FROM mart_auction_productivity_report
        WHERE ending_time <= now() ${storeScope ? `AND ${storeScope}` : ""}
      ) a ON v.auction_number = a.auction_number
      WHERE ${yearWhere([])}
      GROUP BY year
      ORDER BY year
      FORMAT JSON
    `),
  ]);

  const bidderByYear = Object.fromEntries(bidderRows.map((r) => [r.year, Number(r.bidders) || 0]));
  const soldByYear = Object.fromEntries(soldRows.map((r) => [r.year, Number(r.ended_sold) || 0]));

  const years = productivityRows.map((r) => Number(r.year));

  // Real classification from the actual value series, replacing what used
  // to be a hand-picked label — year-over-year % changes, judged on their
  // average direction and how much they swing around it.
  function classifyTrend(values) {
    const changes = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) changes.push((values[i] - values[i - 1]) / Math.abs(values[i - 1]));
    }
    if (!changes.length) return "STABLE";
    const avg = changes.reduce((s, c) => s + c, 0) / changes.length;
    const variance = changes.reduce((s, c) => s + (c - avg) ** 2, 0) / changes.length;
    if (Math.sqrt(variance) > 0.4) return "VOLATILE";
    if (avg > 0.05) return "IMPROVING";
    if (avg < -0.05) return "DECLINING";
    return "STABLE";
  }

  const metricRow = (key, label, unit, fn) => {
    const values = productivityRows.map((r) => fn(r));
    return { key, label, unit, trend: classifyTrend(values), values };
  };

  return {
    years,
    metrics: [
      metricRow("serviceIncomeMargin", "Service Income Margin", "pct", (r) =>
        Number(r.bid_amount) > 0
          ? Number((((Number(r.buyers_premium) || 0) + (Number(r.service_fee) || 0)) / Number(r.bid_amount) * 100).toFixed(1))
          : 0
      ),
      metricRow("itemsPerAuction", "Items per Auction", "count", (r) =>
        Number(r.auctions) > 0 ? Math.round(Number(r.lots) / Number(r.auctions)) : 0
      ),
      metricRow("avgAuctionsPerBranch", "Avg Auctions per Branch", "count", (r) =>
        Number(r.branches) > 0 ? Math.round(Number(r.auctions) / Number(r.branches)) : 0
      ),
      metricRow("bidderToAuctionRatio", "Bidder-to-Auction Ratio", "ratio", (r) =>
        Number(r.auctions) > 0 ? Number(((bidderByYear[r.year] || 0) / Number(r.auctions)).toFixed(2)) : 0
      ),
      metricRow("avgBidPerItem", "Avg Bid per Item", "currency", (r) =>
        Number(r.paid) > 0 ? Number((Number(r.bid_amount) / Number(r.paid)).toFixed(2)) : 0
      ),
      metricRow("sellThroughRate", "Sell-Through Rate", "pct", (r) =>
        Number(r.ended_listed) > 0 ? Math.round((soldByYear[r.year] || 0) / Number(r.ended_listed) * 100) : 0
      ),
    ],
  };
}

export default async function handler(req, res) {
  const { mode, store } = req.query;

  try {
    if (mode === "trends") {
      return res.status(200).json(await fetchTrends(store));
    }

    // Distinct real store/branch names for the store-picker dropdown —
    // mart_auction_productivity_report is the smallest table with this
    // column, cheapest to scan for a simple distinct list.
    const rows = await chQuery(`
      SELECT DISTINCT store_name
      FROM mart_auction_productivity_report
      WHERE store_name IS NOT NULL AND store_name != ''
      ORDER BY store_name
      FORMAT JSON
    `);
    res.status(200).json({ stores: rows.map((r) => r.store_name) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
