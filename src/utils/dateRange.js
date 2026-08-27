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

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysInMonth(year, month) {
  // month is 0-indexed; day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

// The comparable PREVIOUS period for a given date-range selection, using
// the SAME elapsed-window rule the task requires per preset — never a
// blanket "shift back N days" for every preset (that's only correct for
// WTD/Custom; MTD and YTD need calendar-aware month/year shifting so a
// partial current period compares against an equally partial previous
// one, not a full one). Returns { from, to } only — no label; see
// comparisonLabel() for the display string.
export function resolveComparisonRange(value) {
  const current = resolveDateRange(value);
  const isCustom = value && typeof value === "object" && value.key === "custom";
  const presetKey = isCustom ? null : (RANGE_PRESETS.find((p) => p.key === value)?.key ?? "wtd");

  const from = new Date(`${current.from}T00:00:00`);
  const to = new Date(`${current.to}T00:00:00`);

  if (presetKey === "wtd") {
    // Same weekday-elapsed window, 7 days earlier.
    return { from: toLocalISODate(addDays(from, -7)), to: toLocalISODate(addDays(to, -7)) };
  }

  if (presetKey === "mtd") {
    const prevMonthDate = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const elapsedDay = to.getDate();
    const clampedDay = Math.min(elapsedDay, daysInMonth(prevYear, prevMonth));
    return {
      from: toLocalISODate(new Date(prevYear, prevMonth, 1)),
      to: toLocalISODate(new Date(prevYear, prevMonth, clampedDay)),
    };
  }

  if (presetKey === "ytd") {
    const prevYear = from.getFullYear() - 1;
    const toPrevYear = to.getFullYear() - 1;
    // Feb 29 -> Feb 28 when the previous year isn't a leap year.
    const clampedDay = Math.min(to.getDate(), daysInMonth(toPrevYear, to.getMonth()));
    return {
      from: toLocalISODate(new Date(prevYear, 0, 1)),
      to: toLocalISODate(new Date(toPrevYear, to.getMonth(), clampedDay)),
    };
  }

  // Custom: immediately preceding period of identical length.
  const spanDays = Math.round((to - from) / 86400000) + 1;
  const compareTo = addDays(from, -1);
  const compareFrom = addDays(compareTo, -(spanDays - 1));
  return { from: toLocalISODate(compareFrom), to: toLocalISODate(compareTo) };
}

// Display label for the comparison delta shown next to a scorecard.
export function comparisonLabel(value) {
  const isCustom = value && typeof value === "object" && value.key === "custom";
  if (isCustom) return "vs previous period";
  if (value === "wtd") return "vs previous week-to-date";
  if (value === "mtd") return "vs previous month-to-date";
  if (value === "ytd") return "vs previous year-to-date";
  return "vs previous period";
}
