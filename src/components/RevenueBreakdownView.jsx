import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";
import { useRevenueBreakdown } from "../useRevenueBreakdown";
import { CATEGORY_NAMES } from "../../api/_category.js";

function formatDay(isoLike) {
  if (!isoLike) return "—";
  const d = new Date(String(isoLike).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// Two-segment share bar — Buyer's Premium vs Commission, direct-labeled so
// the bar and the numbers can never disagree. Same visual language as
// BidderComposition's "Bid Value Contribution" bar.
function ComponentShareBar({ buyersPremium, commission }) {
  const total = buyersPremium + commission || 1;
  const bpPct = (buyersPremium / total) * 100;
  const commPct = (commission / total) * 100;
  return (
    <div>
      <div className="h-2 rounded-full overflow-hidden flex bg-gridline">
        <div className="bg-series1 h-full" style={{ width: `${bpPct}%` }} />
        <div className="bg-series2 h-full" style={{ width: `${commPct}%` }} />
      </div>
      <div className="flex justify-between gap-4 mt-1.5 text-[14px] text-ink">
        <span>Buyer's Premium · {bpPct.toFixed(1)}% · {formatPeso(buyersPremium)}</span>
        <span className="text-right">Commission · {commPct.toFixed(1)}% · {formatPeso(commission)}</span>
      </div>
    </div>
  );
}

function BreakdownTable({ rows, labelKey, labelHeader }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15.5px]">
        <thead>
          <tr className="text-ink text-[13.5px] uppercase tracking-wide">
            <th className="text-left font-medium pb-2 pr-4">{labelHeader}</th>
            <th className="text-right font-medium pb-2 pr-4">Bid Amount</th>
            <th className="text-right font-medium pb-2 pr-4">Buyer's Premium</th>
            <th className="text-right font-medium pb-2 pr-4">Commission</th>
            <th className="text-right font-medium pb-2">Total Service Income</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[labelKey]} className="border-t border-gridline hover:bg-plane/60 transition-colors">
              <td className="py-2.5 pr-4 text-ink">{r[labelKey]}</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.buyersPremium)}</td>
              <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.commission)}</td>
              <td className="py-2.5 text-right tabular text-series1">{formatPeso(r.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted text-[15px]">
                No settled revenue in this scope.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, { bidAmount: 0, buyersPremium: 0, commission: 0, count: 0 });
    const agg = map.get(key);
    agg.bidAmount += r.bid_amount;
    agg.buyersPremium += r.buyers_premium_income;
    agg.commission += r.commission_income;
    agg.count += 1;
  }
  return map;
}

