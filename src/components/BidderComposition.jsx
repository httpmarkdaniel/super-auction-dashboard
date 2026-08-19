import { useState } from "react";
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

export default function BidderComposition({ data: bidderComposition, rangeLabel = "Today" }) {
  const [showByAuction, setShowByAuction] = useState(false);
  const byAuction = bidderComposition.byAuction || [];
  const palette = usePalette();
  const newAmount = bidderComposition.newBiddersBidAmount || 0;
  const returningAmount = bidderComposition.returningBiddersBidAmount || 0;
  const totalAmount = newAmount + returningAmount;
  const newSharePct = totalAmount > 0 ? Math.round((newAmount / totalAmount) * 100) : 0;
  const returningSharePct = totalAmount > 0 ? 100 - newSharePct : 0;
  const totalBidders = bidderComposition.newBidders + bidderComposition.returningBidders;
  const newBidderPct = totalBidders > 0 ? Math.round((bidderComposition.newBidders / totalBidders) * 100) : 0;
  const returningBidderPct = totalBidders > 0 ? 100 - newBidderPct : 0;
  // Matches the New/Returning bidders COUNT shown on the left, not the
  // revenue-share bar below it — a different split (a handful of new
  // bidders can outspend many returning ones), so this pie must use counts
  // to visually agree with the big numbers beside it.
  const pieData = [
    { name: "New", value: bidderComposition.newBidders },
    { name: "Returning", value: bidderComposition.returningBidders },
  ];
  const pieColors = [palette.series1, palette.series2];

  return (
    <Card title={`Bidder Composition · ${rangeLabel}`}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-end gap-6 mb-4">
            <div>
              <div className="font-display text-[36.5px] leading-none text-series1 mb-1">
                {bidderComposition.newBidders}
              </div>
              <div className="text-[14.5px] text-ink">New bidders</div>
              <div className="text-[13.5px] tabular text-muted mt-0.5">{formatPeso(newAmount)} sold</div>
            </div>
            <div className="w-px h-9 bg-gridline" />
            <div>
              <div className="font-display text-[36.5px] leading-none text-series1 mb-1">
                {bidderComposition.returningBidders}
              </div>
              <div className="text-[14.5px] text-ink">Returning bidders</div>
              <div className="text-[13.5px] tabular text-muted mt-0.5">{formatPeso(returningAmount)} sold</div>
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

          <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">Revenue Share</div>
          <div className="h-2 rounded-full overflow-hidden flex bg-gridline">
            <div className="bg-series1 h-full" style={{ width: `${newSharePct}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[14px] text-ink">
            <span>
              {newSharePct}% new · {formatPeso(newAmount)}
            </span>
            <span>
              {returningSharePct}% returning · {formatPeso(returningAmount)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 lg:border-l lg:border-gridline lg:pl-6 shrink-0">
          <div className="w-[104px] h-[104px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={30}
                  outerRadius={50}
                  paddingAngle={totalBidders > 0 ? 2 : 0}
                  isAnimationActive={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={pieColors[i]} stroke="none" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-start gap-1.5 text-[13.5px] text-ink">
              <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: pieColors[0] }} />
              <div>
                <div>New · {bidderComposition.newBidders} ({newBidderPct}%)</div>
                <div className="text-[12.5px] tabular text-muted">{formatPeso(newAmount)}</div>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-[13.5px] text-ink">
              <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: pieColors[1] }} />
              <div>
                <div>Returning · {bidderComposition.returningBidders} ({returningBidderPct}%)</div>
                <div className="text-[12.5px] tabular text-muted">{formatPeso(returningAmount)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gridline">
        <button
          type="button"
          onClick={() => setShowByAuction((v) => !v)}
          className="text-[14px] font-semibold text-series1 hover:underline"
        >
          {showByAuction ? "Hide" : "Show"} breakdown by auction ▾
        </button>

        {showByAuction && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[14.5px]">
              <thead>
                <tr className="text-ink text-[13px] uppercase tracking-wide">
                  <th className="text-left font-medium pb-2 pr-4">Auction #</th>
                  <th className="text-right font-medium pb-2 pr-4">New Bidders</th>
                  <th className="text-right font-medium pb-2 pr-4">New Amount</th>
                  <th className="text-right font-medium pb-2 pr-4">Returning Bidders</th>
                  <th className="text-right font-medium pb-2">Returning Amount</th>
                </tr>
              </thead>
              <tbody>
                {byAuction.map((a) => (
                  <tr key={a.auctionNumber} className="border-t border-gridline">
                    <td className="py-2 pr-4 tabular text-ink">{a.auctionNumber}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{a.newBidders}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{formatPeso(a.newBiddersBidAmount)}</td>
                    <td className="py-2 pr-4 text-right tabular text-ink">{a.returningBidders}</td>
                    <td className="py-2 text-right tabular text-ink">{formatPeso(a.returningBiddersBidAmount)}</td>
                  </tr>
                ))}
                {byAuction.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted text-[14.5px]">
                      No auctions in this range yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
