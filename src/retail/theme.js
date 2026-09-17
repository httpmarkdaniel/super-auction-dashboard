// Retail's own fixed palette — deliberately distinct from HRH Online's
// white-surface/orange-accent identity (2026-09-17 redesign, per explicit
// "it looks the same as HRH Online" feedback). Lifted directly from the
// reference report's own <style> block (public/HRH_Weekly_MTD_Sales_Report
// (13).html) — dark navy chrome, gold accent, maroon section headers —
// rather than reusing HRH/Auction's shared orange/blue brand treatment.
export const retail = {
  navy: "#0F3460", // header, table headers, KPI values, total-row border
  navyDark: "#154360", // tab bar, headline banner, verify-note border
  navySoft: "#1a4570",
  navyBorder: "#1c4d80", // chart tooltip border (on navy bg)
  gold: "#FF9F1C", // active tab underline, active toggle, headline highlight
  maroon: "#7B241C", // section headers, note border, active sub-tab
  methGreen: "#0B5345", // methodology table header (reference's own one-off accent)
  bg: "#f4f6f8",
  surface: "#ffffff",
  border: "#e3e8ee",
  ink: "#1a1a2e",
  ink2: "#555555",
  muted: "#888888",
  good: "#2e7d32",
  bad: "#c62828",
  goodBg: "#c6efce",
  badBg: "#ffcccc",
  warnBg: "#fff2cc",
  series: ["#0F3460", "#FF9F1C", "#7B241C", "#2e7d32", "#154360", "#c62828"],
  // Kept for any leftover references during the transition — not used by
  // the new component styling.
  accent: "#FF9F1C",
  accentSoft: "#fff2cc",
  accentText: "#7B241C",
  blue: "#0F3460",
  blueSoft: "#e3e8ee",
  blueText: "#154360",
};
