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

// '%industrial%' was REMOVED from the Equipment and Industrial branch
// below per explicit request (2026-09-17) — verified against production
// it was catching plain consumer items that merely use "industrial" as a
// marketing adjective or brand name, not actual heavy equipment: "Iron
// Horse Industrial Fan Heater", "Astron 18" Industrial Stand Fan",
// "Kincrome Compact Industrial Riveter", and "...MARIGOLD INDUSTRIAL"
// (a PPE glove brand, not a description). 2,385 of 2,400 settled lots
// matching '%industrial%' had NO other Equipment/Industrial signal
// (equipment/generator/backhoe/excavator/construction) — those all now
// correctly fall through to General Merchandise. The other 15 (e.g.
// "Assorted Industrial Equipment") still match on '%equipment%' and stay
// classified correctly.
//
// KNOWN RELATED ISSUE, NOT YET FIXED: '%equipment%' has the same kind of
// false positives — verified "Equipment Storage Cabinet", "Gym Equipment",
// "Mini Triangular Massaging Equipment", even "Toys Heavy Equipment
// Transporter" (a toy) all match it today. Left as-is because, unlike
// '%industrial%', a clean removal isn't possible here — some genuine
// equipment items (e.g. "Construction Access Hoist Equipment", broadcast/
// lab equipment) would incorrectly fall to General Merchandise too if the
// keyword were simply dropped. Needs a real decision on which "equipment"
// items count, not a blanket keyword removal — flag to the user before
// touching this.
// Vehicles and Automotive SUB-category (Motorcycles/Cars/Trucks) — added
// 2026-09-22 for Vendor Analytics' Top Vendors 5-Year Bid Value table's
// multi-select Category filter, per explicit request (Vans/Other Vehicles
// dropped per explicit follow-up — only these 3 wanted). Deliberately a
// SEPARATE, brand-new classification, not a change to
// CATEGORY_CLASSIFICATION_SQL above — the existing top-level categories
// (used by Overview/Category View/everywhere else) are left completely
// untouched per explicit instruction.
//
// Uses word-boundary regex matching (`\b`), NOT the parent's plain ILIKE
// substring matching — verified 2026-09-22 that a naive '%car%' substring
// would false-positive on ~28% of matches (Memory Card, Cartoon, Carpet,
// Toner Cartridge, Scar Repair Cream, Christmas Card, Caravan Cover, hand-
// "carry" bags, "Carolina" brand name, etc. — none of these are cars).
// Word-boundary matching eliminates all of these while still catching
// genuine car-related items (mostly car accessories/parts like "Car
// Cover"/"Car Battery"/"Car Tire" rather than whole cars themselves, same
// "accessories dominate over the item itself" pattern the parent
// category's own "Motorcycle Helmet" already has — not a new issue this
// introduces). Only meaningful for lots already classified as "Vehicles
// and Automotive" by the existing, unchanged classifier above — see
// leaderboards.js's use of this for how that scoping is applied. Vans/
// generic "vehicle" items aren't broken out into their own subcategory —
// they still count under the parent "Vehicles and Automotive" checkbox.
export function VEHICLE_SUBCATEGORY_CLASSIFICATION_SQL(nameExpr) {
  const n = `lower(${nameExpr})`;
  return `
    CASE
      WHEN match(${n}, '\\\\bmotorcycle') THEN 'Motorcycles'
      WHEN match(${n}, '\\\\btruck') THEN 'Trucks'
      WHEN match(${n}, '\\\\bcar\\\\b') THEN 'Cars'
      ELSE NULL
    END
  `;
}
export const VEHICLE_SUBCATEGORY_NAMES = ["Motorcycles", "Cars", "Trucks"];

export function CATEGORY_CLASSIFICATION_SQL(nameExpr) {
  return `
    CASE
      WHEN ${nameExpr} ILIKE '%bulk%' OR ${nameExpr} ILIKE '%pallet%' THEN 'Bulk Auction'
      WHEN ${nameExpr} ILIKE '%vehicle%' OR ${nameExpr} ILIKE '%motorcycle%' OR ${nameExpr} ILIKE '%car%'
        OR ${nameExpr} ILIKE '%truck%' OR ${nameExpr} ILIKE '%van%' OR ${nameExpr} ILIKE '%electric vehicle%'
        THEN 'Vehicles and Automotive'
      WHEN ${nameExpr} ILIKE '%equipment%' OR ${nameExpr} ILIKE '%generator%'
        OR ${nameExpr} ILIKE '%backhoe%' OR ${nameExpr} ILIKE '%excavator%' OR ${nameExpr} ILIKE '%construction%'
        THEN 'Equipment and Industrial'
      ELSE 'General Merchandise'
    END
  `;
}
