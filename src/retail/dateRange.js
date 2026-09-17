// Retail's OWN copy of date-range preset/resolution logic — same fork as
// src/hrh-online/dateRange.js, from ../utils/dateRange.js (shared with the
// Auction Dashboard's own Topbar/StoreView/App.jsx), so this module can
// keep its own extra presets (Previous Week/Month/Year) WITHOUT changing
// what Auction's date picker offers. Same "duplicate small self-contained
// logic per module" convention this dashboard uses everywhere on the
// backend (every api/_*.js file has its own resolveRange, never a shared
// import) — this is the same idea on the frontend.
export const RANGE_PRESETS = [
  { key: "wtd", label: "Week to Date" },
  { key: "mtd", label: "Month to Date" },
  { key: "ytd", label: "Year to Date" },
  { key: "prevWeek", label: "Previous Week" },
  { key: "prevMonth", label: "Previous Month" },
  { key: "prevYear", label: "Previous Year" },
];

function formatShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Convert a JavaScript Date to YYYY-MM-DD using LOCAL time, not UTC — this
// prevents Asia/Manila dates from shifting backward when toISOString()
// converts them to UTC.
function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  if (value && typeof value === "object" && value.key === "custom") {
    const { from, to } = value;
    const label = from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`;
    return { from, to, label };
  }

  const preset = RANGE_PRESETS.find((p) => p.key === value) ?? RANGE_PRESETS[0];
  const today = new Date();

  let from;
  let to;
  if (preset.key === "wtd") {
    from = startOfWeek(today);
    to = today;
  } else if (preset.key === "mtd") {
    from = startOfMonth(today);
    to = today;
  } else if (preset.key === "ytd") {
    from = startOfYear(today);
    to = today;
  } else if (preset.key === "prevWeek") {
    // The full prior calendar week (Monday-Sunday) — NOT "to date".
    const thisWeekStart = startOfWeek(today);
    from = addDays(thisWeekStart, -7);
    to = addDays(thisWeekStart, -1);
  } else if (preset.key === "prevMonth") {
    // The full prior calendar month, 1st through last day.
    const thisMonthStart = startOfMonth(today);
    to = addDays(thisMonthStart, -1);
    from = new Date(to.getFullYear(), to.getMonth(), 1);
  } else {
    // prevYear: the full prior calendar year, Jan 1 - Dec 31.
    from = new Date(today.getFullYear() - 1, 0, 1);
    to = new Date(today.getFullYear() - 1, 11, 31);
  }

  return { from: toLocalISODate(from), to: toLocalISODate(to), label: preset.label };
}

// The comparable PREVIOUS period for a given date-range selection — same
// elapsed-window rule per preset as ../utils/dateRange.js's
// resolveComparisonRange, extended with the 3 new full-period presets
// (whose "previous" is simply the SAME full-period shift repeated once
// more, since — unlike wtd/mtd/ytd — there's no partial/elapsed-day
// clamping to account for: Previous Week/Month/Year are already whole
// periods, not "to date" ones).
export function resolveComparisonRange(value) {
  const current = resolveDateRange(value);
  const isCustom = value && typeof value === "object" && value.key === "custom";
  const presetKey = isCustom ? null : (RANGE_PRESETS.find((p) => p.key === value)?.key ?? "wtd");

  const from = new Date(`${current.from}T00:00:00`);
  const to = new Date(`${current.to}T00:00:00`);

  if (presetKey === "wtd" || presetKey === "prevWeek") {
    return { from: toLocalISODate(addDays(from, -7)), to: toLocalISODate(addDays(to, -7)) };
  }

  if (presetKey === "mtd") {
    const prevMonthDate = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const elapsedDay = to.getDate();
    const clampedDay = Math.min(elapsedDay, daysInMonth(prevYear, prevMonth));
    return { from: toLocalISODate(new Date(prevYear, prevMonth, 1)), to: toLocalISODate(new Date(prevYear, prevMonth, clampedDay)) };
  }

  if (presetKey === "prevMonth") {
    const prevPrevMonthDate = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const lastDay = daysInMonth(prevPrevMonthDate.getFullYear(), prevPrevMonthDate.getMonth());
    return {
      from: toLocalISODate(new Date(prevPrevMonthDate.getFullYear(), prevPrevMonthDate.getMonth(), 1)),
      to: toLocalISODate(new Date(prevPrevMonthDate.getFullYear(), prevPrevMonthDate.getMonth(), lastDay)),
    };
  }

  if (presetKey === "ytd") {
    const prevYear = from.getFullYear() - 1;
    const toPrevYear = to.getFullYear() - 1;
    // Feb 29 -> Feb 28 when the previous year isn't a leap year.
    const clampedDay = Math.min(to.getDate(), daysInMonth(toPrevYear, to.getMonth()));
    return { from: toLocalISODate(new Date(prevYear, 0, 1)), to: toLocalISODate(new Date(toPrevYear, to.getMonth(), clampedDay)) };
  }

  if (presetKey === "prevYear") {
    const y = from.getFullYear() - 1;
    return { from: toLocalISODate(new Date(y, 0, 1)), to: toLocalISODate(new Date(y, 11, 31)) };
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
  if (value === "prevWeek") return "vs the week before";
  if (value === "prevMonth") return "vs the month before";
  if (value === "prevYear") return "vs the year before";
  return "vs previous period";
}
