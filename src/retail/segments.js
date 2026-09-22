// The All / Retail / Wholesale segment model — replaces the earlier
// per-store filter (2026-09-17 pivot) to match the reference report
// (public/HRH_Weekly_MTD_Sales_Report (13).html) this dashboard is being
// rebuilt against. Per that report's own Methodology tab: "Retail = 9
// physical branches + HRH Online. Wholesale = Envirocycle + HPI
// Canlubang. All = both combined." Envirocycle/HPI Canlubang were
// investigated 2026-09-17 and confirmed to behave like institutional/bulk
// accounts (10-70x larger average tickets, zero foot-traffic tracking) —
// "Wholesale" is the correct real-world label for what CORE_RETAIL_STORES'
// original writeup called "ambiguous, no-foot-traffic stores."
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
  "HMR CUBAO",
];
export const WHOLESALE_STORES = ["HPI CANLUBANG", "ENVIROCYCLE"];
export const HRH_ONLINE_STORE = "HRH ONLINE";

export const SEGMENTS = {
  all: { key: "all", label: "All", stores: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE, ...WHOLESALE_STORES] },
  retail: { key: "retail", label: "Retail", stores: [...CORE_RETAIL_STORES, HRH_ONLINE_STORE] },
  wholesale: { key: "wholesale", label: "Wholesale", stores: WHOLESALE_STORES },
};
export const SEGMENT_OPTIONS = [SEGMENTS.all, SEGMENTS.retail, SEGMENTS.wholesale];

// Foot traffic only ever exists for the 9 core walk-in branches — not HRH
// Online (no physical foot traffic for e-commerce) and not Wholesale
// (verified zero rows in xv3.mart_foot_traffic_masterlist for Envirocycle/
// HPI Canlubang).
export function coreStoresInSegment(segmentKey) {
  return SEGMENTS[segmentKey]?.stores.filter((s) => CORE_RETAIL_STORES.includes(s)) || [];
}
