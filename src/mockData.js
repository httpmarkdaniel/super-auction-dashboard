// Every dashboard number now comes from the real ClickHouse/cms.hmr.ph
// endpoints (see api/*.js and the use*.js hooks) — this file only holds the
// store-name list used as a fallback for the store-picker dropdown before
// useStoreList() resolves the real distinct branch list. Not business data,
// just names, so it's fine to show before the real list loads.
const BRANCH_NAMES = [
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
