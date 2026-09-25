// HRH Online's own fixed palette — independent of the Auction dashboard's
// light/dark theme toggle (this module has its own dark-navy-chrome /
// light-canvas identity, always on, per the Phase 2 design brief).
export const hrh = {
  // "LIVE DASHBOARD UNIFORM FORMAT" palette (2026-09-25 restyle — see
  // src/uniform.css); same keys as before so every page picks it up.
  navy: "#0b1936",
  navySoft: "#16202f",
  navyBorder: "#2b303a",
  navyAccentRow: "#22304f",
  // HMR orange — kept as-is: it's a chart/data colour across the pages
  // (e.g. Units Sold bars, rate lines), so changing it would change what
  // the charts show. Selection states use the uniform format's navy
  // directly (see DateRangePicker/ChannelPills/SubTabNav).
  accent: "#eb6834",
  accentSoft: "#fdece2",
  accentText: "#b8481d",
  blue: "#1f6fb2",
  blueSoft: "#e9f3fb",
  blueText: "#1769a5",
  bg: "#f5f7fb",
  surface: "#ffffff",
  surface2: "#f9fbfe",
  border: "#dfe5ee",
  border2: "#e9edf3",
  ink: "#0b1530",
  ink2: "#617089",
  muted: "#73809a",
  good: "#15803d",
  bad: "#d62d2d",
  series: ["#22304f", "#d99a3d", "#1baf7a", "#4a3aa7", "#e34948"],
};

export const SEVERITY_COLORS = {
  critical: { bg: "#fdeaea", text: "#d62d2d" },
  warning: { bg: "#fff3d9", text: "#a66900" },
  good: { bg: "#e8f6ed", text: "#15803d" },
};
