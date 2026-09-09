// HRH Online — MOCK DATA LAYER (Phase 2, UI/UX only).
//
// Every number in this file is a fabricated demo fixture for visualization
// purposes only. NONE of it is reconciled HMR business data. Pages import
// from here rather than embedding numbers inline, so the eventual swap to
// real ClickHouse/GA4/TikTok/Shopee API responses only touches this
// boundary, never the page components themselves.

const WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

// ---------------------------------------------------------------------
// Executive Overview
// ---------------------------------------------------------------------
export const overview = {
  kpis: {
    gmv: { value: 18_420_000, delta: 8.4 },
    nmv: { value: 15_960_000, delta: 6.9 },
    aov: { value: 1_434, delta: -1.2 },
    orders: { value: 12_840, delta: 4.1 },
    units: { value: 21_530, delta: 5.0 },
  },
  trend: WEEKS.map((label, i) => ({
    label,
    gmv: 1_900_000 + i * 120_000 + (i % 3 === 0 ? 90_000 : 0),
    nmv: 1_650_000 + i * 100_000 + (i % 3 === 0 ? 60_000 : 0),
  })),
  channelContribution: [
    { label: "HMRPH Online", value: 9_850_000, color: "#22304f" },
    { label: "TikTok", value: 5_120_000, color: "#d99a3d" },
    { label: "Shopee", value: 3_450_000, color: "#1baf7a" },
  ],
  orderStatus: [
    { label: "Paid", value: 11_260, color: "#22304f" },
    { label: "Pending", value: 780, color: "#d99a3d" },
    { label: "Cancelled", value: 590, color: "#e34948" },
  ],
  recentOrders: [
    { id: "ro1", orderNumber: "HRH-100482", date: "Sep 9", customer: "Maria Santos", channel: "HMRPH Online", status: "Paid", amount: 2_450 },
    { id: "ro2", orderNumber: "HRH-100481", date: "Sep 9", customer: "John Cruz", channel: "TikTok", status: "Paid", amount: 1_990 },
    { id: "ro3", orderNumber: "HRH-100480", date: "Sep 9", customer: "Ana Reyes", channel: "Shopee", status: "Pending", amount: 3_250 },
    { id: "ro4", orderNumber: "HRH-100479", date: "Sep 8", customer: "Luis Dela Cruz", channel: "HMRPH Online", status: "Paid", amount: 890 },
    { id: "ro5", orderNumber: "HRH-100478", date: "Sep 8", customer: "Karla Mendoza", channel: "TikTok", status: "Cancelled", amount: 1_200 },
  ],
};

