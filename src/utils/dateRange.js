export const RANGE_PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "90d", label: "Last 90 Days", days: 90 },
  { key: "all", label: "All Time", days: null },
];

// Resolves a preset key into concrete from/to ISO dates (YYYY-MM-DD) for
// the ClickHouse query — computed once here so the picker UI and whatever
// calls the API agree on exactly what "Last 30 Days" means.
export function resolveDateRange(presetKey) {
  const preset = RANGE_PRESETS.find((p) => p.key === presetKey) ?? RANGE_PRESETS[2];
  const to = new Date();
  if (preset.days === null) return { from: null, to: null, label: preset.label };
  const from = new Date(to);
  from.setDate(from.getDate() - preset.days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), label: preset.label };
}
