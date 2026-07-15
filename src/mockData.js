// Structured to mirror real query results from
// xv3.mart_auction_productivity_report and xv3.mart_auction_vendor_analysis
// Swap these constants for fetch() calls to your API layer when ready.

export const heroKPIs = {
  totalBidAmount: 4287650,
  totalBidAmountDeltaPct: 12.4,
  sellThroughRate: 78.2,
  sellThroughDeltaPct: 3.1,
  activeAuctionsNow: 3,
  buyersPremiumPlusFees: 612340,
  buyersPremiumDeltaPct: 8.9,
  lotsSold: 341,
  lotsListed: 436,
};

export const categoryBreakdown = [
  { category: "General Merchandise", bidAmount: 1820400, share: 42.5 },
  { category: "Bulk Auction", bidAmount: 1120200, share: 26.1 },
  { category: "Equipment & Industrial", bidAmount: 812300, share: 18.9 },
  { category: "Vehicles & Automotive", bidAmount: 534750, share: 12.5 },
];

export const topVendors = [
  { vendor: "Tasman Industrial Corporation", bidAmount: 428900, lots: 22 },
  { vendor: "JS Trading Co.", bidAmount: 312450, lots: 18 },
  { vendor: "Northgate Surplus Inc.", bidAmount: 287600, lots: 14 },
  { vendor: "Pacific Rim Liquidators", bidAmount: 241300, lots: 11 },
  { vendor: "Manila Bay Consignors", bidAmount: 198750, lots: 9 },
];

export const topBidders = [
  { bidder: "Victor Lorenzo Rosales", bidAmount: 156200, wins: 12 },
  { bidder: "Ma. Theresa Cabrera", bidAmount: 134800, wins: 9 },
  { bidder: "Rommel Dizon", bidAmount: 121450, wins: 8 },
  { bidder: "Angelica Fuentes", bidAmount: 98700, wins: 7 },
  { bidder: "Kevin Uy", bidAmount: 87300, wins: 6 },
];

export const moneyFlow = [
  { stage: "Bid Amount", value: 4287650, type: "total" },
  { stage: "Commission", value: -385890, type: "deduction" },
  { stage: "Buyer's Premium", value: -428765, type: "deduction" },
  { stage: "Service Fee", value: -183575, type: "deduction" },
  { stage: "Net Vendor Payable", value: 3289420, type: "result" },
];

export const hourlyTrend = [
  { hour: "8AM", bidAmount: 42000 },
  { hour: "9AM", bidAmount: 118000 },
  { hour: "10AM", bidAmount: 264000 },
  { hour: "11AM", bidAmount: 398000 },
  { hour: "12PM", bidAmount: 312000 },
  { hour: "1PM", bidAmount: 289000 },
  { hour: "2PM", bidAmount: 456000 },
  { hour: "3PM", bidAmount: 612000 },
  { hour: "4PM", bidAmount: 578000 },
  { hour: "5PM", bidAmount: 690000 },
  { hour: "6PM", bidAmount: 528000 },
];

export const operationsDetail = [
  { lotNumber: "GM-2607-041", vendor: "Tasman Industrial Corporation", category: "General Merchandise", status: "Sold", soldPrice: 12400, approval: "Approved" },
  { lotNumber: "BA-2607-018", vendor: "JS Trading Co.", category: "Bulk Auction", status: "For Approval", soldPrice: 8900, approval: "Pending" },
  { lotNumber: "EI-2607-009", vendor: "Northgate Surplus Inc.", category: "Equipment & Industrial", status: "Sold", soldPrice: 45200, approval: "Approved" },
  { lotNumber: "VA-2607-004", vendor: "Pacific Rim Liquidators", category: "Vehicles & Automotive", status: "Unsold", soldPrice: 0, approval: "—" },
  { lotNumber: "GM-2607-042", vendor: "Manila Bay Consignors", category: "General Merchandise", status: "Sold", soldPrice: 3200, approval: "Approved" },
];