// ---------------------------------------------------------------------
// Sales Analytics
// ---------------------------------------------------------------------
export const salesAnalytics = {
  kpis: {
    gmv: { value: 18_420_000, delta: 8.4 },
    nmv: { value: 15_960_000, delta: 6.9 },
    orders: { value: 12_840, delta: 4.1 },
    units: { value: 21_530, delta: 5.0 },
    aov: { value: 1_434, delta: -1.2 },
    voucherAssistedSales: { value: 2_310_000, delta: 12.7 },
  },
  channelTable: [
    { channel: "HMRPH Online", gmv: 9_850_000, nmv: 8_620_000, orders: 6_120, units: 10_340, aov: 1_609, cancellationRate: 3.8, returnRate: 1.4 },
    { channel: "TikTok", gmv: 5_120_000, nmv: 4_330_000, orders: 4_380, units: 7_260, aov: 1_169, cancellationRate: 6.1, returnRate: 2.2 },
    { channel: "Shopee", gmv: 3_450_000, nmv: 3_010_000, orders: 2_340, units: 3_930, aov: 1_474, cancellationRate: 4.4, returnRate: 1.8 },
  ],
  categoryContribution: [
    { label: "Apparel", value: 6_120_000, color: "#22304f" },
    { label: "Footwear", value: 4_050_000, color: "#d99a3d" },
    { label: "Bags", value: 3_210_000, color: "#1baf7a" },
    { label: "Accessories", value: 2_640_000, color: "#4a3aa7" },
    { label: "Home", value: 2_400_000, color: "#e34948" },
  ],
  departmentContribution: [
    { label: "Women's", value: 8_340_000, color: "#22304f" },
    { label: "Men's", value: 6_120_000, color: "#d99a3d" },
    { label: "Kids", value: 3_960_000, color: "#1baf7a" },
  ],
  topProducts: [
    { id: "tp1", product: "Denim Jacket – Classic Wash", category: "Apparel", gmv: 412_000, units: 340 },
    { id: "tp2", product: "Leather Crossbody Bag", category: "Bags", gmv: 388_500, units: 265 },
    { id: "tp3", product: "Running Sneakers – Low Top", category: "Footwear", gmv: 356_200, units: 298 },
    { id: "tp4", product: "Oversized Hoodie", category: "Apparel", gmv: 301_000, units: 410 },
    { id: "tp5", product: "Structured Tote", category: "Bags", gmv: 274_800, units: 190 },
  ],
  bottomProducts: [
    { id: "bp1", product: "Printed Silk Scarf", category: "Accessories", gmv: 8_400, units: 12 },
    { id: "bp2", product: "Canvas Espadrilles", category: "Footwear", gmv: 11_200, units: 18 },
    { id: "bp3", product: "Ceramic Table Vase", category: "Home", gmv: 12_900, units: 9 },
    { id: "bp4", product: "Beaded Anklet Set", category: "Accessories", gmv: 14_100, units: 22 },
    { id: "bp5", product: "Linen Throw Pillow", category: "Home", gmv: 15_600, units: 14 },
  ],
  // Payment Type and Fulfillment/Checkout Method are deliberately separate
  // dimensions — see PickupAtStore.jsx's own comment on the same rule.
  paymentType: [
    { label: "GCash", value: 6_540_000, color: "#22304f" },
    { label: "Credit/Debit Card", value: 4_980_000, color: "#d99a3d" },
    { label: "Cash on Delivery", value: 3_720_000, color: "#1baf7a" },
    { label: "Bank Transfer", value: 2_180_000, color: "#4a3aa7" },
    { label: "Store Cash", value: 1_000_000, color: "#e34948" },
  ],
  fulfillmentMethod: [
    { label: "Home Delivery", value: 14_500_000, color: "#22304f" },
    { label: "Pickup at Store", value: 3_920_000, color: "#d99a3d" },
  ],
};

// ---------------------------------------------------------------------
// Traffic & Conversion — GA4 reconciliation pending, demo data only.
// ---------------------------------------------------------------------
export const trafficConversion = {
  kpis: {
    sessions: { value: 486_200, delta: 5.2 },
    users: { value: 312_400, delta: 3.9 },
    engagedSessions: { value: 201_600, delta: 2.1 },
    conversionRate: { value: 2.64, delta: -0.3 },
    revenuePerSession: { value: 37.9, delta: 1.6 },
  },
  funnel: [
    { label: "Sessions", value: 486_200 },
    { label: "Engaged", value: 201_600 },
    { label: "Product View", value: 96_400 },
    { label: "Add to Cart", value: 38_900 },
    { label: "Order", value: 12_840 },
    { label: "Paid", value: 11_260 },
  ],
  conversionTrend: WEEKS.map((label, i) => ({ label, conversionRate: 2.2 + Math.sin(i / 2) * 0.3 + i * 0.03 })),
  trafficByChannel: [
    { label: "HMRPH Online", value: 210_400, color: "#22304f" },
    { label: "TikTok", value: 186_300, color: "#d99a3d" },
    { label: "Shopee", value: 89_500, color: "#1baf7a" },
  ],
  sourceMedium: [
    { id: "sm1", source: "tiktok / social", sessions: 154_200, users: 98_400, conversionRate: 2.1 },
    { id: "sm2", source: "google / organic", sessions: 121_800, users: 87_600, conversionRate: 3.4 },
    { id: "sm3", source: "shopee / marketplace", sessions: 89_500, users: 61_200, conversionRate: 2.9 },
    { id: "sm4", source: "facebook / paid", sessions: 68_300, users: 42_100, conversionRate: 1.8 },
    { id: "sm5", source: "direct / none", sessions: 52_400, users: 23_100, conversionRate: 4.2 },
  ],
};

