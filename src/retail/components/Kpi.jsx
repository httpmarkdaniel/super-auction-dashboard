import { Children } from "react";
import { retail } from "../theme";

// Compact KPI card — matches the reference report's own .kpi exactly
// (white bg, soft shadow, bold navy value, no colored top accent bar).
// `previousLabel` (an already-formatted string, e.g. formatPeso(previous))
// renders a "vs {previousLabel}" comparison line at the bottom of the
// card alongside the delta. `icon` is optional. A `sparkline` prop is
// accepted but intentionally ignored — sparklines aren't part of this
// module's design.
export function KpiCard({ label, value, delta, sub, previousLabel, icon }) {
  const hasDelta = delta !== null && delta !== undefined;
  const positive = hasDelta && delta >= 0;
  return (
    <div className="rounded-lg p-3.5" style={{ background: retail.surface, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && (
          <span className="shrink-0" style={{ color: retail.navy }}>
            {icon}
          </span>
        )}
        <div className="text-[10.5px] uppercase tracking-[0.04em] font-semibold" style={{ color: retail.ink2 }}>
          {label}
        </div>
      </div>
      <div className="text-[19px] font-bold leading-none tabular-nums" style={{ color: retail.navy }}>
        {value}
      </div>
      {(hasDelta || sub) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] flex-wrap">
          {hasDelta && (
            <span className="font-bold" style={{ color: positive ? retail.good : retail.bad }}>
              {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span style={{ color: retail.muted }}>{sub}</span>}
        </div>
      )}
      {previousLabel && (
        <div className="mt-1 text-[10.5px]" style={{ color: retail.muted }}>
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
