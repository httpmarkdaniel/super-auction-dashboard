// Store -> region lookup — a maintained static mapping, not a live query.
// xv3.stores' own address_line/extended_address only has real city/
// province text for 9 of our 11 stores (not HRH ONLINE — no physical
// location; NORTH CALOOCAN's address field is unpopulated, "N/A") —
// investigated 2026-09-18. Region for those 2 is inferred from the
// store's own name/branch identity instead (also real — "North Caloocan"
// unambiguously means Caloocan City, NCR; HRH Online has no region at
// all, shown as "Online" rather than guessing a Philippine region for an
// e-commerce channel).
export const STORE_REGIONS = {
  PIONEER: "NCR",
  "HMR SUCAT": "NCR",
  "NORTH CALOOCAN": "NCR",
  MABALACAT: "Central Luzon",
  "S AND C CAINTA": "CALABARZON",
  "SUBIC MAIN": "Central Luzon",
  "HMR TAGAYTAY ROAD": "CALABARZON",
  CEBU: "Central Visayas",
  "HMR CAGAYAN DE ORO": "Northern Mindanao",
  "HPI CANLUBANG": "CALABARZON",
  ENVIROCYCLE: "CALABARZON",
  "HRH ONLINE": "Online",
};