// ---------------------------------------------------------------------
// Customer Analytics — demo data only.
// ---------------------------------------------------------------------
export const customerAnalytics = {
  kpis: {
    uniqueCustomers: { value: 9_640, delta: 6.2 },
    newCustomers: { value: 3_180, delta: 9.8 },
    returningCustomers: { value: 6_460, delta: 4.4 },
    repeatPurchaseRate: { value: 38.7, delta: 1.9 },
    customerAOV: { value: 1_912, delta: -0.6 },
  },
  newVsReturning: [
    { label: "New", value: 3_180, color: "#d99a3d" },
    { label: "Returning", value: 6_460, color: "#22304f" },
  ],
  purchaseFrequency: [
    { label: "1 order", value: 5_420 },
    { label: "2 orders", value: 2_310 },
    { label: "3 orders", value: 1_080 },
    { label: "4–5 orders", value: 610 },
    { label: "6+ orders", value: 220 },
  ],
  customerValueDistribution: [
    { label: "< ₱500", value: 1_240 },
    { label: "₱500–1,500", value: 4_380 },
    { label: "₱1,500–3,000", value: 2_910 },
    { label: "₱3,000–5,000", value: 810 },
    { label: "₱5,000+", value: 300 },
  ],
  customerSegment: [
    { label: "Registered Only", value: 2_460, color: "#94a0ae" },
    { label: "Online Shopper", value: 4_920, color: "#22304f" },
    { label: "Online Bidder", value: 1_380, color: "#d99a3d" },
    { label: "Bidder / Shopper", value: 880, color: "#1baf7a" },
  ],
};

// ---------------------------------------------------------------------
// Product & Merchandising
// ---------------------------------------------------------------------
export const merchandising = {
  kpis: {
    barcodedItems: { value: 48_200, delta: 3.1 },
    postedItems: { value: 41_600, delta: 4.4 },
    postingRate: { value: 86.3, delta: 1.2 },
    unpostedBacklog: { value: 6_600, delta: -2.8 },
    avgBarcodeToPostTime: { value: 2.4, sub: "days" },
  },
  publishingFunnel: [
    { label: "Received / Barcoded", value: 48_200 },
    { label: "Posted", value: 41_600 },
    { label: "Sold", value: 21_530 },
  ],
  postingPerformanceByBranch: [
    { label: "Manila", posted: 14_200 },
    { label: "Cebu", posted: 9_800 },
    { label: "Davao", posted: 8_100 },
    { label: "Pampanga", posted: 6_400 },
  ],
  unpostedBacklogAging: [
    { label: "1–7 days", value: 3_200 },
    { label: "8–14 days", value: 1_900 },
    { label: "15–30 days", value: 980 },
    { label: "31+ days", value: 520 },
  ],
  productTable: [
    { id: "pm1", product: "Denim Jacket – Classic Wash", category: "Apparel", branch: "Manila", units: 340, gmv: 412_000, nmv: 366_000, age: 6, status: "Posted" },
    { id: "pm2", product: "Structured Tote", category: "Bags", branch: "Cebu", units: 190, gmv: 274_800, nmv: 241_600, age: 11, status: "Posted" },
    { id: "pm3", product: "Wool Blend Coat", category: "Apparel", branch: "Davao", units: 0, gmv: 0, nmv: 0, age: 24, status: "Unposted" },
    { id: "pm4", product: "Suede Ankle Boots", category: "Footwear", branch: "Pampanga", units: 58, gmv: 92_400, nmv: 81_200, age: 3, status: "Posted" },
    { id: "pm5", product: "Woven Belt Set", category: "Accessories", branch: "Manila", units: 0, gmv: 0, nmv: 0, age: 33, status: "Unposted" },
  ],
};

