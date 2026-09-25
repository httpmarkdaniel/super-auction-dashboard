// Period presets + labels for the Marketing date filter (DateFilter.jsx).
// Value shape: { key, from, to } with ISO dates; All time is
// { key: "all", from: "", to: "" }.

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const PRESETS = [
  { key: "all", label: "All time" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last3", label: "Last 3 months" },
  { key: "ytd", label: "Year to date" },
  { key: "lastYear", label: "Last year" },
];

export function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "thisMonth") return { key, from: iso(new Date(y, m, 1)), to: iso(now) };
  if (key === "lastMonth") return { key, from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  // This month + the 2 before it — the window the segments compare, so
  // Slipped/Inactive customers show up too.
  if (key === "last3") return { key, from: iso(new Date(y, m - 2, 1)), to: iso(now) };
  if (key === "ytd") return { key, from: iso(new Date(y, 0, 1)), to: iso(now) };
  if (key === "lastYear") return { key, from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
  return { key: "all", from: "", to: "" };
}

function fmt(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function rangeLabel(value) {
  if (!value || value.key === "all") return "All time";
  const preset = PRESETS.find((p) => p.key === value.key);
  const span = value.from === value.to ? fmt(value.from) : `${fmt(value.from)} – ${fmt(value.to)}`;
  return preset ? `${preset.label} (${span})` : span;
}
