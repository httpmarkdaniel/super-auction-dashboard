import { Children } from "react";
import { retail } from "../theme";

// Compact KPI card — matches the mockup's own .kpi-card exactly (white,
// rounded-16, soft shadow, muted uppercase title, bold dark value, green/
// red delta, muted "mini" sub-line). `previousLabel` (an already-formatted
// string, e.g. formatPeso(previous)) renders a "vs {previousLabel}"
// mini-line. `icon` is optional. A `sparkline` prop is accepted but
// intentionally ignored — sparklines aren't part of this module's design.
export function KpiCard({ label, value, delta, sub, previousLabel, icon }) {
  const hasDelta = delta !== null && delta !== undefined;
  const positive = hasDelta && delta >= 0;
  return (
    <div className="rounded-2xl p-4" style={{ background: retail.surface, border: `1px solid ${retail.border}`, boxShadow: retail.shadow }}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon && (
          <span className="shrink-0" style={{ color: retail.blue }}>
            {icon}
          </span>
        )}
        <div className="text-[13px] font-bold" style={{ color: retail.muted }}>
          {label}
        </div>
      </div>
      <div className="text-[20px] font-extrabold leading-none tabular-nums" style={{ color: retail.ink }}>
        {value}
      </div>
      {hasDelta && (
        <div className="mt-1.5 text-[13px] font-bold" style={{ color: positive ? retail.good : retail.bad }}>
          {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
        </div>
      )}
      {(sub || previousLabel) && (
        <div className="mt-0.5 text-[12px]" style={{ color: retail.muted }}>
          {previousLabel ? `vs ${previousLabel}` : sub}
        </div>
      )}
    </div>
  );
}

// Static (not interpolated) class lists per card count — Tailwind's JIT
// scanner only picks up class names that appear literally in source.
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
  return <div className={`grid ${cols} gap-3 mb-3.5`}>{children}</div>;
}
