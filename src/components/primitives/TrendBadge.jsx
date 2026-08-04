const CONFIG = {
  STABLE: { color: "text-ink", dot: "bg-muted" },
  DECLINING: { color: "text-toneRedText", dot: "bg-critical" },
  IMPROVING: { color: "text-toneGreenText", dot: "bg-good" },
  VOLATILE: { color: "text-toneAmberText", dot: "bg-warning" },
};

// Status color used correctly: these are literal states (declining/improving/…),
// never repurposed for a data series, always paired with the label text.
export default function TrendBadge({ trend }) {
  const c = CONFIG[trend] || CONFIG.STABLE;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {trend}
    </span>
  );
}
