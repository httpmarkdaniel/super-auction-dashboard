import { retail } from "../theme";

// Colored icon-badge + bold headline + description — matches the
// mockup's own .insight exactly. `icon`: "up" | "down" | "cart" | "warn" |
// "announce", each with its own badge color (see ICON_META below).
const ICON_META = {
  up: { symbol: "↗", bg: retail.good },
  down: { symbol: "↘", bg: retail.bad },
  cart: { symbol: "🛒", bg: retail.blue },
  warn: { symbol: "!", bg: retail.bad },
  announce: { symbol: "📣", bg: retail.purple },
};

export function InsightCard({ icon, title, description }) {
  const meta = ICON_META[icon] || ICON_META.announce;
  return (
    <div className="grid gap-3 rounded-2xl p-3" style={{ gridTemplateColumns: "40px 1fr", background: retail.bg, border: `1px solid ${retail.border}` }}>
      <div className="w-10 h-10 rounded-xl grid place-items-center text-[18px]" style={{ background: meta.bg, color: "#ffffff" }}>
        {meta.symbol}
      </div>
      <div>
        <b className="block mb-1" style={{ color: retail.ink }}>
          {title}
        </b>
        <span className="text-[13px] leading-[1.45]" style={{ color: retail.ink2 }}>
          {description}
        </span>
      </div>
    </div>
  );
}

export function InsightList({ items }) {
  return (
    <div className="grid gap-3">
      {items.map((it, i) => (
        <InsightCard key={i} {...it} />
      ))}
    </div>
  );
}