// ---------------------------------------------------------------------
// Inventory Aging — thresholds not yet defined, see DemoBadge on the page.
// ---------------------------------------------------------------------
export const inventoryAging = {
  kpis: {
    slowMovingSkus: { value: 3_840 },
    slowMovingValue: { value: 5_120_000 },
    nonMovingSkus: { value: 1_260 },
    nonMovingValue: { value: 2_640_000 },
  },
  agingDistribution: [
    { label: "1–30", value: 12_400 },
    { label: "31–60", value: 8_100 },
    { label: "61–90", value: 4_820 },
    { label: "91–120", value: 2_310 },
    { label: "121+", value: 1_260 },
  ],
  agedByCategory: [
    { label: "Apparel", value: 3_120_000, color: "#22304f" },
    { label: "Footwear", value: 1_980_000, color: "#d99a3d" },
    { label: "Bags", value: 1_540_000, color: "#1baf7a" },
    { label: "Home", value: 1_120_000, color: "#4a3aa7" },
  ],
  agedByBranch: [
    { label: "Manila", value: 2_640_000 },
    { label: "Cebu", value: 1_980_000 },
    { label: "Davao", value: 1_420_000 },
    { label: "Pampanga", value: 1_720_000 },
  ],
  oldestInventoryTable: [
    { id: "oi1", product: "Wool Blend Coat", category: "Apparel", branch: "Davao", ageDays: 214, value: 8_400 },
    { id: "oi2", product: "Ceramic Table Vase", category: "Home", branch: "Manila", ageDays: 198, value: 3_100 },
    { id: "oi3", product: "Beaded Anklet Set", category: "Accessories", branch: "Cebu", ageDays: 176, value: 2_650 },
    { id: "oi4", product: "Canvas Espadrilles", category: "Footwear", branch: "Pampanga", ageDays: 161, value: 4_200 },
    { id: "oi5", product: "Linen Throw Pillow", category: "Home", branch: "Manila", ageDays: 154, value: 1_980 },
  ],
};

// ---------------------------------------------------------------------
// Markdown Analytics — price-history integration pending, demo data only.
// ---------------------------------------------------------------------
export const markdownAnalytics = {
  kpis: {
    itemsMarkedDown: { value: 5_420 },
    avgMarkdownPct: { value: 22.6 },
    markedDownGmv: { value: 1_860_000 },
    agedMarkedUnsold: { value: 940 },
  },
  markdownDepthDistribution: [
    { label: "1–10%", value: 1_820 },
    { label: "11–20%", value: 1_640 },
    { label: "21–30%", value: 1_120 },
    { label: "31–40%", value: 560 },
    { label: "41%+", value: 280 },
  ],
  markdownPerformance: [
    { label: "Apparel", preMarkdownGmv: 1_240_000, postMarkdownGmv: 860_000 },
    { label: "Footwear", preMarkdownGmv: 780_000, postMarkdownGmv: 540_000 },
    { label: "Bags", preMarkdownGmv: 610_000, postMarkdownGmv: 460_000 },
    { label: "Home", preMarkdownGmv: 340_000, postMarkdownGmv: 260_000 },
  ],
  agedVsMarkdown: [
    { label: "Apparel", agedValue: 3_120_000, markedDownValue: 860_000 },
    { label: "Footwear", agedValue: 1_980_000, markedDownValue: 540_000 },
    { label: "Bags", agedValue: 1_540_000, markedDownValue: 460_000 },
    { label: "Home", agedValue: 1_120_000, markedDownValue: 260_000 },
  ],
  markdownProductTable: [
    { id: "md1", product: "Wool Blend Coat", category: "Apparel", markdownPct: 38, ageDays: 214, status: "Aged + Marked, Unsold" },
    { id: "md2", product: "Canvas Espadrilles", category: "Footwear", markdownPct: 25, ageDays: 161, status: "Aged + Marked, Unsold" },
    { id: "md3", product: "Structured Tote", category: "Bags", markdownPct: 15, ageDays: 42, status: "Marked, Selling" },
    { id: "md4", product: "Ceramic Table Vase", category: "Home", markdownPct: 30, ageDays: 198, status: "Aged + Marked, Unsold" },
  ],
};

