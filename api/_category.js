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
