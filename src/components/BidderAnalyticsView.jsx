import { useState } from "react";
import { useBidderAnalytics } from "../useBidderAnalytics";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import BiddingPaceView from "./BiddingPaceView";
import { formatPeso } from "../utils/format";
import { formatManila } from "../utils/manilaTime";

function HoverField({ label, value }) {
  return (
    <div>
      <div className="text-muted text-[12px]">{label}</div>
      <div className="tabular font-medium">{value ?? "—"}</div>
    </div>
  );
}

// Compact hover profile for a Top 10 Bidder row (PART REORG task) — zero
// network requests. Registered/Most Frequent Store/Months Active/Last
// Active come from api/overview.js's enriched bidder_engagement (real
// cms.mart_cms_bidder_registrations.bidder_registered_at + real bid-history
// store activity, joined by canonical email — see that file's comments);
// for "By Winning Bid Amount" mode rows, BidderAnalyticsView.jsx
// cross-references the SAME already-fetched dataset by the shared
// bidder_email/bidder_key canonical identity, never by name matching.
// Winning Auctions/Lots/Amount/Max Bid Usage % are null (shown as "—") in
// "By Bid Activity" mode — that dataset is bid-activity-only and cannot be
// reliably joined to the separate settled-bidder identity bridge.
function BidderHoverCard({ row }) {
  return (
    <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg text-left min-w-[290px] max-h-[70vh] overflow-y-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-[14px] uppercase tracking-wide break-words">{row.name}</span>
        {row.isNew != null && (
          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${row.isNew ? "bg-navySoft text-navy" : "bg-gridline text-muted"}`}>
            {row.isNew ? "New" : "Returning"}
          </span>
        )}
      </div>

      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">Profile</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5 pb-2.5 border-b border-gridline">
        <HoverField label="Date Registered" value={row.registeredAt ? formatManila(row.registeredAt, { withYear: true }) : "Not Available"} />
        <HoverField label="Most Frequent Store" value={row.mostFrequentStore || "Not Available"} />
      </div>

      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">Activity</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5 pb-2.5 border-b border-gridline">
        <HoverField label="Auctions Participated" value={row.auctionsParticipated} />
        <HoverField label="Distinct Lots Bid On" value={row.distinctLotsBidOn} />
        <HoverField label="Total Bid Actions" value={row.totalBidActions} />
        <HoverField label="Avg Bid Actions / Lot" value={row.avgBidActionsPerLot != null ? row.avgBidActionsPerLot.toFixed(2) : null} />
        <HoverField label="Months Active" value={row.monthsActive} />
        <HoverField label="Last Active" value={row.lastActiveAt ? formatManila(row.lastActiveAt, { withYear: true }) : null} />
      </div>

      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">Winning</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <HoverField label="Winning Auctions" value={row.winningAuctions} />
        <HoverField label="Winning Lots" value={row.winningLots} />
        <HoverField label="Winning Bid Amount" value={row.winningBidAmount != null ? formatPeso(row.winningBidAmount) : null} />
        <HoverField label="Max Bid Usage %" value={row.maxBidUsagePct != null ? `${row.maxBidUsagePct.toFixed(1)}%` : null} />
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

  // TOP 10 BIDDERS — two ranking modes (PART REORG task), both zero-new-
  // request: "By Winning Bid Amount" reuses leaderboards.bidders as-is
  // (already top-10, already sorted). "By Bid Activity" sorts/slices the
  // FULL per-bidder overview.bidder_engagement array (already fetched,
  // unbounded — see api/overview.js's bidderEngagementResultPromise) by
  // bid_events instead. Winning Lots/Winning Bid Amount for THAT mode come
  // from leaderboards.all_settled_bidders (the full resolved settled/
  // winning population, not just the top 10 by amount — see
  // api/leaderboards.js's settledBiddersQuery comment), cross-referenced
  // by the shared canonical email key below — never a name match.
  const topBiddersByAmount = leaderboards.bidders || [];
  const topBiddersByActivity = [...(overview.bidder_engagement || [])]
    .sort((a, b) => (b.bid_events || 0) - (a.bid_events || 0))
    .slice(0, 10);
  const topBidders = bidderRankMode === "amount" ? topBiddersByAmount : topBiddersByActivity;

  // Deterministic cross-reference (PART REORG follow-up), NOT a name match:
  // both leaderboards.bidders' bidder_email and overview.bidder_engagement's
  // bidder_key are the SAME lowerUTF8(trim(email)) canonical identity. Lets
  // "By Winning Bid Amount" mode show the SAME real registration/most-
  // frequent-store/months-active profile fields "By Bid Activity" already
  // has, using data already fetched by this SAME tab — no new request.
  const engagementByEmail = new Map((overview.bidder_engagement || []).map((e) => [e.bidder_key, e]));

  // SMALL TARGETED FIX: leaderboards.all_settled_bidders is the FULL
  // resolved settled/winning population (not just the top 10 by amount),
  // keyed by the SAME canonical email — see api/leaderboards.js's
  // settledBiddersQuery comment. Every bidder_engagement row already has a
  // valid, resolved identity by construction (built directly from a real,
  // non-null bid_history email) — so a bidder_key with NO entry here
  // genuinely has zero wins, not an unresolved identity. "—" is reserved
  // for the one defensive case where bidder_key itself is missing.
  const winningByEmail = new Map((leaderboards.all_settled_bidders || []).map((w) => [w.bidder_email, w]));

  function toHoverRow(b) {
    if (bidderRankMode === "amount") {
      const enrichment = b.bidder_email ? engagementByEmail.get(b.bidder_email) : null;
      return {
        name: b.bidder_name,
        registeredAt: enrichment?.registered_at ?? null,
        mostFrequentStore: enrichment?.most_frequent_store ?? null,
        monthsActive: enrichment?.months_active ?? null,
        lastActiveAt: enrichment?.last_active_at ?? null,
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
    // SMALL TARGETED FIX: look up this bidder's REAL winning record via the
    // deterministic email key. Found -> real (always >= 1 lot, by
    // construction of the settled/winning population). Not found -> a
    // genuinely identified bidder (bidder_key is always a real, non-null
    // email here) with zero wins, so 0 / ₱0 — never "—" for that case.
    // "—" only if bidder_key itself is somehow missing (defensive; should
    // not happen given bidder_engagement's own NOT NULL/non-empty filter).
    const win = b.bidder_key ? winningByEmail.get(b.bidder_key) : null;
    const identityResolved = Boolean(b.bidder_key);
    return {
      name: b.bidder_name || b.bidder,
      registeredAt: b.registered_at,
      mostFrequentStore: b.most_frequent_store,
      monthsActive: b.months_active,
      lastActiveAt: b.last_active_at,
      isNew: b.is_new,
      auctionsParticipated: b.auctions_participated,
      distinctLotsBidOn: b.distinct_lots,
      totalBidActions: b.bid_events,
      avgBidActionsPerLot: b.distinct_lots > 0 ? b.bid_events / b.distinct_lots : null,
      winningAuctions: win ? win.winning_auctions : identityResolved ? 0 : null,
      winningLots: win ? win.settled_lots : identityResolved ? 0 : null,
      winningBidAmount: win ? win.settled_bid_amount : identityResolved ? 0 : null,
      winRatePct: null,
      maxBidUsagePct: win ? win.max_bid_usage_pct : b.max_bid_usage_pct ?? null,
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
                  <th className="text-left font-medium py-2 px-3 min-w-[160px]">Bidder</th>
                  <th className="text-right font-medium py-2 px-3">Winning Lots</th>
                  <th className="text-right font-medium py-2 px-3">Winning Bid Amount</th>
                  <th className="text-right font-medium py-2 px-3">Auctions Won</th>
                  <th className="text-right font-medium py-2 px-3">Branches</th>
                  <th className="text-right font-medium py-2 px-3">Max Bid Usage %</th>
                  <th className="text-right font-medium py-2 px-3">Months Active</th>
                </tr>
              ) : (
                <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                  <th className="text-left font-medium py-2 px-3 min-w-[160px]">Bidder</th>
                  <th className="text-right font-medium py-2 px-3">Total Bid Actions</th>
                  <th className="text-right font-medium py-2 px-3">Distinct Lots Bid On</th>
                  <th className="text-right font-medium py-2 px-3">Avg Bid Actions / Lot</th>
                  <th className="text-right font-medium py-2 px-3">Auctions Participated</th>
                  <th className="text-right font-medium py-2 px-3">Months Active</th>
                  <th className="text-right font-medium py-2 px-3">Winning Lots</th>
                  <th className="text-right font-medium py-2 px-3">Winning Bid Amount</th>
                </tr>
              )}
            </thead>
            <tbody>
              {topBidders.map((b, i) => {
                // PART REORG follow-up fix: the "By Bid Activity" name bug
                // was this reading `b.display_name`, a field that was
                // never actually exposed on bidder_engagement rows (the
                // real field is `bidder`/`bidder_name` — see
                // api/overview.js's bidderEngagement mapping).
                const hoverRow = toHoverRow(b);
                const key = bidderRankMode === "amount" ? b.bidder_email || b.bidder_name : b.bidder_key;
                const name = bidderRankMode === "amount" ? b.bidder_name : b.bidder_name || b.bidder;
                const nameCell = (
                  <td className="relative py-2 px-3 text-ink group/tip max-w-[220px]">
                    <span className="block truncate" title={name}>{name}</span>
                    <div className={`pointer-events-none absolute left-0 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60] ${i >= topBidders.length - 3 ? "bottom-full mb-1" : "top-full mt-1"}`}>
                      <BidderHoverCard row={hoverRow} />
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
                        <td className="py-2 px-3 text-right tabular text-ink">{hoverRow.monthsActive ?? "—"}</td>
                      </>
                    ) : (
                      <>
                        {nameCell}
                        <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{b.bid_events}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.distinct_lots}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.distinct_lots > 0 ? (b.bid_events / b.distinct_lots).toFixed(2) : "—"}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.auctions_participated}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{b.months_active ?? "—"}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{hoverRow.winningLots ?? "—"}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{hoverRow.winningBidAmount != null ? formatPeso(hoverRow.winningBidAmount) : "—"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {topBidders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted text-[14.5px]">
                    {bidderRankMode === "amount" ? "No settled winning bidders in this scope." : "No bidder activity in this scope."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {bidderRankMode === "activity" && (
          <div className="text-[12px] text-muted mt-2">
            Winning Lots/Winning Bid Amount are looked up by the bidder's own canonical email against the full settled/winning population (not just the top 10 by amount) — 0 / ₱0 for an identified bidder with no wins, "—" only if that identity genuinely can't be resolved.
          </div>
        )}
      </StorySection>
    </div>
  );
}
