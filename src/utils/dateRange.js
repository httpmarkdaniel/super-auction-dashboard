export const RANGE_PRESETS = [
  { key: "wtd", label: "Week to Date" },
  { key: "mtd", label: "Month to Date" },
  { key: "ytd", label: "Year to Date" },
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

// Monday of the current calendar week — getDay() is 0 (Sun) .. 6 (Sat), so
// Monday is (day - 1), wrapping Sunday to 6 days back.
function startOfWeek(date) {
  const d = new Date(date);
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

// Default landing range: Week to Date.
export function defaultDateRange() {
  return "wtd";
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

  const today = new Date();
  const to = toLocalISODate(today);

  let from;
  if (preset.key === "wtd") from = toLocalISODate(startOfWeek(today));
  else if (preset.key === "mtd") from = toLocalISODate(startOfMonth(today));
  else from = toLocalISODate(startOfYear(today));

  return {
    from,
    to,
    label: preset.label,
  };
}
