import { hrh } from "../theme";
import { formatNum } from "../format";

// Generic stage funnel (Order Status, Traffic, Publishing, Fulfillment) —
// plain bars rather than a pie/funnel chart type, for a flat executive-
// readable look with an explicit stage-over-stage drop-off.
export default function FunnelList({ stages }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const pct = (s.value / max) * 100;
        const prev = i > 0 ? stages[i - 1].value : null;
        const dropoff = prev ? ((prev - s.value) / (prev || 1)) * 100 : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-[128px] text-[12.5px] shrink-0" style={{ color: hrh.ink2 }}>
              {s.label}
            </div>
            <div className="flex-1 h-6 rounded-sm overflow-hidden" style={{ background: hrh.bg }}>
              <div
                className="h-full rounded-sm flex items-center px-2 text-[11px] font-semibold text-white"
                style={{ width: `${Math.max(pct, 6)}%`, background: hrh.navyAccentRow }}
              >
                {formatNum(s.value)}
              </div>
            </div>
            <div className="w-[52px] text-[11px] text-right shrink-0" style={{ color: hrh.muted }}>
              {dropoff != null ? `-${dropoff.toFixed(0)}%` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
