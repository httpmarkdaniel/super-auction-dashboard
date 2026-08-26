// Single source of truth for the category taxonomy used across
// api/overview.js AND api/leaderboards.js: General Merchandise, Vehicles
// and Automotive, Equipment and Industrial, Bulk Auction — derived from
// item name, unconditional ELSE branch (every lot always resolves to a
// category). Shared via this module (same convention as api/_liveBids.js/
// api/_hmrApi.js) rather than duplicated per file, so the classification
// can never drift between Overview and CategoryView.
//
// Takes the exact SQL expression for the name column as a parameter, since
// different queries reference it via different aliases (`v.name`, bare
// `name` inside a CTE, etc.).
// The four possible outputs of CATEGORY_CLASSIFICATION_SQL below, as a
// single canonical list — imported directly by the frontend (Sidebar's
// Categories dropdown) so the dropdown always exposes the full business
// taxonomy instead of drifting from whatever categories happen to have
// activity in the current date/store scope. This is a separate concern
// from the CASE/WHEN order below: that order is classification PRIORITY
// (which category wins when an item name matches multiple keyword sets,
// e.g. "bulk" is checked before "vehicle"), never seen directly by users.
// This list is DISPLAY order, unrelated to and never reordered to match
// that priority — changing one must never change the other.
export const CATEGORY_NAMES = [
  "General Merchandise",
  "Vehicles and Automotive",
  "Equipment and Industrial",
  "Bulk Auction",
];

export function CATEGORY_CLASSIFICATION_SQL(nameExpr) {
  return `
    CASE
      WHEN ${nameExpr} ILIKE '%bulk%' OR ${nameExpr} ILIKE '%pallet%' THEN 'Bulk Auction'
      WHEN ${nameExpr} ILIKE '%vehicle%' OR ${nameExpr} ILIKE '%motorcycle%' OR ${nameExpr} ILIKE '%car%'
        OR ${nameExpr} ILIKE '%truck%' OR ${nameExpr} ILIKE '%van%' OR ${nameExpr} ILIKE '%electric vehicle%'
        THEN 'Vehicles and Automotive'
      WHEN ${nameExpr} ILIKE '%equipment%' OR ${nameExpr} ILIKE '%industrial%' OR ${nameExpr} ILIKE '%generator%'
        OR ${nameExpr} ILIKE '%backhoe%' OR ${nameExpr} ILIKE '%excavator%' OR ${nameExpr} ILIKE '%construction%'
        THEN 'Equipment and Industrial'
      ELSE 'General Merchandise'
    END
  `;
}
