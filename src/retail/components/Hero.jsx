import { retail } from "../theme";

// Gradient navy hero banner with decorative circles — matches the
// mockup's own .hero exactly. `stats`: [{ label, value, delta, sub }]
// (delta omitted renders no arrow line). Used once, at the top of Sales
// Overview.
const DECORATIVE_BG =
  "linear-gradient(90deg, rgba(14,50,96,.97), rgba(14,50,96,.84)), url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"260\"><rect width=\"100%25\" height=\"100%25\" fill=\"%231e3a5f\"/><g opacity=\"0.14\"><circle cx=\"160\" cy=\"140\" r=\"90\" fill=\"white\"/><circle cx=\"420\" cy=\"80\" r=\"110\" fill=\"white\"/><circle cx=\"720\" cy=\"150\" r=\"120\" fill=\"white\"/><circle cx=\"1040\" cy=\"90\" r=\"100\" fill=\"white\"/></g></svg>') center/cover";

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
      className="rounded-[18px] p-7 grid gap-5 items-center mb-3.5"
      style={{ background: DECORATIVE_BG, color: "#ffffff", boxShadow: retail.shadow, gridTemplateColumns: "1.3fr 1fr" }}
    >
      <div>
        {eyebrow && (
          <small className="uppercase tracking-[2px] opacity-85 block">{eyebrow}</small>
        )}
        <h1 className="my-2.5 text-[26px] leading-tight">{title}</h1>
        {description && (
          <p className="m-0 max-w-[540px]" style={{ color: "#d9e8f8" }}>
            {description}
          </p>
        )}
      </div>
      <div className={`grid gap-3.5 ${STATS_COLS_BY_COUNT[stats.length] || "grid-cols-3"}`}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}>
            <div className="text-[11.5px] uppercase tracking-[1px]" style={{ color: "#d5e6f7" }}>
              {s.label}
            </div>
            <div className="text-[30px] font-extrabold my-1.5">{s.value}</div>
            {s.delta !== undefined && s.delta !== null && (
              <div className="text-[13px] font-bold" style={{ color: s.delta >= 0 ? "#4ade80" : "#f87171" }}>
                {s.delta >= 0 ? "▲" : "▼"} {Math.abs(s.delta).toFixed(1)}%
              </div>
            )}
            {s.sub && (
              <span className="block mt-1 text-[12px]" style={{ color: "#8aa8c8" }}>
                {s.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
