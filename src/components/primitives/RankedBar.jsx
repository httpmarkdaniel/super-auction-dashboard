import { formatPeso } from "../../utils/format";

// Horizontal ranked bar list — one hue (magnitude comparison, not identity),
// direct-labeled so the bar and the number never disagree.
// badgeKey: optional field name (e.g. "new_or_returning") whose value —
// already resolved server-side, never inferred here — renders as a
// compact chip beside the name. A shrink-0 sibling of the (truncating)
// name, so the badge itself is never the thing that gets cut off.
function Badge({ value }) {
  if (!value) return null;
  const isNew = value === "new";
  return (
    <span
      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
        isNew ? "bg-navySoft text-navy" : "bg-gridline text-muted"
      }`}
    >
      {isNew ? "New" : "Returning"}
    </span>
  );
}

export default function RankedBar({ rows, labelKey, valueKey, metaKey, metaLabel, badgeKey, showRank = true, showAvg = false, emptyMessage = "No data for this period." }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);

  if (rows.length === 0) {
    return <div className="text-center text-muted text-[15px] py-6">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r[labelKey]} className="flex items-center gap-3">
          {showRank && (
            <div className={`w-4 text-center text-[14.5px] shrink-0 tabular font-bold ${i === 0 ? "text-navy" : "text-muted"}`}>
              {i + 1}
            </div>
          )}
          <div className="w-[150px] shrink-0 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[15.5px] text-ink truncate">{r[labelKey]}</span>
              {badgeKey && <Badge value={r[badgeKey]} />}
            </div>
            {metaKey && (
              <div className="text-[13.5px] text-muted">
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
            <div className="text-[15.5px] tabular text-series1">{formatPeso(r[valueKey])}</div>
            {showAvg && metaKey && r[metaKey] > 0 && (
              <div className="text-[13.5px] tabular text-series1">{formatPeso(Math.round(r[valueKey] / r[metaKey]))} avg</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