// ---------------------------------------------------------------------
// Orders & Fulfillment — timestamp completeness not yet validated.
// ---------------------------------------------------------------------
export const fulfillment = {
  kpis: {
    ordersRequiringPick: { value: 12_840, delta: 4.1 },
    pickRate: { value: 91.4, delta: 1.6 },
    pendingPicks: { value: 780, delta: -6.2 },
    avgPickTime: { value: 3.2, sub: "hours" },
    fulfillmentRate: { value: 94.8, delta: 0.9 },
  },
  funnel: [
    { label: "Order", value: 12_840 },
    { label: "Pick", value: 11_740 },
    { label: "Dispatch", value: 11_260 },
    { label: "Complete", value: 10_980 },
  ],
  pendingPickQueue: [
    { id: "pk1", order: "HRH-100234", store: "Manila", ageHours: 28, status: "Awaiting Pick" },
    { id: "pk2", order: "HRH-100261", store: "Cebu", ageHours: 22, status: "Awaiting Pick" },
    { id: "pk3", order: "HRH-100299", store: "Davao", ageHours: 19, status: "Picking" },
    { id: "pk4", order: "HRH-100312", store: "Pampanga", ageHours: 14, status: "Awaiting Pick" },
    { id: "pk5", order: "HRH-100340", store: "Manila", ageHours: 9, status: "Picking" },
  ],
  performanceByStore: [
    { label: "Manila", fulfillmentRate: 96.2 },
    { label: "Cebu", fulfillmentRate: 94.8 },
    { label: "Davao", fulfillmentRate: 92.1 },
    { label: "Pampanga", fulfillmentRate: 93.6 },
  ],
  pickDispatchTimeDistribution: [
    { label: "< 1h", value: 3_140 },
    { label: "1–4h", value: 5_620 },
    { label: "4–12h", value: 2_310 },
    { label: "12–24h", value: 980 },
    { label: "24h+", value: 400 },
  ],
};

// ---------------------------------------------------------------------
// Pickup at Store — pickup is fulfillment behavior, not a payment type.
// ---------------------------------------------------------------------
export const pickupAtStore = {
  kpis: {
    pickupOrders: { value: 2_740, delta: 5.8 },
    pickupGmv: { value: 3_920_000, delta: 6.4 },
    pickupNmv: { value: 3_410_000, delta: 5.1 },
    pickupShare: { value: 21.3, delta: 2.5 },
    pickupAov: { value: 1_431, delta: 0.6 },
  },
  pickupVsDelivery: [
    { label: "Pickup at Store", value: 3_920_000, color: "#d99a3d" },
    { label: "Home Delivery", value: 14_500_000, color: "#22304f" },
  ],
  // Payment type WITHIN pickup orders only — still a separate dimension
  // from the fulfillment method itself (see the top-level comment in this
  // file and PickupAtStore.jsx).
  paymentTypeWithinPickup: [
    { label: "GCash", value: 1_460_000, color: "#22304f" },
    { label: "Store Cash", value: 1_180_000, color: "#d99a3d" },
    { label: "Credit/Debit Card", value: 860_000, color: "#1baf7a" },
    { label: "Bank Transfer", value: 420_000, color: "#4a3aa7" },
  ],
  pickupByRedemptionStore: [
    { label: "Manila", value: 1_420_000 },
    { label: "Cebu", value: 980_000 },
    { label: "Davao", value: 810_000 },
    { label: "Pampanga", value: 710_000 },
  ],
  pickupByCategory: [
    { label: "Apparel", value: 1_680_000, color: "#22304f" },
    { label: "Footwear", value: 980_000, color: "#d99a3d" },
    { label: "Bags", value: 740_000, color: "#1baf7a" },
    { label: "Home", value: 520_000, color: "#4a3aa7" },
  ],
  pickupLifecycle: [
    { label: "Ordered", value: 2_740 },
    { label: "Ready for Pickup", value: 2_580 },
    { label: "Picked Up", value: 2_390 },
  ],
};

