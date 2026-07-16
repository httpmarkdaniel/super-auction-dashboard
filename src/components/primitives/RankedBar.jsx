import { formatPeso } from "../../utils/format";

// Horizontal ranked bar list — one hue (magnitude comparison, not identity),
// direct-labeled so the bar and the number never disagree.
export default function RankedBar({ rows, labelKey, valueKey, metaKey, metaLabel, showRank = true, showAvg = false }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r[labelKey]} className="flex items-center gap-3">
          {showRank && (
            <div className={`w-4 text-center text-[12px] shrink-0 tabular font-bold ${i === 0 ? "text-brandOrange" : "text-muted"}`}>
              {i + 1}
            </div>
          )}
          <div className="w-[150px] shrink-0 min-w-0">
            <div className="text-[13px] text-ink truncate">{r[labelKey]}</div>
            {metaKey && (
              <div className="text-[11px] text-muted">
                {r[metaKey]} {metaLabel}
              </div>
            )}
          </div>
          <div className="flex-1 h-2 rounded-full bg-gridline overflow-hidden">
            <div
              className="h-full rounded-full bg-series1"
              style={{ width: `${(r[valueKey] / max) * 100}%` }}
            />
          </div>
          <div className="w-[96px] text-right shrink-0">
            <div className="text-[13px] tabular text-ink">{formatPeso(r[valueKey])}</div>
            {showAvg && metaKey && r[metaKey] > 0 && (
              <div className="text-[11px] tabular text-muted">{formatPeso(Math.round(r[valueKey] / r[metaKey]))} avg</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
