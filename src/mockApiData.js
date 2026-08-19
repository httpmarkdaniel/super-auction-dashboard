// Static placeholder payloads standing in for the real ClickHouse/cms.hmr.ph
// endpoints while the live data wiring is being fixed. Shapes mirror the
// real api/*.js responses field-for-field so every consuming component
// keeps working unmodified. Throwaway data — replace once live wiring is
// restored (see the MOCKED comment at the top of each use*.js hook).

const BRANCHES = ["CEBU", "ILOILO", "DAU", "SUBIC", "ONSITE", "HMR ARANETA"];
const VENDORS = ["Golden Eagle Trading", "Pacific Rim Surplus", "Metro Consign Co.", "Southport Liquidators", "Vantage Goods PH"];
const BIDDERS = ["Reyes, Miguel", "Santos, Ana", "Cruz, Paolo", "Villanueva, Jenna", "Torres, Ramon"];
const CATEGORIES = ["GENERAL MERCHANDISE", "ELECTRONICS", "APPLIANCES", "FURNITURE", "AUTOMOTIVE"];

export const MOCK_OVERVIEW = {
  total_auctions: 42,
  total_lots: 3180,
  total_paid: 2410,
  total_bid_amount: 18_450_000,
  total_buyers_premium: 2_214_000,
  total_service_fee: 923_000,
  ended_lots_listed: 2890,
  pending_payment_count: 214,
  pending_payment_value: 1_120_000,
  vendor_paid_count: 2196,
  total_commission: 923_000,
  service_income_buyers_premium: 2_010_000,
  service_income_service_fee: 845_000,
  unsold_count: 480,
  unsold_value: 2_650_000,
  total_inventory: 3180,
  unsold_avg_age_days: 46,
  unsold_fresh: 210,
  unsold_aging: 180,
  unsold_stale: 90,
  unsold_with_reserve_count: 120,
  unsold_with_reserve_value: 980_000,
  ended_lots_sold: 2410,
  week_current: 3_120_000,
  week_previous: 2_860_000,
  month_current: 12_400_000,
  month_previous: 11_050_000,
  auctions: Array.from({ length: 10 }, (_, i) => ({
    auction_number: `MOCK-${1000 + i}`,
    total_bid_amount: 300_000 + i * 45_000,
  })),
  branches: BRANCHES.map((branch, i) => ({ branch, bid_amount: 4_200_000 - i * 550_000 })),
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    bid_amount: Math.round(200_000 + Math.sin(hour / 3) * 150_000 + hour * 8_000),
  })),
};

export const MOCK_LEADERBOARDS = {
  vendors: VENDORS.map((vendor, i) => ({ vendor, bid_amount: 1_800_000 - i * 220_000, lots: 260 - i * 30 })),
  bidders: BIDDERS.map((bidder_name, i) => ({ bidder_name, bid_amount: 640_000 - i * 70_000, wins: 38 - i * 4 })),
  composition: {
    new_bidders: 340,
    returning_bidders: 980,
    new_bidders_bid_amount: 3_100_000,
    returning_bidders_bid_amount: 15_350_000,
  },
  perAuctionComposition: Array.from({ length: 8 }, (_, i) => ({
    auction_number: `MOCK-${1000 + i}`,
    new_bidders: 20 + i * 3,
    returning_bidders: 60 - i * 2,
    new_bidders_bid_amount: 180_000 + i * 12_000,
    returning_bidders_bid_amount: 520_000 - i * 9_000,
  })),
  newBidderTrend: Array.from({ length: 14 }, (_, i) => ({
    day: `2026-08-${String(i + 1).padStart(2, "0")}`,
    new_bidders: 10 + Math.round(Math.sin(i / 2) * 6),
  })),
};

export const MOCK_CATEGORIES = {
  categories: CATEGORIES.map((category, i) => ({ category, bid_amount: 5_200_000 - i * 900_000 })),
  channels: [
    { channel: "Online Bidding", bidAmount: 11_200_000, endedLotsListed: 1900, endedLotsSold: 1520 },
    { channel: "Live Auction", bidAmount: 4_600_000, endedLotsListed: 720, endedLotsSold: 610 },
    { channel: "Simulcast", bidAmount: 2_100_000, endedLotsListed: 240, endedLotsSold: 200 },
    { channel: "Buy Now", bidAmount: 550_000, endedLotsListed: 30, endedLotsSold: 30 },
  ],
};

export const MOCK_LOTS = {
  lots: Array.from({ length: 30 }, (_, i) => {
    const bid = 4_000 + i * 1_250;
    const statuses = ["Sold", "For Approval", "Unsold"];
    return {
      lotNumber: `L-${2000 + i}`,
      item: `Sample Item ${i + 1}`,
      vendor: VENDORS[i % VENDORS.length],
      category: CATEGORIES[i % CATEGORIES.length],
      status: statuses[i % statuses.length],
      soldPrice: bid,
      approval: i % 3 === 1 ? "Pending" : "",
      totalBidAmount: bid,
      buyersPremium: Math.round(bid * 0.12),
      serviceFee: Math.round(bid * 0.06),
      reservedPrice: i % 4 === 0 ? Math.round(bid * 0.9) : 0,
      branch: BRANCHES[i % BRANCHES.length],
      auctionNumber: `MOCK-${1000 + (i % 10)}`,
    };
  }),
};

