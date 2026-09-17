// The real, current, active HMR Retail Haus branch list — derived from
// cross-referencing xv3.stores (whose own active/deleted_at flags proved
// unreliable — mixes in warehouses/dev-test/defunct branches) against
// actual last-60-day transaction volume in xv3.mart_net_sales and live
// 2026 targets in xv3.mart_sales_target (investigated 2026-09-17). See
// api/_retail-executive-overview.js for the backend's own copy of this
// list (duplicated per this dashboard's "no shared business-logic import
// across frontend/backend" convention).
//
// 9 core walk-in branches have real daily foot traffic in
// xv3.mart_foot_traffic_masterlist; HPI CANLUBANG and ENVIROCYCLE have
// live sales targets but no foot-traffic tracking and much larger
// bulk/institutional-style tickets — included in Sales/Targets, excluded
// from foot-traffic/conversion-rate metrics (explicit product decision).
export const CORE_RETAIL_STORES = [
  "PIONEER",
  "NORTH CALOOCAN",
  "MABALACAT",
  "S AND C CAINTA",
  "HMR TAGAYTAY ROAD",
  "CEBU",
  "HMR SUCAT",
  "SUBIC MAIN",
  "HMR CAGAYAN DE ORO",
];

export const NO_FOOT_TRAFFIC_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];

export const ALL_RETAIL_STORES = [...CORE_RETAIL_STORES, ...NO_FOOT_TRAFFIC_STORES];

export const ALL_STORES_OPTION = "All Stores";

export const STORE_FILTER_OPTIONS = [ALL_STORES_OPTION, ...ALL_RETAIL_STORES];