// Reserve price performance — how sold lots landed relative to vendor's minimum acceptable price
export const reservePerformance = {
  belowReserve: { count: 18, value: 214800, pct: 12.4 },
  atReserve: { count: 62, value: 892400, pct: 42.7 },
  aboveReserve: { count: 66, value: 981200, pct: 44.9 },
};

// Unsold inventory — value at stake, not just count
export const unsoldLots = {
  count: 95,
  value: 1428600,
  deltaPct: -6.2, // negative = improving (fewer unsold vs last week)
};

// Branch-level bid amount breakdown
export const branchBreakdown = [
  { branch: "HMR ARANETA", bidAmount: 892400, share: 20.8 },
  { branch: "CENTRAL WAREHOUSE", bidAmount: 714200, share: 16.7 },
  { branch: "PIONEER AUCTION", bidAmount: 658900, share: 15.4 },
  { branch: "SUCAT AUCTION", bidAmount: 512300, share: 12.0 },
  { branch: "AUTO AUCTION", bidAmount: 421700, share: 9.8 },
  { branch: "SUBIC MAIN", bidAmount: 387500, share: 9.0 },
  { branch: "CEBU", bidAmount: 298600, share: 7.0 },
  { branch: "Others", bidAmount: 402050, share: 9.3 },
];

// New vs returning bidder composition
export const bidderComposition = {
  newBidders: 47,
  returningBidders: 138,
  newBidderTrend: [
    { week: "W1", newBidders: 32 },
    { week: "W2", newBidders: 38 },
    { week: "W3", newBidders: 41 },
    { week: "W4", newBidders: 47 },
  ],
};

// Vendor Payables Backlog — accumulated, unremitted
export const vendorPayablesBacklog = {
  totalBacklog: 2847600,
  aging: [
    { bucket: "0–30 days", value: 1620400 },
    { bucket: "31–60 days", value: 842100 },
    { bucket: "60+ days", value: 385100 },
  ],
};

