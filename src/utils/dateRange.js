export const RANGE_PRESETS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "all", label: "All Time", days: null },
];

function formatShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Convert a JavaScript Date to YYYY-MM-DD using LOCAL time,
// not UTC. This prevents Asia/Manila dates from shifting backward
// when toISOString() converts them to UTC.
function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Default landing range.
export function defaultDateRange(days = 7) {
  const to = new Date();

  const from = new Date(to);

  // Inclusive range:
  // 7 days = today + previous 6 days
  from.setDate(from.getDate() - (days - 1));

  return {
    key: "custom",
    from: toLocalISODate(from),
    to: toLocalISODate(to),
  };
}

// Resolves preset/custom dashboard date ranges.
export function resolveDateRange(value) {
  if (
    value &&
    typeof value === "object" &&
    value.key === "custom"
  ) {
    const { from, to } = value;

    const label =
      from === to
        ? formatShortDate(from)
        : `${formatShortDate(from)} – ${formatShortDate(to)}`;

    return {
      from,
      to,
      label,
    };
  }

  const preset =
    RANGE_PRESETS.find((p) => p.key === value) ??
    RANGE_PRESETS[0];

  // All Time
  if (preset.days === null) {
    return {
      from: null,
      to: null,
      label: preset.label,
    };
  }

  const to = new Date();
  const from = new Date(to);

  // Inclusive date ranges.
  // Today:       subtract 0
  // Last 7 Days: subtract 6
  // Last 30:     subtract 29
  from.setDate(from.getDate() - (preset.days - 1));

  return {
    from: toLocalISODate(from),
    to: toLocalISODate(to),
    label: preset.label,
  };
}