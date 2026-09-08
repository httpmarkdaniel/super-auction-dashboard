// HMR Analytics module registry — the single source of truth for what
// appears on the portal home page and which routes resolve to a "Coming
// Soon" placeholder (see src/main.jsx). Add a future dashboard (Retail,
// Inventory, ...) by appending an entry here; no other platform code needs
// to change for it to show up on Home and get a placeholder route.
export const MODULES = [
  {
    id: "auction",
    name: "Auction",
    status: "available",
    description:
      "Auction performance, bidders, vendors, results and operational monitoring.",
    route: "/auction",
    actionLabel: "Open Dashboard",
  },
  {
    id: "hrh-online",
    name: "HRH Online",
    status: "available",
    description:
      "E-commerce sales, customers, merchandising, fulfillment and channel performance.",
    route: "/hrh-online",
    actionLabel: "Open Dashboard",
  },
  {
    id: "retail",
    name: "Retail",
    status: "coming-soon",
    description:
      "Retail sales performance, store productivity, transactions, basket size and category performance.",
    actionLabel: "Coming Soon",
  },
  {
    id: "inventory",
    name: "Inventory",
    status: "coming-soon",
    description:
      "Inventory levels, aging, movement, availability and stock performance.",
    actionLabel: "Coming Soon",
  },
  {
    id: "customer-analytics",
    name: "Customer Analytics",
    status: "coming-soon",
    description:
      "Customer growth, behavior, segmentation, retention and purchase patterns.",
    actionLabel: "Coming Soon",
  },
  {
    id: "bopis",
    name: "BOPIS / Pickup at Store",
    status: "coming-soon",
    description:
      "Buy Online Pick Up In Store sales, orders, redemption stores and customer pickup performance.",
    actionLabel: "Coming Soon",
  },
  {
    id: "email-analytics",
    name: "Email Analytics",
    status: "coming-soon",
    description:
      "Email delivery, engagement, campaign performance and business-unit communication analytics.",
    actionLabel: "Coming Soon",
  },
];