// Per-category datasets, for the category-specific tabs.
// Volume/sell-through/reserve/fee figures below are real; topVendors/topBidders
// remain placeholder mock until per-category vendor/bidder breakdowns are provided.
export const categoryDetail = {
  "General Merchandise": {
    totalAuctions: 101,
    lotsListed: 2947,
    lotsSold: 2814,
    lotsUnsold: 84,
    sellThroughRate: 95,
    totalBidAmount: 2925110,
    avgBidPerLot: 1039,
    soldAboveReserve: 2764,
    soldAtOrBelowReserve: 50,
    pctSoldAboveReserve: 98,
    avgBuyersPremiumPct: 15,
    avgCommissionPct: 17,
    avgPremiumOverReservePct: -71,
    topVendors: [
      { vendor: "Manila Bay Consignors", bidAmount: 198750, lots: 22 },
      { vendor: "JS Trading Co.", bidAmount: 156400, lots: 17 },
      { vendor: "Northgate Surplus Inc.", bidAmount: 121300, lots: 14 },
    ],
    topBidders: [
      { bidder: "Ma. Theresa Cabrera", bidAmount: 84200, wins: 6 },
      { bidder: "Kevin Uy", bidAmount: 71300, wins: 5 },
      { bidder: "Angelica Fuentes", bidAmount: 58900, wins: 4 },
    ],
  },
  "Equipment & Industrial": {
    totalAuctions: 124,
    lotsListed: 2606,
    lotsSold: 1561,
    lotsUnsold: 850,
    sellThroughRate: 60,
    totalBidAmount: 6954834,
    avgBidPerLot: 4455,
    soldAboveReserve: 1522,
    soldAtOrBelowReserve: 39,
    pctSoldAboveReserve: 98,
    avgBuyersPremiumPct: 15,
    avgCommissionPct: 18,
    avgPremiumOverReservePct: 49,
    topVendors: [
      { vendor: "Northgate Surplus Inc.", bidAmount: 166500, lots: 8 },
      { vendor: "Tasman Industrial Corporation", bidAmount: 142900, lots: 7 },
      { vendor: "JS Trading Co.", bidAmount: 87300, lots: 5 },
    ],
    topBidders: [
      { bidder: "Rommel Dizon", bidAmount: 78200, wins: 4 },
      { bidder: "Angelica Fuentes", bidAmount: 61400, wins: 3 },
      { bidder: "Victor Lorenzo Rosales", bidAmount: 52100, wins: 3 },
    ],
  },
  "Bulk Auction": {
    totalAuctions: 226,
    lotsListed: 4878,
    lotsSold: 3990,
    lotsUnsold: 518,
    sellThroughRate: 82,
    totalBidAmount: 3135154,
    avgBidPerLot: 786,
    soldAboveReserve: 3976,
    soldAtOrBelowReserve: 14,
    pctSoldAboveReserve: 100,
    avgBuyersPremiumPct: 15,
    avgCommissionPct: 17,
    avgPremiumOverReservePct: 37,
    topVendors: [
      { vendor: "Pacific Rim Liquidators", bidAmount: 241300, lots: 11 },
      { vendor: "Tasman Industrial Corporation", bidAmount: 189400, lots: 9 },
      { vendor: "Manila Bay Consignors", bidAmount: 98200, lots: 6 },
    ],
    topBidders: [
      { bidder: "Victor Lorenzo Rosales", bidAmount: 112400, wins: 8 },
      { bidder: "Rommel Dizon", bidAmount: 87600, wins: 6 },
      { bidder: "Kevin Uy", bidAmount: 43200, wins: 3 },
    ],
  },
  "Vehicles & Automotive": {
    totalAuctions: 32,
    lotsListed: 227,
    lotsSold: 147,
    lotsUnsold: 64,
    sellThroughRate: 65,
    totalBidAmount: 12168229,
    avgBidPerLot: 82777,
    soldAboveReserve: 88,
    soldAtOrBelowReserve: 59,
    pctSoldAboveReserve: 60,
    avgBuyersPremiumPct: 10,
    avgCommissionPct: 12,
    avgPremiumOverReservePct: 54,
    topVendors: [
      { vendor: "Pacific Rim Liquidators", bidAmount: 187400, lots: 5 },
      { vendor: "Northgate Surplus Inc.", bidAmount: 134200, lots: 4 },
      { vendor: "Tasman Industrial Corporation", bidAmount: 98600, lots: 3 },
    ],
    topBidders: [
      { bidder: "Kevin Uy", bidAmount: 96400, wins: 2 },
      { bidder: "Ma. Theresa Cabrera", bidAmount: 74200, wins: 2 },
      { bidder: "Rommel Dizon", bidAmount: 51800, wins: 1 },
    ],
  },
};

export const BRANCH_NAMES = [
  "CEBU",
  "ILOILO",
  "DAU",
  "SUBIC",
  "ONSITE",
  "REAL ESTATE",
  "AUTO AUCTION",
  "HMR ARANETA",
  "HRL WAREHOUSE",
  "PIONEER AUCTION",
  "CANLUBANG",
  "SUCAT AUCTION",
  "SUBIC MAIN",
  "CENTRAL WAREHOUSE",
  "WEST SERVICE ROAD",
  "CAGAYAN DE ORO AUCTION",
  "HMRDEVZ TEST WAREHOUSE",
  "INTERNATIONAL STOCK LOTS",
  "MEGA AUCTION SHOWROOM",
];

export const ALL_STORES = "All Stores";
export const STORE_OPTIONS = [ALL_STORES, ...BRANCH_NAMES];

