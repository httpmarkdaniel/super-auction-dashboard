import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import usePalette from "../../usePalette";

function formatBucketLabel(bucket, bucketLabel) {
  if (!bucket) return "";
  const d = new Date(bucket.replace(" ", "T") + (bucket.includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return bucket;
  if (bucketLabel === "month") return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

function BarTooltip({ active, payload, bucketLabel }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="floating px-3 py-2 text-[12.5px] leading-tight shadow-lg">
      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">{formatBucketLabel(row.bucket, bucketLabel)}</div>
      <div className="text-ink font-medium tabular">Total {row.total}</div>
      <div className="text-series8 tabular">New {row.new}</div>
      <div className="text-muted tabular">Returning {row.returning}</div>
    </div>
  );
}

// New vs Returning stacked bar by period — shared by Bidder Analytics and
// Vendor Analytics' own "by Period" time series. New = warm accent
// (series8/orange), Returning = navy (series1). Bucket granularity
// (day/week/month) is whatever the backend picked for the selected date
// range — never hardcoded here.
export default function PeriodStackedBar({ rows, bucketLabel }) {
  const palette = usePalette();
  const data = rows.map((r) => ({
    bucket: r.bucket,
    label: formatBucketLabel(r.bucket, bucketLabel),
    new: r.new_bidders ?? r.new_vendors ?? 0,
    returning: r.returning_bidders ?? r.returning_vendors ?? 0,
    total: r.total,
  }));

  if (data.length === 0) {
    return <div className="text-center text-muted text-[15px] py-8">No data for this period.</div>;
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: palette.textSecondary }} axisLine={{ stroke: palette.gridline }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: palette.textSecondary }} axisLine={false} tickLine={false} width={32} />
          <Tooltip content={<BarTooltip bucketLabel={bucketLabel} />} cursor={{ fill: palette.gridline, opacity: 0.4 }} />
          <Bar dataKey="returning" stackId="a" fill={palette.series1} radius={[0, 0, 0, 0]} />
          <Bar dataKey="new" stackId="a" fill={palette.series8 || "#eb6834"} radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey="total"
              position="top"
              content={({ x, y, width, value, index }) => (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fill={palette.textSecondary}>
                  {data[index]?.total ?? value}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
