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
      { key: "merchandising", label: "Product & Merchandising" },
      { key: "inventoryAging", label: "Inventory Aging" },
      { key: "markdown", label: "Markdown Analytics" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "fulfillment", label: "Orders & Fulfillment" },
      { key: "pickup", label: "Pickup at Store" },
    ],
  },
  {
    label: "Channels",
    items: [{ key: "channelPerformance", label: "Channel Performance" }],
  },
];

export const OPERATIONAL_FLAGS_KEY = "operationalFlags";
