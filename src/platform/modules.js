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
];