export const MOCK_PAYABLES = {
  pending_count: 156,
  total_backlog: 4_320_000,
  avg_age_days: 27,
  aged_0_30: 2_600_000,
  aged_31_60: 1_120_000,
  aged_60_plus: 600_000,
  byVendor: VENDORS.map((vendor, i) => ({ vendor, amount: 900_000 - i * 110_000, lots: 80 - i * 8 })),
  byBranch: BRANCHES.map((store_name, i) => ({ store_name, amount: 820_000 - i * 90_000, lots: 60 - i * 6 })),
  byStatus: [
    { payment_status: "On Process", amount: 2_900_000, lots: 210 },
    { payment_status: "Available", amount: 1_420_000, lots: 98 },
  ],
  detail: Array.from({ length: 25 }, (_, i) => ({
    vendor: VENDORS[i % VENDORS.length],
    store_name: BRANCHES[i % BRANCHES.length],
    auction_number: `MOCK-${1000 + (i % 10)}`,
    lot_number: `L-${2000 + i}`,
    item_master_name: `Sample Item ${i + 1}`,
    payable_amount: 5_000 + i * 800,
    payment_status: i % 2 === 0 ? "On Process" : "Available",
    generate_date: `2026-0${(i % 6) + 1}-15`,
    days_outstanding: 10 + i * 3,
  })),
};

export const MOCK_RESERVE_PERFORMANCE = {
  below_count: 180,
  below_value: 620_000,
  at_count: 90,
  at_value: 310_000,
  above_count: 260,
  above_value: 1_450_000,
};

export const MOCK_TRENDS = {
  years: [2022, 2023, 2024, 2025, 2026],
  metrics: [
    { key: "serviceIncomeMargin", label: "Service Income Margin", unit: "pct", trend: "IMPROVING", values: [14.2, 15.1, 15.8, 16.4, 17.0] },
    { key: "itemsPerAuction", label: "Items per Auction", unit: "count", trend: "STABLE", values: [68, 70, 71, 69, 72] },
    { key: "avgAuctionsPerBranch", label: "Avg Auctions per Branch", unit: "count", trend: "STABLE", values: [6, 6, 7, 7, 7] },
    { key: "bidderToAuctionRatio", label: "Bidder-to-Auction Ratio", unit: "ratio", trend: "IMPROVING", values: [12.4, 13.1, 13.9, 14.6, 15.2] },
    { key: "avgBidPerItem", label: "Avg Bid per Item", unit: "currency", trend: "IMPROVING", values: [4200, 4450, 4600, 4820, 5100] },
    { key: "sellThroughRate", label: "Sell-Through Rate", unit: "pct", trend: "VOLATILE", values: [72, 78, 69, 81, 75] },
  ],
};

export const MOCK_UPCOMING_AUCTIONS = Array.from({ length: 6 }, (_, i) => ({
  auction_id: 9000 + i,
  auction_number: `MOCK-${2000 + i}`,
  store_name: BRANCHES[i % BRANCHES.length],
  category: "Online Bidding",
  starting_time: `2026-08-${20 + i} 10:00:00`,
  ending_time: `2026-08-${20 + i} 18:00:00`,
  lot_count: 40 + i * 5,
  paid_count: 0,
}));

export const MOCK_LIVE_AUCTIONS = Array.from({ length: 3 }, (_, a) => ({
  auctionNumber: `MOCK-${3000 + a}`,
  store: BRANCHES[a % BRANCHES.length],
  auctionType: "Online Bidding",
  closesInSec: 3600 + a * 900,
  lots: Array.from({ length: 5 }, (_, l) => ({
    key: `MOCK-${3000 + a}::${l}`,
    postingId: 5000 + a * 10 + l,
    lotNumber: `L-${l + 1}`,
    item: `Sample Item ${l + 1}`,
    currentBid: 3_000 + l * 850,
    startingBid: 1_500,
    closesInSec: 3600 + a * 900,
    totalDurationSec: 7200,
  })),
}));

export const MOCK_LOT_DETAIL = {
  bids: Array.from({ length: 6 }, (_, i) => ({
    bidderNumber: `B-${100 + i}`,
    amount: 1_500 + i * 400,
    timestamp: Date.parse("2026-08-19T10:00:00") + i * 60_000,
  })),
  bidsError: null,
  bidders: BIDDERS.slice(0, 4).map((name, i) => ({ bidderNumber: `B-${100 + i}`, name })),
  biddersError: null,
  loading: false,
};

export const MOCK_STORE_DETAIL = {
  total_bid_amount: 2_180_000,
  ended_lots_listed: 340,
  ended_lots_sold: 268,
  total_auctions: 6,
  auctions: Array.from({ length: 6 }, (_, i) => ({
    auction_number: `MOCK-${1000 + i}`,
    total_bid_amount: 300_000 + i * 45_000,
  })),
  topVendors: VENDORS.map((vendor, i) => ({ vendor, bid_amount: 420_000 - i * 60_000, lots: 40 - i * 4 })),
};

export const MOCK_MARQUEE = {
  soldToday: 1_240_000,
  endingTodayCount: 3,
  endingSoon: [
    { auctionNumber: "MOCK-3000", store: "CEBU", ending: new Date(), closesInSec: 1800 },
    { auctionNumber: "MOCK-3001", store: "ILOILO", ending: new Date(), closesInSec: 3200 },
  ],
};
