// Every Customer Analytics report is served by api/_customer-analytics.js
// through the shared /api/retail-analytics function (report=ca*).
export async function fetchCa(report, params = {}, signal) {
  const qs = new URLSearchParams({ report });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, Array.isArray(v) ? v.join("|") : String(v));
  }
  const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // fall through to the status error below
  }
  if (!res.ok || !json || json.error) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
  return json;
}

export function pctChange(cur, prev) {
  if (cur === null || cur === undefined || !prev) return null;
  return ((cur - prev) / prev) * 100;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function formatMonth(iso) {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}
