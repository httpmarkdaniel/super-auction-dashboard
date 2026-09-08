import { hrh } from "../theme";

// Segmented share/contribution bar — used for channel/category/segment
// contribution breakdowns across HRH Online instead of a pie chart, to
// keep the dense, no-clutter look the design brief asks for.
export default function ShareBar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="h-3 w-full rounded-sm overflow-hidden flex" style={{ border: `1px solid ${hrh.border}` }}>
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold" style={{ color: hrh.ink }}>
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
