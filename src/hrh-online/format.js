// Single formatting import surface for every HRH Online page — re-exports
// the platform's existing peso formatters (genuinely shared, Auction-
// agnostic) alongside two small HRH-local helpers.
export { formatPeso, formatCompactPeso } from "../utils/format";

export function formatPct(n, digits = 1) {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatNum(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-PH");
}
