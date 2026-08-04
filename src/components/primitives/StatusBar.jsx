import { formatPeso } from "../../utils/format";

const STATUS_BG = { good: "bg-good", warning: "bg-warning", critical: "bg-critical" };

// Fixed-order buckets with a real severity meaning (aging, risk) — status
// color is correct here because the color IS the state, always paired with a label.
export default function StatusBar({ rows }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_BG[r.status]}`} />
          <span className="text-[12.5px] text-ink w-[76px] shrink-0">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-gridline overflow-hidden">
            <div
              className={`h-full rounded-full ${STATUS_BG[r.status]}`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <span className="text-[12.5px] tabular text-series1 w-[86px] text-right shrink-0">
            {formatPeso(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
