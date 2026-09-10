import { TREND_BUCKETS } from "../trendBucket";
import { hrh } from "../theme";

// Day/Week/Month toggle for a trend panel — shared by Executive Overview's
// Sales Trend and Sales Analytics' Category/Subcategory Contribution.
export default function TrendBucketPills({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {TREND_BUCKETS.map((b) => {
        const active = b.key === value;
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => onChange(b.key)}
            className="text-[11.5px] font-semibold px-2.5 h-6 rounded"
            style={
              active
                ? { background: hrh.navy, color: "#ffffff" }
                : { background: "transparent", color: hrh.ink2, border: `1px solid ${hrh.border}` }
            }
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
