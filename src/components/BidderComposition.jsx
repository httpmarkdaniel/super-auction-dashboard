import { LineChart, Line, ResponsiveContainer } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";

export default function BidderComposition({ data: bidderComposition }) {
  const palette = usePalette();
  const total = bidderComposition.newBidders + bidderComposition.returningBidders;
  const newPct = Math.round((bidderComposition.newBidders / total) * 100);
  const returningPct = 100 - newPct;

  return (
    <Card title="Bidder Composition · This Week">
      <div className="flex items-end gap-6 mb-4">
        <div>
          <div className="font-head text-[30px] leading-none text-ink mb-1">
            {bidderComposition.newBidders}
          </div>
          <div className="text-[12px] text-ink2">New bidders</div>
        </div>
        <div className="w-px h-9 bg-gridline" />
        <div>
          <div className="font-head text-[30px] leading-none text-ink mb-1">
            {bidderComposition.returningBidders}
          </div>
          <div className="text-[12px] text-ink2">Returning bidders</div>
        </div>
        <div className="flex-1 h-8 ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={bidderComposition.newBidderTrend}>
              <Line
                type="monotone"
                dataKey="newBidders"
                stroke={palette.series1}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="h-2 rounded-full overflow-hidden flex bg-gridline">
        <div className="bg-series1 h-full" style={{ width: `${newPct}%` }} />
      </div>
      <div className="flex justify-between mt-1.5 text-[11.5px] text-ink2">
        <span>{newPct}% new</span>
        <span>{returningPct}% returning</span>
      </div>
    </Card>
  );
}
