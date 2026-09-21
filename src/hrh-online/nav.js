// Single source of truth for the HRH Online sidebar AND the page-key ->
// component map in HrhOnlineApp.jsx — add a page in one place only.
export const NAV_GROUPS = [
  { label: "Overview", items: [{ key: "overview", label: "Sales Overview" }] },
  {
    label: "Marketing",
    items: [
      { key: "sales", label: "Voucher" },
      { key: "traffic", label: "Traffic & Conversion" },
      { key: "customers", label: "Customer Analytics" },
    ],
  },
  {
    label: "Products",
    items: [
      { key: "productAnalytics", label: "Product Analytics" },
      { key: "barcodeAnalytics", label: "Stocks" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "fulfillment", label: "Orders & Fulfillment" },
      { key: "returnsCancellation", label: "Returns and Cancellation" },
    ],
  },
  {
    label: "Reports",
    items: [{ key: "weeklyBusinessReview", label: "Weekly Business Review" }],
  },
];

export const OPERATIONAL_FLAGS_KEY = "operationalFlags";
