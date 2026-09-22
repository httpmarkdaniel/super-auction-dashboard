import { Children, useEffect, useRef, useState } from "react";
import { retail } from "../theme";

// Small "ⓘ" trigger + click-to-toggle popover explaining exactly how a
// card's number is computed (source table, filters, scope) — click-based
// rather than hover so it works on touch and can hold a full sentence.
// stopPropagation keeps it from also firing the card's own onClick when
// the card is itself a drill-down trigger.
function InfoIcon({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="How this is calculated"
        onClick={() => setOpen((o) => !o)}
        className="w-[15px] h-[15px] rounded-full flex items-center justify-center text-[9.5px] font-bold leading-none"
        style={{ background: retail.bg, color: retail.muted, border: `1px solid ${retail.border}` }}
      >
        i
      </button>
      {open && (
        <div
          className="absolute z-30 top-[19px] left-0 w-60 rounded-lg px-3 py-2.5 text-[11.5px] leading-snug shadow-lg"
          style={{ background: retail.navy, color: "#fff" }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

// Compact KPI card — matches the mockup's own .kpi-card exactly (white,
// rounded-16, soft shadow, muted uppercase title, bold dark value, green/
// red delta, muted "mini" sub-line). `previousLabel` (an already-formatted
// string, e.g. formatPeso(previous)) renders a "vs {previousLabel}"
// mini-line. `icon` is optional. A `sparkline` prop is accepted but
// intentionally ignored — sparklines aren't part of this module's design.
// `onClick` (optional) makes the card an interactive drill-down trigger —
// adds a pointer cursor, hover lift, and a subtle "view breakdown" hint so
// it reads as clickable without cluttering cards that aren't.
// `methodology` (optional) adds the ⓘ popover described above.
export function KpiCard({ label, value, delta, sub, previousLabel, icon, onClick, methodology }) {
  const hasDelta = delta !== null && delta !== undefined;
  const positive = hasDelta && delta >= 0;
  return (
    <div
      className={`rounded-2xl p-4 ${onClick ? "transition-shadow hover:shadow-md" : ""}`}
      style={{ background: retail.surface, border: `1px solid ${retail.border}`, boxShadow: retail.shadow, cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon && (
          <span className="shrink-0" style={{ color: retail.blue }}>
            {icon}
          </span>
        )}
        <div className="text-[13px] font-bold" style={{ color: retail.muted }}>
          {label}
        </div>
        {methodology && <InfoIcon text={methodology} />}
        {onClick && (
          <span className="ml-auto text-[10px] font-semibold" style={{ color: retail.blue }}>
            View breakdown ›
          </span>
        )}
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
