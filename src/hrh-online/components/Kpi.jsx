import { hrh } from "../theme";

// Compact executive KPI card — thin orange top accent, room for a future
// comparison delta and a short contextual label, per the Phase 2 brief.
export function KpiCard({ label, value, delta, sub }) {
  const hasDelta = delta !== null && delta !== undefined;
  const positive = hasDelta && delta >= 0;
  return (
    <div className="relative overflow-hidden rounded-md p-3.5" style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: hrh.accent }} />
      <div className="text-[11px] uppercase tracking-[0.06em] font-semibold mb-1.5" style={{ color: hrh.ink2 }}>
        {label}
      </div>
      <div className="text-[19px] font-bold tabular-nums" style={{ color: hrh.ink }}>
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
    </div>
  );
}

export function KpiRow({ children }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">{children}</div>;
}
