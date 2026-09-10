import { hrh } from "../theme";
import { formatNum } from "../format";

// Label + proportional horizontal bar + raw count — for breakdowns where the
// actual count matters more than a percentage share (Purchase Frequency,
// Customer Spend Distribution). Same shell as FunnelList but without a
// drop-off column, since these buckets aren't sequential stages of one flow.
export default function HorizontalBarList({ rows }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        return (
          <div key={r.label} className="flex items-center gap-3">
            <div className="w-[104px] text-[12.5px] shrink-0" style={{ color: hrh.ink2 }}>
              {r.label}
            </div>
            <div className="flex-1 h-6 rounded-sm overflow-hidden" style={{ background: hrh.bg }}>
              <div
                className="h-full rounded-sm flex items-center px-2 text-[11px] font-semibold text-white"
                style={{ width: `${Math.max(pct, r.value > 0 ? 6 : 0)}%`, background: hrh.navyAccentRow }}
              >
                {formatNum(r.value)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
