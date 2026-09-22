// Single source of truth for the category taxonomy used across
// api/overview.js AND api/leaderboards.js — derived from item name,
// unconditional ELSE branch (every lot always resolves to a category).
// Shared via this module (same convention as api/_liveBids.js/
// api/_hmrApi.js) rather than duplicated per file, so the classification
// can never drift between Overview and CategoryView.
//
// REWRITTEN 2026-09-22 to match the business's own official 5-category
// reference taxonomy (General Merchandise, Bulk Auction, Trucks, Vehicles
// and Automotive, Equipment and Industrial — Trucks is now its own
// top-level category, split OUT of Vehicles and Automotive per that
// reference's own "road vehicles other than trucks" framing). Replaces
// the previous 4-category version, whose plain ILIKE substring matching
// was verified to have severe false-positive rates: ~28% for Vehicles and
// Automotive (Memory Card, Cartoon, Carpet, Toner Cartridge, Scar Repair
// Cream, Christmas Card, Caravan Cover, "carry" bags, "Carolina" brand
// name, "Cart"/"Care"/"Carburetor" all matching bare "%car%"), ~34% for
// Equipment and Industrial (furniture "Equipment Cabinet/Storage", gym/
// audio/kitchen/office/safety/camping "equipment", consumer "Steam
// Generator" irons, toy die-cast/RC excavators and construction trucks),
// and ~2.7% for Bulk Auction (makeup "Palette" spelled/matched as
// "Pallet", pallet jacks/trucks counted as bulk lots instead of tools).
//
// Every keyword below uses word-boundary regex matching (`\b`) for bare/
// short words prone to substring collisions (car, van, truck, EV, SUV,
// MPV, AUV, generator), not plain ILIKE substrings — multi-word phrases
// (e.g. "concrete mixer", "tractor head") are left as plain substrings
// since a multi-word phrase is already low-collision-risk.
//
// Four keywords from the business's reference were DELIBERATELY DROPPED
// after verifying them against real data (2026-09-22), all catching
// overwhelmingly unrelated consumer products:
//   - bare "machine" (Equipment): Washing Machine, Sewing Machine,
//     Espresso Machine, Fax Machine — none industrial. The reference's
//     other, more specific phrases ("industrial machine", "machinery",
//     "heavy machinery", "drilling machine", etc.) still cover the real
//     cases without this noise.
//   - bare "auto" (Vehicles): overwhelmingly means "automatic" as a
//     product feature, not "automobile" — Auto Alcohol Dispenser, Auto
//     Hose Reel, Auto Hair Curler, Auto Lamp; zero real cars found.
//   - bare "crane" (Equipment): overwhelmingly a fitness-equipment brand
//     name and toys — "Crane Weight Training Gloves/Belt", "Crane Pull
//     Bar", "Motorized Crane" (a toy); real construction cranes nearly
//     absent. "boom lift"/"telehandler"/etc. still cover real lifting
//     equipment.
//   - bare "scooter" (Vehicles): overwhelmingly kids' kick scooters/toys
//     — "Kids Scooter", "Scooter Helmet", "Kids 3 Wheel Scooter", not
//     motor vehicles.
//
// Known, accepted residual behavior (same "accessories/toys alongside
// the real item" pattern the pre-existing taxonomy already had, not a
// new issue this introduces): Trucks/Vehicles bare keywords also match
// accessories, parts, and toys (Truck Side Mirror, Truck Bed Tonneau
// Cover, Kids Truck Toys, RC Monster Truck, Motorcycle Helmet, Car
// Cover) — these aren't excluded since the business's own reference
// explicitly wants bare "truck"/"car"/"motorcycle" matched, and toy/
// accessory contamination at this level is far smaller than the false
// positives that WERE fixed above.
export const CATEGORY_NAMES = [
  "General Merchandise",
  "Vehicles and Automotive",
  "Trucks",
  "Equipment and Industrial",
  "Bulk Auction",
];

// Vehicles and Automotive SUB-category (Motorcycles/Cars only — Trucks
// dropped 2026-09-22 now that Trucks is its own top-level category, see
// CATEGORY_CLASSIFICATION_SQL below; selecting "Trucks" directly from
// CATEGORY_NAMES now covers the full, more comprehensive Trucks keyword
// list instead of this narrower subcategory version) — added 2026-09-22
// for Vendor Analytics' Top Vendors 5-Year Bid Value table's multi-select
// Category filter, per explicit request. Deliberately a SEPARATE
// classification from CATEGORY_CLASSIFICATION_SQL, only meaningful for
// lots already classified as "Vehicles and Automotive" by that
// classifier — see leaderboards.js's use of this for how that scoping is
// applied.
export function VEHICLE_SUBCATEGORY_CLASSIFICATION_SQL(nameExpr) {
  const n = `lower(${nameExpr})`;
  return `
    CASE
      WHEN match(${n}, '\\\\bmotorcycle') THEN 'Motorcycles'
      WHEN match(${n}, '\\\\bcar\\\\b') THEN 'Cars'
      ELSE NULL
    END
  `;
}
export const VEHICLE_SUBCATEGORY_NAMES = ["Motorcycles", "Cars"];

