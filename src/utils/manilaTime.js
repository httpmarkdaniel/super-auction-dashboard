// ClickHouse gives "YYYY-MM-DD HH:MM:SS[.mmm]" for auction/bid timestamps,
// and that string already represents Asia/Manila wall-clock time directly
// (the Philippines has no DST, a fixed UTC+8 offset year-round) — it is NOT
// a UTC instant that needs timezone conversion for display. Parsing the
// components manually (rather than `new Date(str)` + an Intl timezone
// formatter) guarantees the displayed numbers always match the stored
// numbers, regardless of the viewer's own browser timezone.
function parseParts(chDateTime) {
  if (!chDateTime) return null;
  const [datePart, timePart = "00:00:00"] = chDateTime.split(" ");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s] = timePart.split(":").map((v) => Math.floor(Number(v)));
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return { y, mo, d, h, mi, s: Number.isNaN(s) ? 0 : s };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatManila(chDateTime, { withDate = true, withYear = false } = {}) {
  const p = parseParts(chDateTime);
  if (!p) return "—";
  const hour12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ampm = p.h < 12 ? "AM" : "PM";
  const time = `${hour12}:${String(p.mi).padStart(2, "0")} ${ampm}`;
  if (!withDate) return time;
  return withYear ? `${MONTHS[p.mo - 1]} ${p.d}, ${p.y}, ${time}` : `${MONTHS[p.mo - 1]} ${p.d}, ${time}`;
}

// Same formatting as formatManila, but for a real epoch ms instant (e.g.
// Date.now()) rather than a ClickHouse wall-clock string — used only for
// "current moment" displays (the Active Auction Timeline's Current
// milestone), never for stored data timestamps. The Philippines' fixed
// UTC+8 offset makes the +8h shift exact, not an approximation.
export function formatManilaFromEpochMs(ms, { withDate = true, withYear = false } = {}) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const d = new Date(ms + 8 * 3600 * 1000);
  const h = d.getUTCHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  const time = `${hour12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${ampm}`;
  if (!withDate) return time;
  const monthLabel = MONTHS[d.getUTCMonth()];
  return withYear ? `${monthLabel} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${time}` : `${monthLabel} ${d.getUTCDate()}, ${time}`;
}

// Real epoch ms for a Manila wall-clock string — the Philippines' fixed
// UTC+8 offset makes this exact, not a guess, so it's safe to compare
// directly against Date.now() for countdowns and chronological ordering.
export function manilaToEpochMs(chDateTime) {
  const p = parseParts(chDateTime);
  if (!p) return null;
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - 8 * 3600 * 1000;
}

export function timeRemainingLabel(endingChDateTime) {
  const endMs = manilaToEpochMs(endingChDateTime);
  if (endMs == null) return "—";
  const ms = endMs - Date.now();
  if (ms <= 0) return "Ended";
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function isEndingSoon(endingChDateTime, thresholdSec = 3600) {
  const endMs = manilaToEpochMs(endingChDateTime);
  if (endMs == null) return false;
  return (endMs - Date.now()) / 1000 <= thresholdSec;
}