// Real year-over-year figures, 2020–2026
export const yearlyTrends = {
  years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
  metrics: [
    {
      key: "serviceIncomeMargin",
      label: "Service Income Margin",
      unit: "pct",
      trend: "STABLE",
      values: [30.9, 32.5, 23.3, 15.6, 19, 17.5, 25],
    },
    {
      key: "itemsPerAuction",
      label: "Items per Auction",
      unit: "count",
      trend: "DECLINING",
      values: [163, 73, 54, 56, 37, 25, 19],
    },
    {
      key: "avgAuctionsPerBranch",
      label: "Avg Auctions per Branch",
      unit: "count",
      trend: "DECLINING",
      values: [30, 78, 132, 326, 244, 149, 49],
    },
    {
      key: "bidderToAuctionRatio",
      label: "Bidder-to-Auction Ratio",
      unit: "ratio",
      trend: "IMPROVING",
      values: [6.28, 2.54, 1.1, 0.42, 0.53, 0.48, 0.67],
    },
    {
      key: "avgBidPerItem",
      label: "Avg Bid per Item",
      unit: "currency",
      trend: "VOLATILE",
      values: [289.18, 372.34, 1134.06, 2936.02, 4619.43, 4059.12, 2957.9],
    },
    // Mock — real sell-through-rate series wasn't provided yet
    {
      key: "sellThroughRate",
      label: "Sell-Through Rate",
      unit: "pct",
      trend: "STABLE",
      values: [79, 82, 85, 81, 77, 83, 86],
    },
  ],
};

// Mock — breakdown by sale channel, pending real figures
export const auctionTypeBreakdown = [
  { type: "Live Auction", bidAmount: 2120000, lots: 289, sellThroughRate: 71 },
  { type: "Online Bidding", bidAmount: 1850000, lots: 612, sellThroughRate: 81 },
  { type: "Live Simulcast", bidAmount: 1240000, lots: 340, sellThroughRate: 76 },
  { type: "Negotiated", bidAmount: 980000, lots: 128, sellThroughRate: 92 },
  { type: "Buy Now", bidAmount: 540000, lots: 410, sellThroughRate: 88 },
];

// Deterministic hash → stable "random" numbers, so mock values don't
// jump around between reloads but no one had to hand-write 19 blocks.
function seedFraction(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (h % 10000) / 10000;
}
function seedRange(key, min, max) {
  return min + seedFraction(key) * (max - min);
}

const VENDOR_POOL = [
  "Manila Bay Consignors",
  "JS Trading Co.",
  "Northgate Surplus Inc.",
  "Pacific Rim Liquidators",
  "Tasman Industrial Corporation",
];

// Mock — per-branch detail, pending real figures
export const storeDetail = Object.fromEntries(
  BRANCH_NAMES.map((name) => {
    const lotsListed = Math.round(seedRange(name + ":listed", 90, 420));
    const sellThroughRate = Math.round(seedRange(name + ":sell", 55, 96));
    const lotsSold = Math.round(lotsListed * (sellThroughRate / 100));
    const avgBidPerItem = Math.round(seedRange(name + ":avg", 600, 5200));
    const totalBidAmount = Math.round(lotsSold * avgBidPerItem);
    const activeAuctions = Math.floor(seedRange(name + ":active", 0, 3.999));

    const startIdx = Math.floor(seedFraction(name + ":vendorstart") * VENDOR_POOL.length);
    const topVendors = [0, 1, 2].map((i) => {
      const vendor = VENDOR_POOL[(startIdx + i) % VENDOR_POOL.length];
      return {
        vendor,
        bidAmount: Math.round(seedRange(name + vendor, 15000, 150000)),
        lots: Math.round(seedRange(name + vendor + ":lots", 2, 14)),
      };
    });

    return [name, { totalBidAmount, sellThroughRate, lotsSold, lotsListed, avgBidPerItem, activeAuctions, topVendors }];
  })
);

const BIDDER_POOL = [
  "Victor Lorenzo Rosales",
  "Ma. Theresa Cabrera",
  "Rommel Dizon",
  "Angelica Fuentes",
  "Kevin Uy",
];

const GLOBAL_TOTAL_BID = heroKPIs.totalBidAmount;

