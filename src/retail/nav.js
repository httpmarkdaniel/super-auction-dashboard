// Single source of truth for the Retail sidebar AND the page-key ->
// component map in RetailApp.jsx — add a page in one place only. Tab set
// originally matched the reference report (public/HRH_Weekly_MTD_Sales_Report
// (13).html) exactly (2026-09-17): Sales Overview, Trend, Store
// Performance, Sales Channel, Foot Traffic, Customer (3R), Top Products,
// Methodology. Stocks (live on-hand qty/value, per explicit request) added
// after that, same page as HRH Online's own Stocks tab conceptually.
export const NAV_GROUPS = [
  {
    label: "Retail",
    items: [
      { key: "salesOverview", label: "Sales Overview" },
      { key: "trend", label: "Trend" },
      { key: "storePerformance", label: "Store Performance" },
      { key: "salesChannel", label: "Sales Channel" },
      { key: "footTraffic", label: "Foot Traffic" },
      { key: "customerSegments", label: "Customer (3R)" },
      { key: "topProducts", label: "Top Products" },
      { key: "stocks", label: "Stocks" },
      { key: "methodology", label: "Methodology" },
    ],
  },
];
