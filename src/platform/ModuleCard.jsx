// Portal module card — two fixed visual variants keyed off module.status,
// independent of the Auction dashboard's own light/dark theme toggle (this
// is platform chrome, not a dashboard view). "available" renders as a dense
// dark navy feature card with a per-module decorative glyph; "coming-soon"
// renders as a small, deliberately non-clickable-looking light tile. Same
// module shape either way, so future modules (Retail, Inventory, ...) drop
// into whichever grid matches their status with zero extra work.
const ORANGE = "#d99a3d";

// Faint per-module decorative background glyph for "available" cards —
// abstract chart geometry only, keyed by module.id, never stock imagery.
// Falls back to a generic bar/node cluster for any future available module.
function CardGlyph({ id }) {
  if (id === "auction") {
    return (
      <svg viewBox="0 0 220 120" className="absolute right-0 bottom-0 w-[190px] h-[104px] opacity-[0.16]" aria-hidden="true">
        <polyline
          points="4,96 40,80 72,88 104,52 136,60 168,24 214,8"
          fill="none"
          stroke={ORANGE}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[[40, 80], [104, 52], [168, 24], [214, 8]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3.2" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </svg>
    );
  }

  if (id === "hrh-online") {
    return (
      <svg viewBox="0 0 220 120" className="absolute right-0 bottom-0 w-[190px] h-[104px] opacity-[0.16]" aria-hidden="true">
        {[18, 42, 66, 90, 114, 138, 162, 186].map((x, i) => (
          <rect
            key={x}
            x={x}
            y={40}
            width="12"
            height="72"
            rx="2"
            fill="#7e93c2"
            className="hero-bg-bar"
            style={{ transform: `scaleY(${0.4 + ((i * 7) % 5) / 10})`, animationDelay: `${i * 0.3}s` }}
          />
        ))}
        <line x1="8" y1="98" x2="212" y2="98" stroke={ORANGE} strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 220 120" className="absolute right-0 bottom-0 w-[190px] h-[104px] opacity-[0.14]" aria-hidden="true">
      {[30, 80, 130, 180].map((cx, i) => (
        <circle key={cx} cx={cx} cy={60} r="4" fill={ORANGE} className="hero-node" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </svg>
  );
}

function AvailableCard({ module }) {
  return (
    <a
      href={module.route}
      className="group relative overflow-hidden rounded-xl p-6 flex flex-col transition-transform hover:-translate-y-0.5"
      style={{ background: "linear-gradient(155deg, #16202f 0%, #0f1622 78%)", border: "1px solid #24304a" }}
    >
      <CardGlyph id={module.id} />
      <div className="relative flex items-start justify-between gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center text-[15px] font-bold shrink-0"
          style={{ background: ORANGE, color: "#ffffff" }}
        >
          {module.name.charAt(0)}
        </div>
        <span
          className="text-[10.5px] tracking-[0.1em] uppercase font-semibold px-2.5 py-1 rounded-full shrink-0"
          style={{ background: "rgba(217,154,61,0.16)", color: "#e8b064" }}
        >
          Available
        </span>
      </div>

      <h3 className="relative text-[26px] leading-none tracking-[0.01em] font-display mb-2" style={{ color: "#f5f6f8" }}>
        {module.name.toUpperCase()}
      </h3>
      <p className="relative text-[13.5px] leading-relaxed mb-6 max-w-[85%]" style={{ color: "#a3adba" }}>
        {module.description}
      </p>

      <div className="relative mt-auto">
        <span
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold px-3.5 py-2 rounded-lg transition-transform group-hover:translate-x-0.5"
          style={{ background: ORANGE, color: "#ffffff" }}
        >
          {module.actionLabel}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </a>
  );
}

function ComingSoonCard({ module }) {
  return (
    <div
      className="flex flex-col rounded-lg p-3.5 cursor-default"
      style={{ background: "#ffffff", border: "1px solid #e7eaf0" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold shrink-0"
          style={{ background: "#eef0f4", color: "#5b6573" }}
        >
          {module.name.charAt(0)}
        </div>
        <span
          className="text-[9.5px] tracking-[0.06em] uppercase font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
          style={{ background: "#eef0f4", color: "#5b6573" }}
        >
          Soon
        </span>
      </div>
      <h3 className="text-[15px] leading-tight font-display tracking-[0.01em] mb-1" style={{ color: "#22304f" }}>
        {module.name.toUpperCase()}
      </h3>
      <p className="text-[11.5px] leading-snug" style={{ color: "#94a0ae" }}>
        {module.description}
      </p>
    </div>
  );
}

export default function ModuleCard({ module }) {
  return module.status === "available" ? <AvailableCard module={module} /> : <ComingSoonCard module={module} />;
}
