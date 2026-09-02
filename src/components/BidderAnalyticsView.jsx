import { useBidderAnalytics } from "../useBidderAnalytics";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import RankedMetricBar from "./primitives/RankedMetricBar";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import { formatPeso } from "../utils/format";

// BIDDER ANALYTICS — fully dynamic to the selected Date/Store/Category
// filters (see useBidderAnalytics.js). Historical/ending_time-cohort
// analytics only; Today/live bidder activity stays under Auction Events /
// Live Now on Overview (see App.jsx's LiveMiniCard footer) — never mixed
// in here.
export default function BidderAnalyticsView({ dateRange, store, category, rangeLabel, refreshNonce }) {
  const { data, loading, error } = useBidderAnalytics(dateRange, store, category, refreshNonce);

  if (error) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Bidder Analytics: {error}</div>;
  }
  if (loading || !data) {
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

  const topBidders = leaderboards.bidders || [];

  return (
    <div>
      <StorySection
        title="Bidder Analytics"
        insight={`Historical bidder engagement for auctions ending in the selected period (${rangeLabel}) — real bid-history participants union resolved winning bidders, the same canonical population as Bidder Composition.`}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            eyebrow={`Participating Bidders · ${rangeLabel}`}
            value={participatingTotal}
            methodology="Real bid-history participants union resolved winning bidders, deduplicated by canonical identity — the same population as Bidder Composition."
            extraDeltas={overview.comparison && participatingPct != null ? [{ label: "vs previous period", pct: participatingPct }] : []}
          />
          <StatTile
            eyebrow={`New Bidders · ${rangeLabel}`}
            value={newBidders}
            sub={participatingTotal > 0 ? `${((newBidders / participatingTotal) * 100).toFixed(1)}% of participating` : undefined}
            methodology="Canonical bidders whose first-ever real bid or resolved win falls on/after this period's start."
          />
          <StatTile
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

      <StorySection title={`Top 10 Bidders — ${rangeLabel}, by Winning Bid Amount`} last>
        <div className="overflow-x-auto">
          <table className="w-full text-[14.5px]">
            <thead>
              <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                <th className="text-left font-medium py-2 px-3">Bidder</th>
                <th className="text-right font-medium py-2 px-3">Lots Won</th>
                <th className="text-right font-medium py-2 px-3">Winning Bid Amount</th>
                <th className="text-right font-medium py-2 px-3">Branches</th>
                <th className="text-right font-medium py-2 px-3">Auctions Won</th>
                <th className="text-right font-medium py-2 px-3">Max Bid Usage %</th>
              </tr>
            </thead>
            <tbody>
              {topBidders.map((b, i) => (
                <tr key={b.bidder_name + i} className="border-t border-gridline">
                  <td className="py-2 px-3 text-ink">{b.bidder_name}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{b.settled_wins}</td>
                  <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(b.settled_bid_amount)}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{b.branches}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{b.winning_auctions}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{b.max_bid_usage_pct != null ? `${b.max_bid_usage_pct.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
              {topBidders.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted text-[14.5px]">
                    No settled winning bidders in this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </StorySection>
    </div>
  );
}