// ---------------------------------------------------------------------
// Channel Performance
// ---------------------------------------------------------------------
export const channelPerformance = {
  scorecards: [
    { channel: "HMRPH Online", gmv: 9_850_000, orders: 6_120, conversionRate: 3.4, cancellationRate: 3.8 },
    { channel: "TikTok", gmv: 5_120_000, orders: 4_380, conversionRate: 2.1, cancellationRate: 6.1 },
    { channel: "Shopee", gmv: 3_450_000, orders: 2_340, conversionRate: 2.9, cancellationRate: 4.4 },
  ],
  comparisonTable: [
    {
      channel: "HMRPH Online", gmv: 9_850_000, nmv: 8_620_000, orders: 6_120, units: 10_340, aov: 1_609,
      traffic: 210_400, conversionRate: 3.4, cancellationRate: 3.8, returnRate: 1.4, fulfillmentRate: 96.1, customers: 4_680,
    },
    {
      channel: "TikTok", gmv: 5_120_000, nmv: 4_330_000, orders: 4_380, units: 7_260, aov: 1_169,
      traffic: 186_300, conversionRate: 2.1, cancellationRate: 6.1, returnRate: 2.2, fulfillmentRate: 92.4, customers: 3_120,
    },
    {
      channel: "Shopee", gmv: 3_450_000, nmv: 3_010_000, orders: 2_340, units: 3_930, aov: 1_474,
      traffic: 89_500, conversionRate: 2.9, cancellationRate: 4.4, returnRate: 1.8, fulfillmentRate: 94.8, customers: 1_840,
    },
  ],
  salesTrend: WEEKS.map((label, i) => ({
    label,
    "HMRPH Online": 1_050_000 + i * 60_000,
    TikTok: 560_000 + i * 45_000 + (i % 2 === 0 ? 40_000 : 0),
    Shopee: 380_000 + i * 20_000,
  })),
  diagnostics: [
    { channel: "HMRPH Online", note: "Highest AOV and lowest cancellation rate — primary conversion channel." },
    { channel: "TikTok", note: "Strong traffic, higher cancellation rate — checkout friction under review." },
    { channel: "Shopee", note: "Smallest volume, stable fulfillment — steady secondary channel." },
  ],
};

// ---------------------------------------------------------------------
// Operational Flags — illustrative categories only, not real HMR issues.
// ---------------------------------------------------------------------
export const operationalFlags = [
  { id: "of1", severity: "critical", area: "Product Publishing", flag: "Unposted items aging past SLA", affectedCount: 214, ageDays: 12 },
  { id: "of2", severity: "warning", area: "Fulfillment", flag: "Pending picks over 24h", affectedCount: 88, ageDays: 2 },
  { id: "of3", severity: "warning", area: "Orders", flag: "Orders stuck in Pending payment", affectedCount: 63, ageDays: 5 },
  { id: "of4", severity: "critical", area: "Inventory", flag: "Non-moving SKUs with no markdown", affectedCount: 340, ageDays: 30 },
  { id: "of5", severity: "warning", area: "Cancellations", flag: "Cancellation rate above baseline (TikTok)", affectedCount: 268, ageDays: 7 },
  { id: "of6", severity: "good", area: "Returns", flag: "Returns awaiting inspection", affectedCount: 19, ageDays: 1 },
];

