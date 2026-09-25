// Recharts needs literal color values (SVG fill/stroke resolve CSS vars
// unreliably inside its internals), so this mirrors theme.css for JS use.
const LIGHT = {
  series1: "#22304f",
  series2: "#1baf7a",
  series3: "#eda100",
  divPos: "#22304f",
  divNeg: "#e34948",
  good: "#0ca30c",
  muted: "#94a0ae",
  gridline: "#e7eaf0",
  textSecondary: "#5b6573",
  surface1: "#ffffff",
};

// Light only — the dashboards have no dark theme.
export default function usePalette() {
  return LIGHT;
}