// Derives a full store-scoped Overview dataset from the global mock shapes —
// same categories/hours/stages, magnitudes scaled + seeded-jittered per store,
// so switching the store dropdown changes every widget, not just the Stores tab.
export function getOverviewForStore(storeName) {
  // "All Stores" IS the original whole-company mock — every per-store
  // variant is a scaled/jittered derivative of these same numbers.
  if (storeName === ALL_STORES) {
    return {
      heroKPIs,
      categoryBreakdown,
      topVendors,
      topBidders,
      moneyFlow,
      hourlyTrend,
      operationsDetail,
      reservePerformance,
      unsoldLots,
      bidderComposition,
      vendorPayablesBacklog,
    };
  }

  const base = storeDetail[storeName];
  const scale = base.totalBidAmount / GLOBAL_TOTAL_BID;

  const heroKPIsForStore = {
    totalBidAmount: base.totalBidAmount,
    totalBidAmountDeltaPct: Number(seedRange(storeName + ":d1", -8, 18).toFixed(1)),
    sellThroughRate: base.sellThroughRate,
    sellThroughDeltaPct: Number(seedRange(storeName + ":d2", -5, 5).toFixed(1)),
    activeAuctionsNow: base.activeAuctions,
    buyersPremiumPlusFees: Math.round(base.totalBidAmount * seedRange(storeName + ":feePct", 0.08, 0.18)),
    buyersPremiumDeltaPct: Number(seedRange(storeName + ":d3", -6, 12).toFixed(1)),
    lotsSold: base.lotsSold,
    lotsListed: base.lotsListed,
  };

  const categoryBreakdownForStore = (() => {
    const raw = categoryBreakdown.map((c) => ({
      category: c.category,
      bidAmount: Math.round(c.bidAmount * scale * seedRange(storeName + c.category, 0.7, 1.3)),
    }));
    const total = raw.reduce((s, r) => s + r.bidAmount, 0) || 1;
    return raw.map((r) => ({ ...r, share: Number(((r.bidAmount / total) * 100).toFixed(1)) }));
  })();

  const topBiddersForStore = (() => {
    const startIdx = Math.floor(seedFraction(storeName + ":biddertart") * BIDDER_POOL.length);
    return [0, 1, 2, 3, 4]
      .map((i) => {
        const bidder = BIDDER_POOL[(startIdx + i) % BIDDER_POOL.length];
        return {
          bidder,
          bidAmount: Math.round(seedRange(storeName + bidder, 8000, 90000)),
          wins: Math.round(seedRange(storeName + bidder + ":wins", 1, 14)),
        };
      })
      .sort((a, b) => b.bidAmount - a.bidAmount);
  })();

  const moneyFlowForStore = (() => {
    const bidAmount = base.totalBidAmount;
    const commission = Math.round(bidAmount * seedRange(storeName + ":commissionPct", 0.08, 0.14));
    const buyersPremium = Math.round(bidAmount * seedRange(storeName + ":bpPct", 0.08, 0.12));
    const serviceFee = Math.round(bidAmount * seedRange(storeName + ":sfPct", 0.03, 0.06));
    return [
      { stage: "Bid Amount", value: bidAmount, type: "total" },
      { stage: "Commission", value: -commission, type: "deduction" },
      { stage: "Buyer's Premium", value: -buyersPremium, type: "deduction" },
      { stage: "Service Fee", value: -serviceFee, type: "deduction" },
      { stage: "Net Vendor Payable", value: bidAmount - commission - buyersPremium - serviceFee, type: "result" },
    ];
  })();

  const hourlyTrendForStore = hourlyTrend.map((h) => ({
    hour: h.hour,
    bidAmount: Math.round(h.bidAmount * scale * seedRange(storeName + h.hour, 0.7, 1.3)),
  }));

  const operationsDetailForStore = categoryBreakdownForStore.map((c, i) => {
    const vendor = base.topVendors[i % base.topVendors.length].vendor;
    const statusRoll = seedFraction(storeName + c.category + ":status");
    const status = statusRoll < 0.15 ? "Unsold" : statusRoll < 0.3 ? "For Approval" : "Sold";
    return {
      lotNumber: `${storeName.slice(0, 2)}-${2600 + i}-${String(i + 1).padStart(3, "0")}`,
      vendor,
      category: c.category,
      status,
      soldPrice: status === "Unsold" ? 0 : Math.round(seedRange(storeName + c.category + ":price", 1500, 48000)),
      approval: status === "Sold" ? "Approved" : status === "For Approval" ? "Pending" : "—",
    };
  });

  const reservePerformanceForStore = (() => {
    const belowPct = Number(seedRange(storeName + ":below", 6, 20).toFixed(1));
    const abovePct = Number(seedRange(storeName + ":above", 35, 55).toFixed(1));
    const atPct = Number((100 - belowPct - abovePct).toFixed(1));
    const mk = (pct) => ({
      count: Math.round((pct / 100) * base.lotsSold),
      value: Math.round((pct / 100) * base.totalBidAmount),
      pct,
    });
    return { belowReserve: mk(belowPct), atReserve: mk(atPct), aboveReserve: mk(abovePct) };
  })();

  const unsoldLotsForStore = (() => {
    const count = Math.max(0, base.lotsListed - base.lotsSold);
    return {
      count,
      value: Math.round(count * base.avgBidPerItem * seedRange(storeName + ":unsoldVal", 0.6, 1.1)),
      deltaPct: Number(seedRange(storeName + ":unsoldDelta", -15, 15).toFixed(1)),
    };
  })();

  const bidderCompositionForStore = (() => {
    const newBidders = Math.round(seedRange(storeName + ":newBidders", 5, 60));
    const returningBidders = Math.round(seedRange(storeName + ":returningBidders", 20, 160));
    const newBidderTrend = ["W1", "W2", "W3", "W4"].map((week, i) => ({
      week,
      newBidders: Math.round(seedRange(storeName + week, newBidders * 0.6, newBidders * (1 + i * 0.1))),
    }));
    return { newBidders, returningBidders, newBidderTrend };
  })();

  const vendorPayablesBacklogForStore = (() => {
    const totalBacklog = Math.round(base.totalBidAmount * seedRange(storeName + ":backlogPct", 0.15, 0.45));
    const p1 = seedRange(storeName + ":age1", 0.45, 0.65);
    const p2 = seedRange(storeName + ":age2", 0.2, 0.35);
    const p3 = Math.max(0, 1 - p1 - p2);
    return {
      totalBacklog,
      aging: [
        { bucket: "0–30 days", value: Math.round(totalBacklog * p1) },
        { bucket: "31–60 days", value: Math.round(totalBacklog * p2) },
        { bucket: "60+ days", value: Math.round(totalBacklog * p3) },
      ],
    };
  })();

  return {
    heroKPIs: heroKPIsForStore,
    categoryBreakdown: categoryBreakdownForStore,
    topVendors: base.topVendors,
    topBidders: topBiddersForStore,
    moneyFlow: moneyFlowForStore,
    hourlyTrend: hourlyTrendForStore,
    operationsDetail: operationsDetailForStore,
    reservePerformance: reservePerformanceForStore,
    unsoldLots: unsoldLotsForStore,
    bidderComposition: bidderCompositionForStore,
    vendorPayablesBacklog: vendorPayablesBacklogForStore,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Derives a store-scoped version of a category's detail — same shape as
// categoryDetail[category], scaled + jittered so every tab (not just
// Overview) responds to the store dropdown.
export function getCategoryForStore(category, storeName) {
  const d = categoryDetail[category];
  if (storeName === ALL_STORES) return d;

  const base = storeDetail[storeName];
  const scale = base.totalBidAmount / GLOBAL_TOTAL_BID;
  const seed = storeName + category;

  const totalAuctions = Math.max(1, Math.round(d.totalAuctions * scale * seedRange(seed + ":auc", 0.6, 1.4)));
  const lotsListed = Math.max(5, Math.round(d.lotsListed * scale * seedRange(seed + ":listed", 0.6, 1.4)));
  const sellThroughRate = clamp(Math.round(d.sellThroughRate + seedRange(seed + ":sell", -8, 8)), 30, 100);
  const lotsSold = Math.round(lotsListed * (sellThroughRate / 100));
  const lotsUnsold = Math.max(0, lotsListed - lotsSold);
  const avgBidPerLot = Math.round(d.avgBidPerLot * seedRange(seed + ":avg", 0.85, 1.15));
  const totalBidAmount = avgBidPerLot * lotsSold;
  const pctSoldAboveReserve = clamp(Math.round(d.pctSoldAboveReserve + seedRange(seed + ":reserve", -10, 6)), 40, 100);
  const soldAboveReserve = Math.round((lotsSold * pctSoldAboveReserve) / 100);
  const soldAtOrBelowReserve = Math.max(0, lotsSold - soldAboveReserve);
  const avgPremiumOverReservePct = Math.round(d.avgPremiumOverReservePct + seedRange(seed + ":premium", -15, 15));

  const vStart = Math.floor(seedFraction(seed + ":vstart") * VENDOR_POOL.length);
  const topVendors = [0, 1, 2].map((i) => {
    const vendor = VENDOR_POOL[(vStart + i) % VENDOR_POOL.length];
    return {
      vendor,
      bidAmount: Math.round(seedRange(seed + vendor, 8000, 90000)),
      lots: Math.round(seedRange(seed + vendor + ":lots", 2, 12)),
    };
  });
  const bStart = Math.floor(seedFraction(seed + ":bstart") * BIDDER_POOL.length);
  const topBidders = [0, 1, 2].map((i) => {
    const bidder = BIDDER_POOL[(bStart + i) % BIDDER_POOL.length];
    return {
      bidder,
      bidAmount: Math.round(seedRange(seed + bidder, 5000, 60000)),
      wins: Math.round(seedRange(seed + bidder + ":wins", 1, 8)),
    };
  });

  return {
    totalAuctions,
    lotsListed,
    lotsSold,
    lotsUnsold,
    sellThroughRate,
    totalBidAmount,
    avgBidPerLot,
    soldAboveReserve,
    soldAtOrBelowReserve,
    pctSoldAboveReserve,
    avgBuyersPremiumPct: d.avgBuyersPremiumPct,
    avgCommissionPct: d.avgCommissionPct,
    avgPremiumOverReservePct,
    topVendors,
    topBidders,
  };
}

// Derives a store-scoped yearly trend series — same shape/labels as
// yearlyTrends, values jittered per store (avgBidPerItem anchored to that
// store's known average so it stays consistent with the Stores tab).
export function getYearlyTrendsForStore(storeName) {
  if (storeName === ALL_STORES) return yearlyTrends;

  const base = storeDetail[storeName];
  const { years } = yearlyTrends;
  const globalAvgBidLast = yearlyTrends.metrics.find((m) => m.key === "avgBidPerItem").values.at(-1);
  const avgBidAnchor = base.avgBidPerItem / globalAvgBidLast;

  const metrics = yearlyTrends.metrics.map((m) => {
    if (m.key === "avgBidPerItem") {
      const values = m.values.map((v, i) =>
        Number((v * avgBidAnchor * seedRange(storeName + m.key + years[i], 0.9, 1.1)).toFixed(2))
      );
      return { ...m, values };
    }
    const values = m.values.map((v, i) => {
      const jitter = seedRange(storeName + m.key + years[i], 0.82, 1.18);
      const val = v * jitter;
      return m.unit === "count" ? Math.max(1, Math.round(val)) : Number(val.toFixed(m.unit === "ratio" ? 2 : 1));
    });
    return { ...m, values };
  });

  return { years, metrics };
}

// Derives a store-scoped sale-channel breakdown.
export function getAuctionTypesForStore(storeName) {
  if (storeName === ALL_STORES) return auctionTypeBreakdown;

  const base = storeDetail[storeName];
  const scale = base.totalBidAmount / GLOBAL_TOTAL_BID;
  return auctionTypeBreakdown.map((t) => {
    const seed = storeName + t.type;
    return {
      type: t.type,
      bidAmount: Math.max(0, Math.round(t.bidAmount * scale * seedRange(seed + ":bid", 0.6, 1.4))),
      lots: Math.max(0, Math.round(t.lots * scale * seedRange(seed + ":lots", 0.6, 1.4))),
      sellThroughRate: clamp(Math.round(t.sellThroughRate + seedRange(seed + ":sell", -10, 10)), 30, 100),
    };
  });
}

// Every live item is tied to a real category, not picked independently —
// so grouping by category later reflects what's actually in the lot.
const LIVE_ITEM_POOL = [
  { item: 'Samsung 55" QLED TV (Grade A)', category: "General Merchandise" },
  { item: "Dyson V11 Cordless Vacuum", category: "General Merchandise" },
  { item: "LG Front-Load Washing Machine", category: "General Merchandise" },
  { item: "Yamaha Upright Piano", category: "General Merchandise" },
  { item: "Office Swivel Chair (Set of 6)", category: "General Merchandise" },
  { item: "Bulk Lot: Assorted Kitchenware (40 pcs)", category: "Bulk Auction" },
  { item: "Bulk Lot: Mixed Electronics (25 pcs)", category: "Bulk Auction" },
  { item: "Bulk Lot: Surplus Office Supplies (100 pcs)", category: "Bulk Auction" },
  { item: "Industrial Air Compressor 5HP", category: "Equipment & Industrial" },
  { item: "Stainless Steel Commercial Kitchen Rack", category: "Equipment & Industrial" },
  { item: "Manual Pallet Jack, 2-Ton Capacity", category: "Equipment & Industrial" },
  { item: "2019 Toyota Hiace (Used, Diesel)", category: "Vehicles & Automotive" },
  { item: "2017 Honda Click 125i (Motorcycle)", category: "Vehicles & Automotive" },
  { item: "Isuzu Elf Delivery Truck", category: "Vehicles & Automotive" },
];

// Derives a store-scoped set of currently-live lots.
export function getLiveLotsForStore(storeName) {
  if (storeName === ALL_STORES) {
    return BRANCH_NAMES.flatMap((name) => getLiveLotsForStore(name));
  }

  const count = Math.floor(seedRange(storeName + ":livecount", 0, 4.999));
  return Array.from({ length: count }, (_, i) => {
    const { item, category } =
      LIVE_ITEM_POOL[Math.floor(seedFraction(storeName + ":liveitem" + i) * LIVE_ITEM_POOL.length)];
    const currentBid = Math.round(seedRange(storeName + ":livebid" + i, 3000, 60000));
    const bidders = Math.round(seedRange(storeName + ":livebidders" + i, 2, 14));
    const closesInSec = Math.round(seedRange(storeName + ":liveclose" + i, 15, 620));
    return {
      lotNumber: `${storeName.slice(0, 2).toUpperCase()}-LIVE-${i + 1}`,
      item,
      category,
      store: storeName,
      currentBid,
      bidders,
      closesInSec,
      status: closesInSec <= 60 ? "Closing Soon" : "Active",
    };
  });
}

export const CATEGORY_NAMES = categoryBreakdown.map((c) => c.category);

// storeDetail has no "All Stores" key — synthesize it from the same
// whole-company constants getOverviewForStore("All Stores") uses, so the
// Stores tab's aggregate lines up with every other tab's aggregate.
export function getStoreDetail(storeName) {
  if (storeName === ALL_STORES) {
    return {
      totalBidAmount: heroKPIs.totalBidAmount,
      sellThroughRate: heroKPIs.sellThroughRate,
      lotsSold: heroKPIs.lotsSold,
      lotsListed: heroKPIs.lotsListed,
      avgBidPerItem: Math.round(heroKPIs.totalBidAmount / heroKPIs.lotsSold),
      activeAuctions: heroKPIs.activeAuctionsNow,
      topVendors: topVendors.slice(0, 3),
    };
  }
  return storeDetail[storeName];
}
