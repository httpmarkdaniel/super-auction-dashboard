// HRH Online's own fixed palette — independent of the Auction dashboard's
// light/dark theme toggle (this module has its own dark-navy-chrome /
// light-canvas identity, always on, per the Phase 2 design brief).
export const hrh = {
  navy: "#0f1622",
  navySoft: "#16202f",
  navyBorder: "#2b303a",
  navyAccentRow: "#22304f",
  accent: "#d99a3d",
  accentSoft: "#faf1df",
  accentText: "#b07514",
  bg: "#f4f6fa",
  surface: "#ffffff",
  border: "#e7eaf0",
  ink: "#111827",
  ink2: "#5b6573",
  muted: "#94a0ae",
  good: "#0ca30c",
  bad: "#d03b3b",
  series: ["#22304f", "#d99a3d", "#1baf7a", "#4a3aa7", "#e34948"],
};

export const SEVERITY_COLORS = {
  critical: { bg: "#faeaea", text: "#c42b2b" },
  warning: { bg: "#faf1df", text: "#b07514" },
  good: { bg: "#e6f4ea", text: "#1e7b34" },
};
