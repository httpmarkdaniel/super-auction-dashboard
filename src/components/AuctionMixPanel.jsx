import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatPeso } from "../utils/format";

// Restrained professional BI palette for the Auction Mix donuts, assigned
// purely by slice INDEX (never by label/percentage) so coloring stays
// fully dynamic across whatever categories/sites/channels the query
// returns. The prior version indexed into usePalette()'s theme tokens,
// but that palette only defines series1-3 — every other key resolved to
// the same navy fallback, which is why adjacent slices kept rendering as
// near-identical dark blue. MIX_PALETTE is self-contained (not theme- or
// dark-mode-dependent) specifically to avoid that collision, and stays
// scoped to this file so it can't affect any other chart.
const MIX_PALETTE = [
  "#22345B", // Navy
  "#F2A900", // Orange
  "#19A974", // Teal
  "#4F7CAC", // Blue
  "#7A6FA8", // Purple
  "#E8795E", // Coral
  "#D6A84B", // Gold
  "#718096", // Slate
  // Overflow set — only reached past 8 segments in one donut; still
  // restrained/non-neon, never repeats the Navy fallback.
  "#5E8C61", // Sage
  "#B5654B", // Rust
  "#5B7C99", // Steel blue
  "#9A8246", // Olive gold
  "#8E5572", // Plum
  "#3F6B5A", // Deep teal
  "#A65A7E", // Dusty rose
  "#4A5A72", // Denim slate
];

function colorForIndex(i) {
  return MIX_PALETTE[i % MIX_PALETTE.length];
}

function MixTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="floating px-3 py-2 text-[12.5px] leading-tight shadow-lg">
      <div className="text-ink font-medium mb-0.5">{d.label}</div>
      <div className="text-muted tabular">{formatPeso(d.bidAmount)} · {d.share.toFixed(1)}%</div>
    </div>
  );
}

function MixDonut({ title, rows }) {
  const data = rows.slice(0, 7);

  return (
    <div className="bg-surface1 border border-gridline rounded-md px-4 pt-3.5 pb-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">{title}</div>
      {data.length === 0 ? (
        <div className="text-center text-muted text-[13.5px] py-8">No data.</div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-[104px] h-[104px] shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="bidAmount" nameKey="label" innerRadius={30} outerRadius={50} paddingAngle={2} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell key={d.label} fill={colorForIndex(i)} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<MixTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            {data.map((d, i) => (
              <div key={d.label} className="flex items-center gap-1.5 text-[12.5px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorForIndex(i) }} />
                <span className="text-ink truncate flex-1">{d.label}</span>
                <span className="text-muted tabular shrink-0">{d.share.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// AUCTION MIX (PART 14-17) — three compact donuts (Category/Site/
// Channel), all sourced from App.jsx's auctionMix (client-side grouping
// of already-loaded categoryBreakdown/auctionSummaryRows — no new
// request). Exact Bid Amount + share on hover; share % always visible in
// the legend.
export default function AuctionMixPanel({ auctionMix }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MixDonut title="Auction Category" rows={auctionMix.category} />
      <MixDonut title="Auction Site" rows={auctionMix.site.map((r) => ({ label: r.label, bidAmount: r.bidAmount, share: r.share }))} />
      <MixDonut title="Auction Channel" rows={auctionMix.channel.map((r) => ({ label: r.label, bidAmount: r.bidAmount, share: r.share }))} />
    </div>
  );
}