// ---------------------------------------------------------------------
// Product Analytics — weekly product sales-performance view (HMR Mart
// Product Analytics carry-over). Keyed by the same channel selector values
// as CHANNEL_OPTIONS. Pending the real ClickHouse contract (mart_net_sales
// x mart_level_of_inventory on barcode) — see productAnalyticsDataNotes.md
// discussion in the PR — every figure below is a fabricated demo fixture.
// ---------------------------------------------------------------------
export const productAnalyticsDataNotes =
  "Candidate sources: xv3.mart_net_sales (sales, sales_channel, barcode) joined to " +
  "xv3.mart_level_of_inventory (current stock, current stock value) on barcode. Not yet wired.";

export const productAnalytics = {
  "All Channels": {
    kpis: {
      gmv: { value: 4_820_000, delta: 6.1 },
      nmv: { value: 4_310_000, delta: 5.2 },
      aov: { value: 1_218, delta: -0.8 },
      orders: { value: 3_540, delta: 3.4 },
      units: { value: 6_260, delta: 2.9 },
    },
    repeatSellers: [
      { id: "rs1", product: "PORTABLE WIRELESS SPEAKER", priorSales: 182_000, currentSales: 214_000, units: 428, trend: "up", currentStock: 96, currentStockValue: 38_304 },
      { id: "rs2", product: "LIGHTNING IPHONE CABLE", priorSales: 96_600, currentSales: 88_200, units: 252, trend: "down", currentStock: 340, currentStockValue: 118_660 },
      { id: "rs3", product: "AC ADAPTER 20W", priorSales: 61_400, currentSales: 74_900, units: 214, trend: "up", currentStock: 512, currentStockValue: 50_688 },
      { id: "rs4", product: "MICRO CABLE 1M DATA", priorSales: 48_100, currentSales: 46_800, units: 189, trend: "flat", currentStock: 664, currentStockValue: 65_736 },
    ],
    topProducts: [
      { id: "tp1", product: "PORTABLE WIRELESS SPEAKER", currentGmv: 214_000, currentUnits: 428, previousGmv: 182_000, previousUnits: 368, note: "Growing — TikTok Live push" },
      { id: "tp2", product: "AC ADAPTER 20W", currentGmv: 74_900, currentUnits: 214, previousGmv: 61_400, previousUnits: 178, note: "Growing — steady repeat demand" },
      { id: "tp3", product: "LIGHTNING IPHONE CABLE", currentGmv: 88_200, currentUnits: 252, previousGmv: 96_600, previousUnits: 279, note: "Declining — check pricing vs. Shopee" },
      { id: "tp4", product: "FLASHLIGHT 9LED", currentGmv: 31_850, currentUnits: 490, previousGmv: 33_150, previousUnits: 510, note: "Flat" },
    ],
    droppedProducts: [
      { id: "dp1", product: "BLUETOOTH EARBUDS X2", previousSales: 42_300, previousUnits: 94, currentStock: 0, currentStockValue: 0, status: "Out of Stock" },
      { id: "dp2", product: "USB-C FAST CHARGER 30W", previousSales: 28_600, previousUnits: 82, currentStock: 156, currentStockValue: 46_800, status: "In Stock — Investigate" },
      { id: "dp3", product: "PHONE RING HOLDER", previousSales: 9_400, previousUnits: 188, currentStock: 0, currentStockValue: 0, status: "Out of Stock" },
    ],
  },
  "HMRPH Online": {
    kpis: {
      gmv: { value: 2_610_000, delta: 7.4 },
      nmv: { value: 2_340_000, delta: 6.5 },
      aov: { value: 1_346, delta: -0.4 },
      orders: { value: 1_940, delta: 4.8 },
      units: { value: 3_340, delta: 4.0 },
    },
    repeatSellers: [
      { id: "rs1", product: "PORTABLE WIRELESS SPEAKER", priorSales: 96_800, currentSales: 118_400, units: 236, trend: "up", currentStock: 96, currentStockValue: 38_304 },
      { id: "rs2", product: "LIGHTNING IPHONE CABLE", priorSales: 58_200, currentSales: 52_100, units: 149, trend: "down", currentStock: 340, currentStockValue: 118_660 },
      { id: "rs3", product: "AC ADAPTER 20W", priorSales: 34_600, currentSales: 41_900, units: 120, trend: "up", currentStock: 512, currentStockValue: 50_688 },
    ],
    topProducts: [
      { id: "tp1", product: "PORTABLE WIRELESS SPEAKER", currentGmv: 118_400, currentUnits: 236, previousGmv: 96_800, previousUnits: 194, note: "Growing" },
      { id: "tp2", product: "AC ADAPTER 20W", currentGmv: 41_900, currentUnits: 120, previousGmv: 34_600, previousUnits: 99, note: "Growing" },
      { id: "tp3", product: "LIGHTNING IPHONE CABLE", currentGmv: 52_100, currentUnits: 149, previousGmv: 58_200, previousUnits: 166, note: "Declining" },
    ],
    droppedProducts: [
      { id: "dp1", product: "BLUETOOTH EARBUDS X2", previousSales: 24_100, previousUnits: 54, currentStock: 0, currentStockValue: 0, status: "Out of Stock" },
      { id: "dp2", product: "USB-C FAST CHARGER 30W", previousSales: 16_400, previousUnits: 47, currentStock: 156, currentStockValue: 46_800, status: "In Stock — Investigate" },
    ],
  },
  TikTok: {
    kpis: {
      gmv: { value: 1_480_000, delta: 9.8 },
      nmv: { value: 1_260_000, delta: 8.1 },
      aov: { value: 986, delta: 1.6 },
      orders: { value: 1_120, delta: 6.2 },
      units: { value: 2_010, delta: 5.4 },
    },
    repeatSellers: [
      { id: "rs1", product: "PORTABLE WIRELESS SPEAKER", priorSales: 68_400, currentSales: 79_600, units: 159, trend: "up", currentStock: 96, currentStockValue: 38_304 },
      { id: "rs2", product: "FLASHLIGHT 9LED", priorSales: 18_900, currentSales: 17_800, units: 274, trend: "down", currentStock: 812, currentStockValue: 52_780 },
    ],
    topProducts: [
      { id: "tp1", product: "PORTABLE WIRELESS SPEAKER", currentGmv: 79_600, currentUnits: 159, previousGmv: 68_400, previousUnits: 137, note: "Growing — TikTok Live push" },
      { id: "tp2", product: "PHONE RING HOLDER", currentGmv: 5_100, currentUnits: 102, previousGmv: 7_400, previousUnits: 148, note: "Declining" },
    ],
    droppedProducts: [
      { id: "dp1", product: "PHONE RING HOLDER", previousSales: 3_600, previousUnits: 72, currentStock: 0, currentStockValue: 0, status: "Out of Stock" },
    ],
  },
  Shopee: {
    kpis: {
      gmv: { value: 730_000, delta: -1.9 },
      nmv: { value: 710_000, delta: -2.3 },
      aov: { value: 1_098, delta: -0.6 },
      orders: { value: 480, delta: -3.1 },
      units: { value: 910, delta: -2.4 },
    },
    repeatSellers: [
      { id: "rs1", product: "AC ADAPTER 20W", priorSales: 12_800, currentSales: 11_900, units: 34, trend: "down", currentStock: 512, currentStockValue: 50_688 },
      { id: "rs2", product: "MICRO CABLE 1M DATA", priorSales: 9_600, currentSales: 9_900, units: 40, trend: "flat", currentStock: 664, currentStockValue: 65_736 },
    ],
    topProducts: [
      { id: "tp1", product: "AC ADAPTER 20W", currentGmv: 11_900, currentUnits: 34, previousGmv: 12_800, previousUnits: 37, note: "Flat" },
      { id: "tp2", product: "MICRO CABLE 1M DATA", currentGmv: 9_900, currentUnits: 40, previousGmv: 9_600, previousUnits: 39, note: "Flat" },
    ],
    droppedProducts: [
      { id: "dp1", product: "USB-C FAST CHARGER 30W", previousSales: 4_200, previousUnits: 12, currentStock: 156, currentStockValue: 46_800, status: "In Stock — Investigate" },
    ],
  },
};