export default function RevenueBreakdownView({ store, dateRange, rangeLabel, refreshNonce }) {
  const { data: rows, loading, error, unsupported } = useRevenueBreakdown(store, dateRange, refreshNonce);
  const [showDetail, setShowDetail] = useState(false);
  const [detailQuery, setDetailQuery] = useState("");

  const palette = usePalette();

  const summary = useMemo(() => {
    if (!rows) return null;

    let bidAmount = 0;
    let buyersPremium = 0;
    let commission = 0;
    for (const r of rows) {
      bidAmount += r.bid_amount;
      buyersPremium += r.buyers_premium_income;
      commission += r.commission_income;
    }
    // Bid Amount is contextual auction value, never folded into Service
    // Income — Total Service Income stays Buyer's Premium + Commission only.
    const total = buyersPremium + commission;

    const branchMap = groupBy(rows, (r) => r.store_name || "—");
    const byBranch = [...branchMap.entries()]
      .map(([branch, v]) => ({ branch, bidAmount: v.bidAmount, buyersPremium: v.buyersPremium, commission: v.commission, total: v.buyersPremium + v.commission }))
      .sort((a, b) => b.total - a.total);

    const categoryMap = groupBy(rows, (r) => r.category || "—");
    const byCategory = CATEGORY_NAMES.map((category) => {
      const v = categoryMap.get(category) ?? { bidAmount: 0, buyersPremium: 0, commission: 0 };
      return { category, bidAmount: v.bidAmount, buyersPremium: v.buyersPremium, commission: v.commission, total: v.buyersPremium + v.commission };
    });

    const auctionMap = new Map();
    for (const r of rows) {
      if (!auctionMap.has(r.auction_number)) {
        auctionMap.set(r.auction_number, {
          auctionNumber: r.auction_number,
          auctionName: r.auction_name,
          branch: r.store_name,
          auctionType: r.auction_type,
          settledLots: 0,
          totalBidAmount: 0,
          buyersPremium: 0,
          commission: 0,
        });
      }
      const a = auctionMap.get(r.auction_number);
      a.settledLots += 1;
      a.totalBidAmount += r.bid_amount;
      a.buyersPremium += r.buyers_premium_income;
      a.commission += r.commission_income;
    }
    const byAuction = [...auctionMap.values()]
      .map((a) => ({ ...a, total: a.buyersPremium + a.commission }))
      .sort((a, b) => b.total - a.total);

    const dayMap = new Map();
    for (const r of rows) {
      const day = String(r.ending_time || "").slice(0, 10);
      if (!day) continue;
      if (!dayMap.has(day)) dayMap.set(day, 0);
      dayMap.set(day, dayMap.get(day) + r.buyers_premium_income + r.commission_income);
    }
    const trend = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, amount]) => ({ day, amount }));

    return { bidAmount, buyersPremium, commission, total, byBranch, byCategory, byAuction, trend };
  }, [rows]);

  const detailRows = useMemo(() => {
    if (!rows) return [];
    const q = detailQuery.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!q) return true;
        return (
          (r.auction_number || "").toLowerCase().includes(q) ||
          (r.name || "").toLowerCase().includes(q) ||
          (r.vendor || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.buyers_premium_income + b.commission_income - (a.buyers_premium_income + a.commission_income));
  }, [rows, detailQuery]);

  if (unsupported) {
    return (
      <div className="px-4 py-6 rounded-lg border border-gridline bg-plane text-center text-ink text-[15.5px]">
        <div className="font-medium mb-1">All Time is not currently available for Revenue Breakdown.</div>
        <div className="text-muted text-[14px]">Select a specific date range to load revenue details.</div>
      </div>
    );
  }
  if (error && !rows) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load revenue breakdown: {error}
      </div>
    );
  }
  if (loading || !summary) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading revenue breakdown…</div>;
  }

  const bpSharePct = summary.total > 0 ? (summary.buyersPremium / summary.total) * 100 : 0;
  const commSharePct = summary.total > 0 ? (summary.commission / summary.total) * 100 : 0;

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-critical/10 text-toneRedText text-[13.5px]">
          Couldn't refresh revenue breakdown: {error} — showing last loaded data.
        </div>
      )}

      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel} · Live`}
          headline="How much revenue the auction house earned — Buyer's Premium + Commission on Paid & Released lots only. Not Total Bid Amount, not vendor payables."
          amount={formatPeso(summary.total)}
          amountLabel="Total Service Income · Paid & Released only"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatTile
          eyebrow="Bid Amount"
          value={formatPeso(summary.bidAmount)}
          sub="Settled hammer value"
          methodology="Settled (Paid/Released) hammer bid_amount, deduped by auction_number + lot_number — the same population and figure as Overview's Total Bid Amount. Contextual auction value only, never added into Service Income."
        />
        <StatTile
          eyebrow="Buyer's Premium Income"
          value={formatPeso(summary.buyersPremium)}
          sub={`${bpSharePct.toFixed(1)}% of Service Income`}
          methodology="sold_price - bid_amount, summed over settled lots."
        />
        <StatTile
          eyebrow="Commission Income"
          value={formatPeso(summary.commission)}
          sub={`${commSharePct.toFixed(1)}% of Service Income`}
          methodology="bid_amount × commission rate, summed over settled lots."
        />
        <StatTile
          eyebrow="Total Service Income"
          value={formatPeso(summary.total)}
          sub="Paid & Released only"
          methodology="Buyer's Premium Income + Commission Income, on settled (Paid/Released) lots only. Never Total Bid Amount, never a vendor payable figure."
        />
        <StatTile eyebrow="Settled Lots" value={rows.length} sub="Contributing to revenue" />
      </div>

      <StorySection title="Revenue by Component" insight="Buyer's Premium and Commission — the only two components of Total Service Income.">
        <Card>
          <ComponentShareBar buyersPremium={summary.buyersPremium} commission={summary.commission} />
        </Card>
      </StorySection>

      <StorySection title="Revenue by Branch" insight="Where Service Income was earned, by store — sums exactly to Total Service Income.">
        <Card title={`By Branch · ${store}`}>
          <BreakdownTable rows={summary.byBranch} labelKey="branch" labelHeader="Branch" />
        </Card>
      </StorySection>

      <StorySection title="Revenue by Category" insight="Service Income by item category — a lot belongs to exactly one category, so this splits safely (unlike Vendor Payables' multi-lot payables).">
        <Card title="By Category">
          <BreakdownTable rows={summary.byCategory} labelKey="category" labelHeader="Category" />
        </Card>
      </StorySection>

      <StorySection
        title="Revenue by Auction"
        insight="Every auction with settled revenue in this range, rolled up from its individual lots — sums exactly to Total Service Income."
      >
        <Card title="By Auction">
          <div className="overflow-x-auto">
            <table className="w-full text-[15.5px]">
              <thead>
                <tr className="text-ink text-[13.5px] uppercase tracking-wide">
                  <th className="text-left font-medium pb-2 pr-4">Auction #</th>
                  <th className="text-left font-medium pb-2 pr-4">Auction Name</th>
                  <th className="text-left font-medium pb-2 pr-4">Branch</th>
                  <th className="text-left font-medium pb-2 pr-4">Type</th>
                  <th className="text-right font-medium pb-2 pr-4">Settled Lots</th>
                  <th className="text-right font-medium pb-2 pr-4">Total Bid Amount</th>
                  <th className="text-right font-medium pb-2 pr-4">Buyer's Premium</th>
                  <th className="text-right font-medium pb-2 pr-4">Commission</th>
                  <th className="text-right font-medium pb-2">Total Service Income</th>
                </tr>
              </thead>
              <tbody>
                {summary.byAuction.map((a) => (
                  <tr key={a.auctionNumber} className="border-t border-gridline hover:bg-plane/60 transition-colors">
                    <td className="py-2.5 pr-4 tabular text-ink">{a.auctionNumber}</td>
                    <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={a.auctionName}>
                      {a.auctionName || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{a.branch || "—"}</td>
                    <td className="py-2.5 pr-4 text-ink">{a.auctionType || "—"}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{a.settledLots}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(a.totalBidAmount)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(a.buyersPremium)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(a.commission)}</td>
                    <td className="py-2.5 text-right tabular text-series1">{formatPeso(a.total)}</td>
                  </tr>
                ))}
                {summary.byAuction.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-muted text-[15px]">
                      No settled auctions in this scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-gridline">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="text-[14px] font-semibold text-series1 hover:underline"
            >
              {showDetail ? "Hide" : "See"} Full Detail ▾
            </button>

            {showDetail && (
              <div className="mt-4">
                <div className="flex items-center gap-2 bg-plane border border-gridline rounded-lg px-3 h-8 w-full sm:w-[260px] mb-4">
                  <span className="text-muted text-[14.5px]">⌕</span>
                  <input
                    type="text"
                    value={detailQuery}
                    onChange={(e) => setDetailQuery(e.target.value)}
                    placeholder="Filter auction #, item, or vendor…"
                    className="flex-1 min-w-0 text-[15px] text-ink bg-transparent outline-none placeholder:text-muted"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[15px]">
                    <thead>
                      <tr className="text-ink text-[13px] uppercase tracking-wide">
                        <th className="text-left font-medium pb-2 pr-4">Auction #</th>
                        <th className="text-left font-medium pb-2 pr-4">Lot #</th>
                        <th className="text-left font-medium pb-2 pr-4">Item</th>
                        <th className="text-left font-medium pb-2 pr-4">Branch</th>
                        <th className="text-left font-medium pb-2 pr-4">Vendor</th>
                        <th className="text-left font-medium pb-2 pr-4">Status</th>
                        <th className="text-right font-medium pb-2 pr-4">Bid Amount</th>
                        <th className="text-right font-medium pb-2 pr-4">Buyer's Premium</th>
                        <th className="text-right font-medium pb-2 pr-4">Commission</th>
                        <th className="text-right font-medium pb-2">Total Service Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((r) => (
                        <tr key={`${r.auction_number}-${r.lot_number}`} className="border-t border-gridline hover:bg-plane/60 transition-colors">
                          <td className="py-2.5 pr-4 tabular text-ink">{r.auction_number}</td>
                          <td className="py-2.5 pr-4 tabular text-ink">{r.lot_number}</td>
                          <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.name}>
                            {r.name || "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-ink">{r.store_name || "—"}</td>
                          <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
                          <td className="py-2.5 pr-4 text-ink">{r.status}</td>
                          <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bid_amount)}</td>
                          <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.buyers_premium_income)}</td>
                          <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.commission_income)}</td>
                          <td className="py-2.5 text-right tabular text-series1">
                            {formatPeso(r.buyers_premium_income + r.commission_income)}
                          </td>
                        </tr>
                      ))}
                      {detailRows.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-6 text-center text-muted text-[15px]">
                            No lots match this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      </StorySection>

      <StorySection
        title="Revenue Over Time"
        insight="Total Service Income by day, using each contributing auction's ending_time — the same date field this page's totals are already scoped by (an auction belongs to the period in which it ends), so this trend always sums exactly to the total above."
        last
      >
        <Card title="By Day">
          {summary.trend.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-center text-muted text-[15px]">
              No revenue in range.
            </div>
          ) : (
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.series1} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={palette.series1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatDay}
                    tick={{ fill: palette.muted, fontSize: 11.5 }}
                    axisLine={{ stroke: palette.gridline }}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value) => formatPeso(value)}
                    labelFormatter={formatDay}
                    contentStyle={{ background: palette.surface1, border: `1px solid ${palette.gridline}` }}
                  />
                  <Area type="monotone" dataKey="amount" stroke={palette.series1} strokeWidth={2} fill="url(#revenueFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </StorySection>
    </div>
  );
}
