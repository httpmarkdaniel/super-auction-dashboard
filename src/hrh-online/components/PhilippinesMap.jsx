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

const BOUNDS = computeBounds(phProvinces.features);
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

const PROVINCE_PATHS = phProvinces.features.map((f) => ({
  name: f.properties.PROVINCE,
  d: featureToPath(f),
}));

function colorFor(count, maxCount) {
  if (!count) return hrh.border;
  const t = maxCount > 0 ? count / maxCount : 0;
  // Interpolate between accentSoft (low) and accent (high), matching the
  // rest of HRH Online's orange brand accent rather than an unrelated hue.
  const from = [253, 236, 226]; // hrh.accentSoft
  const to = [235, 104, 52]; // hrh.accent
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${mix.join(",")})`;
}

// `data`: [{ province, customers }]. Provinces not present get 0/gray.
export default function PhilippinesMap({ data, height = 380 }) {
  const [hovered, setHovered] = useState(null);
  const countByProvince = useMemo(() => new Map(data.map((d) => [d.province, d.customers])), [data]);
  const maxCount = useMemo(() => Math.max(0, ...data.map((d) => d.customers)), [data]);

  return (
    <div className="relative" style={{ height }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {PROVINCE_PATHS.map((p) => {
          const count = countByProvince.get(p.name) || 0;
          return (
            <path
              key={p.name}
              d={p.d}
              fill={colorFor(count, maxCount)}
              stroke={hrh.surface}
              strokeWidth={0.5}
              onMouseEnter={() => setHovered({ name: p.name, count })}
              onMouseLeave={() => setHovered((h) => (h?.name === p.name ? null : h))}
            >
              <title>
                {p.name}: {count} {count === 1 ? "customer" : "customers"}
              </title>
            </path>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="absolute top-2 left-2 rounded-md px-2.5 py-1.5 text-[11.5px] pointer-events-none"
          style={{ background: hrh.navy, color: "#fff" }}
        >
          <div className="font-semibold">{hovered.name}</div>
          <div style={{ color: "#a3adba" }}>
            {hovered.count} {hovered.count === 1 ? "customer" : "customers"}
          </div>
        </div>
      )}
    </div>
  );
}