export function CATEGORY_CLASSIFICATION_SQL(nameExpr) {
  const n = `lower(${nameExpr})`;

  // Bulk Auction — pallet/pallets (word-boundary, catches the plural too,
  // NOT "Palletized" — verified 2026-09-22 that a bare \bpallet\b without
  // the "s?" missed real "N-Pallets ..." bulk lots), bulk, wholesale,
  // mixed lot, bundle(d), multiple lot, job lot. Excludes makeup
  // "Palette" (spelled "Pallet" in real listings) and pallet jacks/
  // trucks/wrap (warehouse tools, not bulk lots).
  const bulkMatch = `(
    match(${n}, '\\\\bpallets?\\\\b') OR ${n} LIKE '%bulk%' OR ${n} LIKE '%wholesale%'
    OR ${n} LIKE '%mixed lot%' OR ${n} LIKE '%bundle%' OR ${n} LIKE '%bundled%'
    OR ${n} LIKE '%multiple lot%' OR ${n} LIKE '%job lot%'
  )`;
  const bulkExclude = `(
    ${n} LIKE '%eyeshadow%' OR ${n} LIKE '%blush%' OR ${n} LIKE '%makeup%'
    OR ${n} LIKE '%pallet jack%' OR ${n} LIKE '%pallets jack%'
    OR ${n} LIKE '%pallet truck%' OR ${n} LIKE '%pallets truck%' OR ${n} LIKE '%pallet wrap%'
  )`;

  // Trucks — checked BEFORE Vehicles and Equipment so multi-word phrases
  // that also contain a Vehicles/Equipment keyword resolve to Trucks
  // instead: "wing van" contains "van", "concrete mixer truck" contains
  // Equipment's "concrete mixer", "tractor head"/"tractor truck" contain
  // Equipment's bare "tractor". Matches the reference's own "Vehicles and
  // Automotive: road vehicles other than trucks" framing. "pallet truck"/
  // "hand pallet truck" excluded — verified 2026-09-22 these are
  // warehouse hand-tools, not real trucks.
  const truckMatch = `(
    match(${n}, '\\\\btruck') OR ${n} LIKE '%pick-up%' OR ${n} LIKE '%pickup%'
    OR ${n} LIKE '%wing van%' OR ${n} LIKE '%wingvan%'
    OR ${n} LIKE '%tractor head%' OR ${n} LIKE '%tractor truck%' OR ${n} LIKE '%prime mover%'
    OR ${n} LIKE '%wheeler%'
  )`;
  const truckExclude = `(${n} LIKE '%pallet truck%' OR ${n} LIKE '%pallets truck%')`;

  // Vehicles and Automotive — road vehicles OTHER than trucks (per the
  // reference's own framing; Trucks is checked first above, so nothing
  // here can double-match a truck phrase). "auto"/"scooter" deliberately
  // dropped — see file header comment.
  const vehicleMatch = `(
    match(${n}, '\\\\bcars?\\\\b') OR match(${n}, '\\\\bsuv\\\\b') OR match(${n}, '\\\\bmpv\\\\b')
    OR match(${n}, '\\\\bauv\\\\b') OR match(${n}, '\\\\bev\\\\b')
    OR match(${n}, '\\\\bvan\\\\b') OR ${n} LIKE '%urvan%'
    OR match(${n}, '\\\\bmotorcycle') OR match(${n}, '\\\\bvehicle')
    OR ${n} LIKE '%sedan%' OR ${n} LIKE '%hatchback%' OR ${n} LIKE '%coupe%' OR ${n} LIKE '%crossover%'
    OR ${n} LIKE '%minivan%' OR ${n} LIKE '%motorbike%' OR ${n} LIKE '%e-bike%' OR ${n} LIKE '%electric bike%'
    OR ${n} LIKE '%electric vehicle%' OR ${n} LIKE '%automobile%'
    OR ${n} LIKE '%passenger vehicle%' OR ${n} LIKE '%utility vehicle%'
  )`;

  // Equipment and Industrial — "machine"/"crane" deliberately dropped;
  // "machinery"/"industrial machine"/"drilling machine" kept since those
  // specific phrases are far less collision-prone than the bare word
  // "machine" alone — see file header comment.
  const equipmentMatch = `(
    match(${n}, '\\\\bgenerator') OR ${n} LIKE '%genset%' OR ${n} LIKE '%compressor%'
    OR ${n} LIKE '%forklift%' OR ${n} LIKE '%excavator%' OR ${n} LIKE '%backhoe%'
    OR ${n} LIKE '%loader%' OR ${n} LIKE '%bulldozer%' OR ${n} LIKE '%dozer%'
    OR ${n} LIKE '%boom lift%' OR ${n} LIKE '%scissor lift%' OR ${n} LIKE '%telehandler%'
    OR ${n} LIKE '%grader%' OR ${n} LIKE '%road roller%' OR ${n} LIKE '%compactor%' OR ${n} LIKE '%paver%'
    OR ${n} LIKE '%concrete mixer%' OR ${n} LIKE '%concrete pump%'
    OR ${n} LIKE '%drilling machine%' OR ${n} LIKE '%drill rig%'
    OR ${n} LIKE '%industrial machine%' OR ${n} LIKE '%industrial equipment%'
    OR ${n} LIKE '%construction equipment%' OR ${n} LIKE '%construction machinery%'
    OR ${n} LIKE '%heavy equipment%' OR ${n} LIKE '%heavy machinery%'
    OR ${n} LIKE '%plant machinery%' OR ${n} LIKE '%plant and machinery%' OR ${n} LIKE '%machinery%'
    OR ${n} LIKE '%conveyor%' OR ${n} LIKE '%material handling equipment%' OR ${n} LIKE '%warehouse equipment%'
    OR ${n} LIKE '%agricultural machinery%' OR ${n} LIKE '%farm equipment%' OR ${n} LIKE '%tractor%'
  )`;

  return `
    CASE
      WHEN ${bulkMatch} AND NOT ${bulkExclude} THEN 'Bulk Auction'
      WHEN ${truckMatch} AND NOT ${truckExclude} THEN 'Trucks'
      WHEN ${vehicleMatch} THEN 'Vehicles and Automotive'
      WHEN ${equipmentMatch} THEN 'Equipment and Industrial'
      ELSE 'General Merchandise'
    END
  `;
}
