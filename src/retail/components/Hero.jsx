import { retail } from "../theme";

// Sales Overview's intro card — same content as the old gradient hero,
// now a "LIVE DASHBOARD UNIFORM FORMAT" card (white, 10px radius, reference
// .mini stat boxes). `stats`: [{ label, value, delta, sub }]
// (delta omitted renders no arrow line). Used once, at the top of Sales
// Overview.
// Static (not interpolated) class per stat count — Tailwind's JIT scanner
// only picks up class names literally present in source, so a
// dynamically-built `grid-cols-${n}` string would silently fail to
// generate (same convention as src/hrh-online/components/Kpi.jsx's
// COLS_BY_COUNT). Stats should fill the row width regardless of count,
// never leave an empty trailing cell (that's exactly what removing the
// 3rd stat card left behind when this was a hardcoded grid-cols-3).
const STATS_COLS_BY_COUNT = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };

export default function Hero({ eyebrow, title, description, stats }) {
  return (
    <div
      className="card rounded-[10px] p-6 grid gap-5 items-center mb-3.5"
      style={{ background: retail.surface, border: `1px solid ${retail.border}`, color: retail.ink, boxShadow: retail.shadow, gridTemplateColumns: "1.3fr 1fr" }}
    >
      <div>
        {eyebrow && (
          <small className="block text-[11px] font-extrabold" style={{ color: "#98a4b7" }}>
            {eyebrow}
          </small>
        )}
        <h2 className="my-2 text-[22px] leading-tight font-bold">{title}</h2>
        {description && (
          <p className="m-0 max-w-[540px] text-[14px]" style={{ color: "#617089" }}>
            {description}
          </p>
        )}
      </div>
      <div className={`grid gap-3.5 ${STATS_COLS_BY_COUNT[stats.length] || "grid-cols-3"}`}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg p-3.5" style={{ border: `1px solid ${retail.border}` }}>
            <div className="text-[12px] font-extrabold tracking-[0.3px]" style={{ color: "#95a0b3" }}>
              {s.label}
            </div>
            <div className="text-[26px] font-extrabold my-1.5 tracking-[-0.5px]">{s.value}</div>
            {s.delta !== undefined && s.delta !== null && (
              <div className="text-[13px] font-bold" style={{ color: s.delta >= 0 ? "#16823a" : "#d62d2d" }}>
                {s.delta >= 0 ? "▲" : "▼"} {Math.abs(s.delta).toFixed(1)}%
              </div>
            )}
            {s.sub && (
              <span className="block mt-1 text-[12px]" style={{ color: "#7d8ba2" }}>
                {s.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
