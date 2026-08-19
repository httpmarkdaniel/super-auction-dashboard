export const RANGE_PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "all", label: "All Time", days: null },
];

function formatShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// Matches the dashboard's original "Last 7 Days" landing view, expressed as
// a custom range now that 7d is no longer a named preset.
export function defaultDateRange(days = 7) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { key: "custom", from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Resolves either a preset key ("today"/"all") or a custom
// { key: "custom", from, to } range (both YYYY-MM-DD) into concrete
// from/to ISO dates + a display label — computed once here so the picker
// UI and whatever calls the API agree on exactly what's selected.
export function resolveDateRange(value) {
  if (value && typeof value === "object" && value.key === "custom") {
    const { from, to } = value;
    const label = from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`;
    return { from, to, label };
  }

  const preset = RANGE_PRESETS.find((p) => p.key === value) ?? RANGE_PRESETS[0];
  const to = new Date();
  if (preset.days === null) return { from: null, to: null, label: preset.label };
  const from = new Date(to);
  from.setDate(from.getDate() - preset.days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), label: preset.label };
}
