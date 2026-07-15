const ROLE_COLOR = {
  neg: "bg-divNeg",
  mid: "bg-divMid",
  pos: "bg-divPos",
};
const ROLE_DOT = {
  neg: "bg-divNeg",
  mid: "bg-[var(--baseline)]",
  pos: "bg-divPos",
};

// Ordered-scale share (below / at / above a baseline), centered on the neutral
// midpoint — the diverging job, not a categorical one.
export default function DivergingBar({ segments }) {
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden flex mb-4">
        {segments.map((s) => (
          <div key={s.label} className={`${ROLE_COLOR[s.role]} h-full`} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <div className="space-y-2.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ROLE_DOT[s.role]}`} />
            <span className="text-[13px] text-ink flex-1">{s.label}</span>
            {s.count !== undefined && (
              <span className="text-[12px] tabular text-ink2">{s.count} lots</span>
            )}
            <span className="text-[13px] tabular text-ink w-[64px] text-right">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
