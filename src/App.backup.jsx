import { useState } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

const ALL_CATEGORIES = "";

// Compact chip-style select — same visual language as Topbar's StoreChip
// (icon + native <select> styled to not look like a raw browser default),
// sized to sit in a Card's upper-right action slot.
function CategoryChip({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] tracking-[0.06em] uppercase text-muted font-semibold shrink-0">
        Overview Category
      </span>

      <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted shrink-0"
        >
          <path d="M3 8l9-5 9 5-9 5-9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
        </svg>

        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-[14px] font-semibold text-ink bg-transparent outline-none cursor-pointer max-w-[160px]"
        >
          <option value={ALL_CATEGORIES}>All Categories</option>

          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function BidderComposition({
  data: bidderComposition,
  rangeLabel = "Today",
  categoryOptions = [],
  selectedCategory = "",
  onCategoryChange,
}) {
  // The category filter itself is Overview-level state (owned by App.jsx,
  // threaded into useLiveOverview so the WHOLE tab is scoped consistently.
  // This component only renders the selector and consumes the composition
  // data already resolved by its parent.
  const [showByAuction, setShowByAuction] = useState(false);

  const byAuction = bidderComposition.byAuction || [];
  const palette = usePalette();

  const newAmount = bidderComposition.newBiddersBidAmount || 0;
  const returningAmount = bidderComposition.returningBiddersBidAmount || 0;

  const totalAmount = newAmount + returningAmount;

  const newSharePct =
    totalAmount > 0 ? (newAmount / totalAmount) * 100 : 0;

  const returningSharePct =
    totalAmount > 0 ? (returningAmount / totalAmount) * 100 : 0;

  const totalBidders =
    bidderComposition.newBidders + bidderComposition.returningBidders;

  const newBidderPct =
    totalBidders > 0
      ? Math.round((bidderComposition.newBidders / totalBidders) * 100)
      : 0;

  const returningBidderPct =
    totalBidders > 0 ? 100 - newBidderPct : 0;

  const auctionTotals = byAuction.reduce(
    (acc, a) => ({
      newBidders: acc.newBidders + Number(a.newBidders || 0),

      newBiddersBidAmount:
        acc.newBiddersBidAmount + Number(a.newBiddersBidAmount || 0),

      returningBidders:
        acc.returningBidders + Number(a.returningBidders || 0),

      returningBiddersBidAmount:
        acc.returningBiddersBidAmount +
        Number(a.returningBiddersBidAmount || 0),
    }),
    {
      newBidders: 0,
      newBiddersBidAmount: 0,
      returningBidders: 0,
      returningBiddersBidAmount: 0,
    },
  );

  // The donut represents bidder COUNT composition, while the contribution
  // bar below represents BID VALUE. Keeping those concepts separate avoids
  // implying that bidder share and bid-value share are the same metric.
  const pieData = [
    {
      name: "New",
      value: bidderComposition.newBidders,
    },
    {
      name: "Returning",
      value: bidderComposition.returningBidders,
    },
  ];

  const pieColors = [palette.series1, palette.series2];

  return (
    <Card
      title={`Bidder Composition · ${rangeLabel}`}
      action={
        <CategoryChip
          value={selectedCategory}
          onChange={onCategoryChange}
          options={categoryOptions}
        />
      }
    >
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-end gap-6 mb-4">
            <div>
              <div className="font-display text-[36.5px] leading-none text-series1 mb-1">
                {bidderComposition.newBidders}
              </div>

              <div className="text-[14.5px] text-ink">
                New bidders
              </div>

              <div className="text-[12.5px] text-muted mt-0.5">
                {newBidderPct}% of active bidders
              </div>

              <div className="text-[13.5px] tabular text-muted mt-1">
                {formatPeso(newAmount)} bid value
              </div>
            </div>

            <div className="w-px h-12 bg-gridline" />

            <div>
              <div className="font-display text-[36.5px] leading-none text-series1 mb-1">
                {bidderComposition.returningBidders}
              </div>

              <div className="text-[14.5px] text-ink">
                Returning bidders
              </div>

              <div className="text-[12.5px] text-muted mt-0.5">
                {returningBidderPct}% of active bidders
              </div>

              <div className="text-[13.5px] tabular text-muted mt-1">
                {formatPeso(returningAmount)} bid value
              </div>
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

          <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">
            Bid Value Contribution
          </div>

          <div className="h-2 rounded-full overflow-hidden flex bg-gridline">
            <div
              className="bg-series1 h-full"
              style={{ width: `${newSharePct}%` }}
            />
          </div>

          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-1.5 text-[14px] text-ink">
            <span>
              New bidders · {newSharePct.toFixed(1)}% ·{" "}
              {formatPeso(newAmount)}
            </span>

            <span className="text-right">
              Returning bidders · {returningSharePct.toFixed(1)}% ·{" "}
              {formatPeso(returningAmount)}
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
                    <Cell
                      key={entry.name}
                      fill={pieColors[i]}
                      stroke="none"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-1.5 text-[13.5px] text-ink">
              <span
                className="w-2 h-2 rounded-full shrink-0 mt-1"
                style={{ background: pieColors[0] }}
              />

              <div>
                <div>
                  New · {bidderComposition.newBidders} ({newBidderPct}%)
                </div>

                <div className="text-[12.5px] tabular text-muted">
                  {formatPeso(newAmount)} bid value
                </div>
              </div>
            </div>

            <div className="flex items-start gap-1.5 text-[13.5px] text-ink">
              <span
                className="w-2 h-2 rounded-full shrink-0 mt-1"
                style={{ background: pieColors[1] }}
              />

              <div>
                <div>
                  Returning · {bidderComposition.returningBidders} (
                  {returningBidderPct}%)
                </div>

                <div className="text-[12.5px] tabular text-muted">
                  {formatPeso(returningAmount)} bid value
                </div>
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
                  <th className="text-left font-medium pb-2 pr-4">
                    Auction #
                  </th>

                  <th className="text-right font-medium pb-2 pr-4">
                    New Bidders
                  </th>

                  <th className="text-right font-medium pb-2 pr-4">
                    New Amount
                  </th>

                  <th className="text-right font-medium pb-2 pr-4">
                    Returning Bidders
                  </th>

                  <th className="text-right font-medium pb-2">
                    Returning Amount
                  </th>
                </tr>
              </thead>

              <tbody>
                {byAuction.map((a) => (
                  <tr
                    key={a.auctionNumber}
                    className="border-t border-gridline"
                  >
                    <td className="py-2 pr-4 tabular text-ink">
                      {a.auctionNumber}
                    </td>

                    <td className="py-2 pr-4 text-right tabular text-ink">
                      {a.newBidders}
                    </td>

                    <td className="py-2 pr-4 text-right tabular text-ink">
                      {formatPeso(a.newBiddersBidAmount)}
                    </td>

                    <td className="py-2 pr-4 text-right tabular text-ink">
                      {a.returningBidders}
                    </td>

                    <td className="py-2 text-right tabular text-ink">
                      {formatPeso(a.returningBiddersBidAmount)}
                    </td>
                  </tr>
                ))}

                {byAuction.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-muted text-[14.5px]"
                    >
                      No auctions in this range yet.
                    </td>
                  </tr>
                )}

                {byAuction.length > 0 && (
                  <tr className="border-t-2 border-gridline font-semibold">
                    <td className="py-3 pr-4 text-ink">
                      GRAND TOTAL
                    </td>

                    <td className="py-3 pr-4 text-right tabular text-ink">
                      {bidderComposition.newBidders}
                    </td>

                    <td className="py-3 pr-4 text-right tabular text-ink">
                      {formatPeso(
                        bidderComposition.newBiddersBidAmount,
                      )}
                    </td>

                    <td className="py-3 pr-4 text-right tabular text-ink">
                      {bidderComposition.returningBidders}
                    </td>

                    <td className="py-3 text-right tabular text-ink">
                      {formatPeso(
                        bidderComposition.returningBiddersBidAmount,
                      )}
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