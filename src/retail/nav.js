// Single source of truth for the Retail sidebar AND the page-key ->
// component map in RetailApp.jsx — add a page in one place only. Same
// pattern as src/hrh-online/nav.js.
export const NAV_GROUPS = [
  { label: "Overview", items: [{ key: "overview", label: "Executive Overview" }] },
  {
    label: "Performance",
    items: [
      { key: "salesAnalytics", label: "Sales Analytics" },
      { key: "storePerformance", label: "Store Performance" },
    ],
  },
  {
    label: "Operations",
    items: [{ key: "transactionsBasket", label: "Transactions & Basket" }],
  },
  {
    label: "Merchandising",
    items: [
      { key: "categoryPerformance", label: "Category Performance" },
      { key: "topProducts", label: "Top Products" },
    ],
  },
];
