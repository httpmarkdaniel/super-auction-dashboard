import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import usePalette from "../../usePalette";

// Compact New vs Returning donut for UNIQUE ACTIVE BIDDERS TODAY (PART 4) —
// a bidder-COUNT composition, never a bid-event count. New = first-ever
// real bid today; Returning = real bid today with an earlier real bid on
// record (see api/overview.js's todayActivityResultPromise).
export default function BiddersTodayPie({ newBidders, returningBidders }) {
  const palette = usePalette();
  const total = newBidders + returningBidders;
  const newPct = total > 0 ? (newBidders / total) * 100 : 0;
  const returningPct = total > 0 ? 100 - newPct : 0;

  const data = [
    { name: "New", value: newBidders },
    { name: "Returning", value: returningBidders },
  ];
  const colors = [palette.series1, palette.series2];

  return (
    <div className="relative bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
      <div className="kpi-label mb-2.5">Bidders Today · New vs Returning</div>
      <div className="flex items-center gap-4">
        <div className="w-[76px] h-[76px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={22} outerRadius={36} paddingAngle={total > 0 ? 2 : 0} isAnimationActive={false}>
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={colors[i]} stroke="none" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-[13.5px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[0] }} />
            <span className="text-ink">New · {newBidders} ({newPct.toFixed(1)}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[1] }} />
            <span className="text-ink">Returning · {returningBidders} ({returningPct.toFixed(1)}%)</span>
          </div>
          <div className="text-muted">Total · {total}</div>
        </div>
      </div>
    </div>
  );
}
