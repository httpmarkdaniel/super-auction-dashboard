import { Children } from "react";
import { hrh } from "../theme";

// Compact executive KPI card — reference .kpi look (no top accent), room for a future
// comparison delta and a short contextual label, per the Phase 2 brief.
// `previousLabel` (an already-formatted string, e.g. formatPeso(previous))
// renders a "vs {previousLabel}" comparison line at the bottom of the card
// alongside the delta badge — used by Executive Overview, whose "Compare
// to" pill selector (Day/Week/Month) changes what "previous" means.
// `icon` is optional. A `sparkline` prop is accepted but intentionally
// ignored (not rendered) — sparklines were removed dashboard-wide per
// explicit request; callers still passing one are harmless no-ops.
export function KpiCard({ label, value, delta, sub, previousLabel, icon }) {
  const hasDelta = delta !== null && delta !== undefined;
  const positive = hasDelta && delta >= 0;
  return (
    <div
      className="card relative overflow-hidden rounded-[10px] px-4 pt-4 pb-3.5"
      style={{ background: hrh.surface, border: `1px solid ${hrh.border}`, boxShadow: "0 1px 2px rgba(13,24,45,.06),0 8px 24px rgba(13,24,45,.04)" }}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        {icon && (
          <span className="shrink-0" style={{ color: "#95a0b3" }}>
            {icon}
          </span>
        )}
        <div className="text-[12px] font-extrabold tracking-[0.3px]" style={{ color: "#95a0b3" }}>
          {label}
        </div>
      </div>
      <div className="text-[26px] font-extrabold leading-none tabular-nums tracking-[-0.5px]" style={{ color: hrh.ink }}>
        {value}
      </div>
      {(hasDelta || sub) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] flex-wrap">
          {hasDelta && (
            <span className="font-semibold" style={{ color: positive ? hrh.good : hrh.bad }}>
              {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span style={{ color: hrh.muted }}>{sub}</span>}
        </div>
      )}
      {previousLabel && (
        <div className="mt-1 pt-1.5 text-[11px]" style={{ borderTop: `1px solid ${hrh.border}`, color: hrh.muted }}>
          vs {previousLabel}
        </div>
      )}
    </div>
  );
}

// Static (not interpolated) class lists per card count — Tailwind's JIT
// scanner only picks up class names that appear literally in source, so a
// dynamically-built `grid-cols-${n}` string would silently fail to
// generate. Cards should fill the full row width regardless of count
// (never leave an awkward empty slot), so the column count matches the
// child count exactly at the widest breakpoint.
const COLS_BY_COUNT = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
  7: "grid-cols-2 md:grid-cols-4 xl:grid-cols-7",
};

export function KpiRow({ children }) {
  const count = Children.count(children);
  const cols = COLS_BY_COUNT[count] || "grid-cols-2 md:grid-cols-3 xl:grid-cols-6";
  return <div className={`grid ${cols} gap-3 mb-5`}>{children}</div>;
}
