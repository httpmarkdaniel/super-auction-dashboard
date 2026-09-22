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
// Verified 2026-09-22 against the business's own YTD sales query (exact
// match). HARRINGTON PIONEER is a distinct Mandaluyong branch (not the
// same store as PIONEER despite the similar name), and MAIN is a legacy/
// system store bucket (xv3.stores shows division "Auction", no real
// address) that still carries real revenue — see
// api/_retail-sales-overview.js's own comment for the full writeup. None
// of these 3 have foot-traffic or sales-target rows, so they're absent
// from api/_retail-foot-traffic.js's own (separate) store list.
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
  "HARRINGTON PIONEER",
  "HMR BULACAN",
  "MAIN",
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
