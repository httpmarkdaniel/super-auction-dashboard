import { useMemo, useState } from "react";
import phProvinces from "../data/ph-provinces.json";
import { hrh } from "../theme";

// Province boundaries: 82 provinces (2011 PSA boundaries — close enough for
// a dashboard choropleth; a few provinces have since been renamed/split,
// see PROVINCE_ALIASES in api/_hrh-customer-analytics.js for how those map
// back onto this older shape set), merged from faeldon/philippines-json-maps
// (17 per-region "lowres" files → one combined FeatureCollection) rather
// than fetched at runtime, so this never depends on an external source
// being reachable in production.
const WIDTH = 320;
const HEIGHT = 420;
const PADDING = 6;

// A couple of small island provinces (Batanes, Camiguin) come back with
// geometry: null from the source dataset at this simplification level —
// dropped entirely rather than simplified to nothing. Filtered out here so
// a null geometry can never reach .type/.coordinates access below; this
// crashed the ENTIRE app on load, not just this component, since these are
// module-level computations that run as soon as the bundle evaluates.
const VALID_FEATURES = phProvinces.features.filter((f) => f.geometry);

function computeBounds(features) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

const BOUNDS = computeBounds(VALID_FEATURES);
// Longitude degrees cover less ground than latitude degrees away from the
// equator — scale longitude by cos(mean latitude) so provinces keep their
// real proportions instead of looking horizontally stretched.
const MEAN_LAT_RAD = ((BOUNDS.minLat + BOUNDS.maxLat) / 2) * (Math.PI / 180);
const LON_FACTOR = Math.cos(MEAN_LAT_RAD);
const LON_SPAN = (BOUNDS.maxLon - BOUNDS.minLon) * LON_FACTOR;
const LAT_SPAN = BOUNDS.maxLat - BOUNDS.minLat;
const SCALE = Math.min((WIDTH - PADDING * 2) / LON_SPAN, (HEIGHT - PADDING * 2) / LAT_SPAN);
const X_OFFSET = PADDING + (WIDTH - PADDING * 2 - LON_SPAN * SCALE) / 2;
const Y_OFFSET = PADDING + (HEIGHT - PADDING * 2 - LAT_SPAN * SCALE) / 2;

function project([lon, lat]) {
  const x = (lon - BOUNDS.minLon) * LON_FACTOR * SCALE + X_OFFSET;
  const y = HEIGHT - ((lat - BOUNDS.minLat) * SCALE + Y_OFFSET);
  return [x, y];
}

function ringToPath(ring) {
  return ring.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${project([lon, lat]).map((n) => n.toFixed(1)).join(",")}`).join(" ") + "Z";
}

function featureToPath(feature) {
  const polys = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polys.map((poly) => poly.map(ringToPath).join(" ")).join(" ");
}

const PROVINCE_PATHS = VALID_FEATURES.map((f) => ({
  name: f.properties.PROVINCE,
  d: featureToPath(f),
}));

function colorFor(count, maxCount) {
  if (!count) return hrh.border;
  // Metro Manila's count dwarfs every other province (e.g. 216 vs Laguna's
  // 46), so a linear scale left every province but Metro Manila looking
  // almost as pale as the true-zero gray. sqrt compresses that dominance;
  // the 0.35 floor guarantees ANY nonzero count still reads as visibly
  // "filled" blue, never a wash of near-gray.
  const ratio = maxCount > 0 ? count / maxCount : 0;
  const t = 0.35 + 0.65 * Math.sqrt(ratio);
  // Interpolate between blueSoft (low) and blue (high) — HMR's brand blue,
  // per request, rather than the orange accent used elsewhere.
  const from = [232, 240, 251]; // hrh.blueSoft
  const to = [63, 121, 209]; // hrh.blue
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${mix.join(",")})`;
}

// `data`: [{ province, customers, cities? }]. Provinces not present get
// 0/gray. Hover state is reported up via `onHoverChange(provinceName |
// null)` rather than rendered here — the caller shows a larger detail
// panel right beside the map instead of a small floating tooltip.
export default function PhilippinesMap({ data, onHoverChange, height = 380 }) {
  const [hoveredName, setHoveredName] = useState(null);
  const countByProvince = useMemo(() => new Map(data.map((d) => [d.province, d.customers])), [data]);
  const maxCount = useMemo(() => Math.max(0, ...data.map((d) => d.customers)), [data]);

  const handleEnter = (name) => {
    setHoveredName(name);
    onHoverChange?.(name);
  };
  const handleLeave = (name) => {
    if (hoveredName !== name) return;
    setHoveredName(null);
    onHoverChange?.(null);
  };

  return (
    <div style={{ height }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {PROVINCE_PATHS.map((p) => {
          const count = countByProvince.get(p.name) || 0;
          const isHovered = hoveredName === p.name;
          return (
            <path
              key={p.name}
              d={p.d}
              fill={colorFor(count, maxCount)}
              stroke={isHovered ? hrh.blueText : hrh.surface}
              strokeWidth={isHovered ? 1.4 : 0.5}
              onMouseEnter={() => handleEnter(p.name)}
              onMouseLeave={() => handleLeave(p.name)}
            >
              <title>
                {p.name}: {count} {count === 1 ? "customer" : "customers"}
              </title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}
