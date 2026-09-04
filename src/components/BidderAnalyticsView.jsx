import { useState } from "react";
import { useBidderAnalytics } from "../useBidderAnalytics";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import RankedMetricBar from "./primitives/RankedMetricBar";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import BiddingPaceView from "./BiddingPaceView";
import { formatPeso } from "../utils/format";

// Compact hover profile for a Top 10 Bidder row (PART REORG task) — zero
// network requests, every field is already present on the row passed in
// (either a leaderboards.bidders row, "By Winning Bid Amount" mode, or an
// overview.bidder_engagement row, "By Bid Activity" mode — see
// BY_ACTIVITY_MODE below for exactly which fields each shape has).
// "Date Registered" and "Most Frequent Store" are not available from any
// endpoint this dashboard currently queries for an individual bidder (only
// vendors have a first-seen proxy) — shown as "Not Available" rather than
// fabricated, per this task's own explicit rule.
function BidderHoverCard({ row, mode }) {
  return (
    <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg text-left min-w-[280px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-[14px] uppercase tracking-wide break-words">{row.name}</span>
        {row.isNew != null && (
          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${row.isNew ? "bg-navySoft text-navy" : "bg-gridline text-muted"}`}>
            {row.isNew ? "New" : "Returning"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5 pb-2.5 border-b border-gridline">
        <div>
          <div className="text-muted text-[12px]">Date Registered</div>
          <div className="tabular font-medium text-muted">Not Available</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Most Frequent Store</div>
          <div className="tabular font-medium text-muted">Not Available</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5 pb-2.5 border-b border-gridline">
        <div>
          <div className="text-muted text-[12px]">Auctions Participated</div>
          <div className="tabular font-medium">{row.auctionsParticipated ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Distinct Lots Bid On</div>
          <div className="tabular font-medium">{row.distinctLotsBidOn ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Total Bid Actions</div>
          <div className="tabular font-medium">{row.totalBidActions ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Avg Bid Actions / Lot</div>
          <div className="tabular font-medium text-series1">{row.avgBidActionsPerLot != null ? row.avgBidActionsPerLot.toFixed(2) : "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <div className="text-muted text-[12px]">Winning Auctions</div>
          <div className="tabular font-medium">{row.winningAuctions ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Winning Lots</div>
          <div className="tabular font-medium">{row.winningLots ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Winning Bid Amount</div>
          <div className="tabular font-medium">{row.winningBidAmount != null ? formatPeso(row.winningBidAmount) : "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Win Rate</div>
          <div className="tabular font-medium">{row.winRatePct != null ? `${row.winRatePct.toFixed(1)}%` : "—"}</div>
        </div>
        {mode === "amount" && (
          <div className="col-span-2">
            <div className="text-muted text-[12px]">Max Bid Usage %</div>
            <div className="tabular font-medium">{row.maxBidUsagePct != null ? `${row.maxBidUsagePct.toFixed(1)}%` : "—"}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// BIDDER ANALYTICS — fully dynamic to the selected Date/Store/Category
// filters (see useBidderAnalytics.js). Historical/ending_time-cohort
// analytics only; Today/live bidder activity stays under Auction Events /
// Live Now on Overview (see App.jsx's LiveMiniCard footer) — never mixed
// in here.
//
// Bidding Pace lives at the top of this tab (relocated from its own
// former standalone sidebar destination — see Sidebar.jsx) as the FIRST
// section, using the SAME dateRange/rangeLabel this view already
// receives — no separate filter controls, no second fetch path.
//
// Vercel P0 usage fix (round 2): Bidding Pace used to auto-refresh every
// 30s on its own timer, unconditionally, whenever this tab was open — an
// analytical/historical hourly breakdown, not a mission-critical live
// auction surface, so that recurring background cost wasn't justified.
// `biddingPaceRefreshNonce` is now the SAME `manualRefreshNonce` this
// view's own analytics already use below — Bidding Pace refetches on tab
// activation, a real filter change, or an explicit Refresh click, never a
// timer. See BiddingPaceView.jsx for the corresponding label change (the
// "Live" eyebrow was dropped since it's no longer accurate).
// `biddingPaceStore` is the raw (pre-ALL_STORES-normalized) store value:
// useBiddingPace/BiddingPaceView already do their own ALL_STORES
// normalization internally and use the raw value for display text, so
// this is passed through as-is rather than this view's own normalized
// `store` prop (which would render "undefined" in that display text when
// All Stores is selected).
export default function BidderAnalyticsView({ dateRange, store, biddingPaceStore, category, rangeLabel, refreshNonce, biddingPaceRefreshNonce }) {
  const { data, loading, error } = useBidderAnalytics(dateRange, store, category, refreshNonce);
  const [bidderRankMode, setBidderRankMode] = useState("amount");

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Bidder Analytics: {error}</div>;
  }
  if (!data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading Bidder Analytics…</div>;
  }

  const { overview, leaderboards, bidderAnalytics } = data;
  const composition = leaderboards.bidding_activity_composition || {};
  const participatingTotal = (Number(composition.new_bidders) || 0) + (Number(composition.returning_bidders) || 0);
  const newBidders = Number(composition.new_bidders) || 0;
  const participatingPrevious = Number(overview.comparison?.participating_bidders_previous ?? 0);
  const participatingPct = overview.comparison && participatingPrevious > 0 ? ((participatingTotal - participatingPrevious) / participatingPrevious) * 100 : null;

  const alwaysActive = bidderAnalytics.always_active;
  const wentQuiet = bidderAnalytics.went_quiet;

  const mostActiveBidder = (overview.bidder_engagement || [])[0] || null;

  const categoryRows = (overview.categories || [])
    .filter((c) => c.category && Number(c.participating_new ?? 0) + Number(c.participating_returning ?? 0) > 0)
    .map((c) => ({
      category: c.category,
      participating: (Number(c.participating_new) || 0) + (Number(c.participating_returning) || 0),
    }))
    .sort((a, b) => b.participating - a.participating);
  const totalCategoryParticipating = participatingTotal || 1;

  // TOP 10 BIDDERS — two ranking modes (PART REORG task), both zero-new-
  // request: "By Winning Bid Amount" reuses leaderboards.bidders as-is
  // (already top-10, already sorted). "By Bid Activity" sorts/slices the
  // FULL per-bidder overview.bidder_engagement array (already fetched,
  // unbounded — see api/overview.js's bidderEngagementResultPromise) by
  // bid_events instead. That array has no Winning Lots/Winning Bid Amount
  // per bidder (only leaderboards.bidders' OWN top-10-by-amount set does,
  // and a bidder who ranks highly by activity may not be in that set at
  // all) — rather than guess via a fragile display-name match across two
  // differently-formatted name fields, those columns show "—" in this mode
  // (a genuine, documented gap, never a fabricated or misattributed value).
  const topBiddersByAmount = leaderboards.bidders || [];
  const topBiddersByActivity = [...(overview.bidder_engagement || [])]
    .sort((a, b) => (b.bid_events || 0) - (a.bid_events || 0))
    .slice(0, 10);
  const topBidders = bidderRankMode === "amount" ? topBiddersByAmount : topBiddersByActivity;

  function toHoverRow(b) {
    if (bidderRankMode === "amount") {
      return {
        name: b.bidder_name,
        isNew: b.new_or_returning === "new",
        auctionsParticipated: b.auctions_participated,
        distinctLotsBidOn: b.distinct_lots_bid_on,
        totalBidActions: b.total_bids,
        avgBidActionsPerLot: b.avg_bids_per_lot,
        winningAuctions: b.winning_auctions,
        winningLots: b.settled_wins,
        winningBidAmount: b.settled_bid_amount,
        winRatePct: null,
        maxBidUsagePct: b.max_bid_usage_pct,
      };
    }
    return {
      name: b.display_name,
      isNew: b.is_new,
      auctionsParticipated: b.auctions_participated,
      distinctLotsBidOn: b.distinct_lots,
      totalBidActions: b.bid_events,
      avgBidActionsPerLot: b.distinct_lots > 0 ? b.bid_events / b.distinct_lots : null,
      winningAuctions: null,
      winningLots: null,
      winningBidAmount: null,
      winRatePct: null,
      maxBidUsagePct: null,
    };
  }

  return (
    <div>
      {loading && (
        <div className="mb-4 text-[13px] text-muted">Updating Bidder Analytics…</div>
      )}

      <StorySection title="Bidding Pace">
        <BiddingPaceView store={biddingPaceStore} dateRange={dateRange} rangeLabel={rangeLabel} refreshNonce={biddingPaceRefreshNonce} />
      </StorySection>

      <StorySection
        title="Bidder Analytics"
        insight={`Historical bidder engagement for auctions ending in the selected period (${rangeLabel}) — real bid-history participants union resolved winning bidders, the same canonical population as Bidder Composition.`}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            accent
            eyebrow={`Participating Bidders · ${rangeLabel}`}
            value={participatingTotal}
            methodology="Real bid-history participants union resolved winning bidders, deduplicated by canonical identity — the same population as Bidder Composition."
            extraDeltas={overview.comparison && participatingPct != null ? [{ label: "vs previous period", pct: participatingPct }] : []}
          />
          <StatTile
            accent
            eyebrow={`New Bidders · ${rangeLabel}`}
            value={newBidders}
            sub={participatingTotal > 0 ? `${((newBidders / participatingTotal) * 100).toFixed(1)}% of participating` : undefined}
            methodology="Canonical bidders whose first-ever real bid or resolved win falls on/after this period's start."
          />
          <StatTile
            accent
            eyebrow="Always Active"
            value={alwaysActive != null ? alwaysActive : "—"}
            sub={
              bidderAnalytics.classification_applicable
                ? `Present in every ${bidderAnalytics.bucket_label} (${bidderAnalytics.bucket_count})`
                : "Range too short for period classification"
            }
            methodology="Bidders present in EVERY time bucket across the selected range. Not meaningful for a range with only one bucket."
          />
          <StatTile
            accent
            eyebrow="Went Quiet"
            value={wentQuiet != null ? wentQuiet : "—"}
            sub={bidderAnalytics.classification_applicable ? `Not active in the latest ${bidderAnalytics.bucket_label}` : "Range too short for period classification"}
            methodology="Bidders active earlier in the selected range but not in the latest time bucket."
          />
        </div>
      </StorySection>

      <StorySection title="Participating & New Bidders by Period" insight={`Bucketed by ${bidderAnalytics.bucket_label}, using the same auction ending_time cohort rule.`}>
        <PeriodStackedBar rows={bidderAnalytics.by_period} bucketLabel={bidderAnalytics.bucket_label} />
      </StorySection>

      <StorySection title="Most Active Bidder" insight={`Highest real bid-event count for ${rangeLabel}.`}>
        {mostActiveBidder ? (
          <div className="bg-surface1 border border-gridline rounded-lg px-5 py-4 max-w-md">
            <div className="text-[19px] text-ink font-medium mb-2">{mostActiveBidder.bidder}</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="kpi-label mb-1">Total Bids</div>
                <div className="font-display text-[24px] leading-none text-ink">{mostActiveBidder.bid_events}</div>
              </div>
              <div>
                <div className="kpi-label mb-1">Distinct Lots</div>
                <div className="font-display text-[24px] leading-none text-ink">{mostActiveBidder.distinct_lots}</div>
              </div>
              <div>
                <div className="kpi-label mb-1">Avg Bids / Lot</div>
                <div className="font-display text-[24px] leading-none text-series1">
                  {mostActiveBidder.avg_bids_per_lot != null ? mostActiveBidder.avg_bids_per_lot.toFixed(2) : "—"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted text-[15px] py-6">No bidder activity in this scope.</div>
        )}
      </StorySection>

      <StorySection title="Bidders by Category" insight="A bidder may appear in multiple categories, so shares do not need to sum to 100%.">
        <RankedMetricBar
          rows={categoryRows}
          labelKey="category"
          valueKey="participating"
          formatValue={(r) => `${r.participating} (${((r.participating / totalCategoryParticipating) * 100).toFixed(1)}%)`}
          emptyMessage="No category-level bidder activity in this scope."
        />
      </StorySection>

      <StorySection
        title={`Top 10 Bidders — ${rangeLabel}`}
        insight="Hover a bidder for their profile. Switch ranking mode to see the same 10-row limit ranked a different way — the two modes can surface different bidders."
        last
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setBidderRankMode("amount")}
            className={`text-[13.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${bidderRankMode === "amount" ? "bg-navy text-white border-navy" : "bg-surface1 text-ink border-gridline hover:border-navy/40"}`}
          >
            By Winning Bid Amount
          </button>
          <button
            type="button"
            onClick={() => setBidderRankMode("activity")}
            className={`text-[13.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${bidderRankMode === "activity" ? "bg-navy text-white border-navy" : "bg-surface1 text-ink border-gridline hover:border-navy/40"}`}
          >
            By Bid Activity
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[14.5px]">
            <thead>
              {bidderRankMode === "amount" ? (
                <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                  <th className="text-left font-medium py-2 px-3">Bidder</th>
                  <th className="text-right font-medium py-2 px-3">Winning Lots</th>
                  <th className="text-right font-medium py-2 px-3">Winning Bid Amount</th>
                  <th className="text-right font-medium py-2 px-3">Auctions Won</th>
                  <th className="text-right font-medium py-2 px-3">Branches</th>
                  <th className="text-right font-medium py-2 px-3">Max Bid Usage %</th>
                </tr>
              ) : (
                <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                  <th className="text-left font-medium py-2 px-3">Bidder</th>
                  <th className="text-right font-medium py-2 px-3">Total Bid Actions</th>
                  <th className="text-right font-medium py-2 px-3">Distinct Lots Bid On</th>
                  <th className="text-right font-medium py-2 px-3">Avg Bid Actions / Lot</th>
                  <th className="text-right font-medium py-2 px-3">Auctions Participated</th>
                  <th className="text-right font-medium py-2 px-3">Winning Lots</th>
                  <th className="text-right font-medium py-2 px-3">Winning Bid Amount</th>
                </tr>
              )}
            </thead>
            <tbody>
              {topBidders.map((b, i) => {
                const key = bidderRankMode === "amount" ? b.bidder_name : b.bidder_key;
                const name = bidderRankMode === "amount" ? b.bidder_name : b.display_name;
                const nameCell = (
                  <td className="relative py-2 px-3 text-ink group/tip">
                    {name}
                    <div className="pointer-events-none absolute left-0 top-full mt-1 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]">
                      <BidderHoverCard row={toHoverRow(b)} mode={bidderRankMode} />
                    </div>
                  </td>
                );
                return (
                  <tr key={`${key}-${i}`} className="border-t border-gridline hover:bg-plane/60 transition-colors">
                    {bidderRankMode === "amount" ? (
                      <>
                        {nameCell}
                        <td className="py-2 px-3 text-right tabular text-ink">{b.settled_wins}</td>
                        <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(b.settled_bid_amount)}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.winning_auctions}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.branches}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.max_bid_usage_pct != null ? `${b.max_bid_usage_pct.toFixed(1)}%` : "—"}</td>
                      </>
                    ) : (
                      <>
                        {nameCell}
                        <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{b.bid_events}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.distinct_lots}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.distinct_lots > 0 ? (b.bid_events / b.distinct_lots).toFixed(2) : "—"}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.auctions_participated}</td>
                        <td className="py-2 px-3 text-right tabular text-muted">—</td>
                        <td className="py-2 px-3 text-right tabular text-muted">—</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {topBidders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted text-[14.5px]">
                    {bidderRankMode === "amount" ? "No settled winning bidders in this scope." : "No bidder activity in this scope."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {bidderRankMode === "activity" && (
          <div className="text-[12px] text-muted mt-2">
            Winning Lots/Winning Bid Amount are only reliably known for the top 10 bidders by winning amount (a separate ranking) — shown as "—" here rather than an unreliable name-matched guess.
          </div>
        )}
      </StorySection>
    </div>
  );
}
