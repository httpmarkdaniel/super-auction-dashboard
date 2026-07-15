export function formatPeso(n) {
  if (n === null || n === undefined) return "—";
  return "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export function formatCompactPeso(n) {
  if (n === null || n === undefined) return "—";
  return "₱" + n.toLocaleString("en-PH", { notation: "compact", maximumFractionDigits: 1 });
}
