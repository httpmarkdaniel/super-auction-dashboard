// Generic horizontal ranked bar — NOT peso-specific (unlike RankedBar),
// for any metric (bidder counts, sell-through %, share %). One shared
// primitive reused by Bidders by Category / Stuck Inventory / Top-5
// Vendor Concentration rather than three bespoke bar implementations.
export default function RankedMetricBar({ rows, labelKey, valueKey, max, formatValue, subLabel, emptyMessage = "No data for this period." }) {
  const computedMax = max ?? Math.max(...rows.map((r) => r[valueKey]), 1);

  if (rows.length === 0) {
    return <div className="text-center text-muted text-[15px] py-6">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r[labelKey]}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[14.5px] text-ink truncate">{r[labelKey]}</span>
            <span className="text-[14px] tabular text-series1 font-medium shrink-0">
              {formatValue ? formatValue(r) : r[valueKey]}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gridline overflow-hidden">
            <div className="h-full rounded-full bg-series8" style={{ width: `${(r[valueKey] / computedMax) * 100}%` }} />
          </div>
          {subLabel && <div className="text-[12px] text-muted mt-0.5">{subLabel(r)}</div>}
        </div>
      ))}
    </div>
  );
}
