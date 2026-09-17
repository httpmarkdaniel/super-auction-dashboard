// Single source of truth for the HRH Online sidebar AND the page-key ->
// component map in HrhOnlineApp.jsx — add a page in one place only.
export const NAV_GROUPS = [
  { label: "Overview", items: [{ key: "overview", label: "Executive Overview" }] },
  {
    label: "Commerce",
    items: [
      { key: "sales", label: "Sales Analytics" },
      { key: "traffic", label: "Traffic & Conversion" },
      { key: "customers", label: "Customer Analytics" },
    ],
  },
  {
    label: "Merchandising",
    items: [
      { key: "productAnalytics", label: "Product Analytics" },
      { key: "markdown", label: "Markdown Analytics" },
      { key: "barcodeAnalytics", label: "Barcode Analytics" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "fulfillment", label: "Orders & Fulfillment" },
      { key: "returnsCancellation", label: "Returns and Cancellation" },
      { key: "customerSuccess", label: "Customer Success" },
    ],
  },
  {
    label: "Reports",
    items: [{ key: "weeklyBusinessReview", label: "Weekly Business Review" }],
  },
];

export const OPERATIONAL_FLAGS_KEY = "operationalFlags";
