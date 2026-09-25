import { useEffect, useState } from "react";

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

const DARK = {
  series1: "#7e93c2",
  series2: "#199e70",
  series3: "#c98500",
  divPos: "#7e93c2",
  divNeg: "#e66767",
  good: "#0ca30c",
  muted: "#75808f",
  gridline: "#2b303a",
  textSecondary: "#a3adba",
  surface1: "#1a1d24",
};

// Chart palette follows the dashboard's manual theme (data-theme="dark" set
// by Auction's toggle), not the computer's light/dark setting.
function isDarkTheme() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

export default function usePalette() {
  const [dark, setDark] = useState(isDarkTheme);

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return dark ? DARK : LIGHT;
}
