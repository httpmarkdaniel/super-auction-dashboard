import { useEffect, useState } from "react";

// Recharts needs literal color values (SVG fill/stroke resolve CSS vars
// unreliably inside its internals), so this mirrors theme.css for JS use.
const LIGHT = {
  series1: "#1a3a6b",
  series2: "#1baf7a",
  divPos: "#1a3a6b",
  divNeg: "#e34948",
  good: "#0ca30c",
  muted: "#898781",
  gridline: "#e1e0d9",
  textSecondary: "#52514e",
  surface1: "#fcfcfb",
  brandOrange: "#fd7936",
};

const DARK = {
  series1: "#4a7cc7",
  series2: "#199e70",
  divPos: "#4a7cc7",
  divNeg: "#e66767",
  good: "#0ca30c",
  muted: "#898781",
  gridline: "#2c2c2a",
  textSecondary: "#c3c2b7",
  surface1: "#1a1a19",
  brandOrange: "#fd8f52",
};

export default function usePalette() {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return dark ? DARK : LIGHT;
}
