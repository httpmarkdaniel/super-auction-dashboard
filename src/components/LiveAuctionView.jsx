import { useMemo, useState } from "react";
import { useLiveAuctionEvents, useAuctionLotDetail } from "../useOnlineBidding";
import { formatPeso, formatCompactPeso } from "../utils/format";
import { formatManila, isEndingSoon } from "../utils/manilaTime";
import { buildAuctionActivityEvents } from "../utils/auctionActivityEvents";
import { ALL_STORES } from "../mockData";
import StorySection from "./primitives/StorySection";
import BidActivityBar from "./primitives/BidActivityBar";
import AuctionProgressBar from "./primitives/AuctionProgressBar";

// Every displayed field's source, at a glance:
// - Auction metadata (name, branch, start/end, lot count) and everything
//   about bid history/identity/New-Returning: ClickHouse (warehouse) —
//   the live API doesn't expose any of it.
// - current_bid only: live cms.hmr.ph when available, ClickHouse's latest
//   recorded bid as a graceful fallback otherwise. current_bid_source on
//   every lot says which one actually produced the displayed number —
//   never silently presented as live when it isn't.
// This section is the ONLY part of the dashboard authorized to call
// cms.hmr.ph; Overview remains warehouse-only (see api/overview.js's
// OVERVIEW_LIVE_CORRECTION_ENABLED — untouched by this feature).

function SourceBadge({ source }) {
  if (source === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-toneGreenText">
        <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot" /> Live
      </span>
    );
  }
  if (source === "mixed") {
    return <span className="text-[12px] font-medium text-toneAmberText">Live · partial</span>;
  }
  return <span className="text-[12px] font-medium text-muted">Warehouse sync</span>;
}

// Auction-level Participating/Leading bidder breakdown card — same visual
// language as every other bidder-composition card in this dashboard
// (Bidding Pace, Full Auction Detail), kept local to Online Bidding since
// the two populations here (bid ACTIVITY vs CURRENT leaders) are specific
// to this ongoing-auction context. Not a new classifier: New/Returning
// still comes from api/live-auctions.js's reuse of the same first-ever-bid
// rule already validated elsewhere.
function BidderBreakdownCard({ title, amountLabel, total, newCount, returningCount, amount, newAmount, returningAmount, unresolvedAmount, unresolvedLabel }) {
  if (total === 0 && (!unresolvedAmount || unresolvedAmount === 0)) {
    return (
      <div className="border border-gridline rounded-lg p-4 bg-plane">
        <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
        <div className="text-[14px] text-muted">No bids yet.</div>
      </div>
    );
  }
  return (
    <div className="border border-gridline rounded-lg p-4 bg-plane">
      <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
      <div className="font-display text-[26px] leading-none text-ink mb-1">{total}</div>
      <div className="text-[13.5px] text-ink mb-2">
        {newCount} New · {returningCount} Returning
      </div>
      <div className="text-[14px] tabular text-series1">{formatCompactPeso(amount)} {amountLabel}</div>
      <div className="text-[12.5px] tabular text-muted mt-0.5">
        {formatCompactPeso(newAmount)} New · {formatCompactPeso(returningAmount)} Returning
      </div>
      {unresolvedAmount > 0 && (
        <div className="text-[12px] text-muted mt-1">
          + {formatCompactPeso(unresolvedAmount)} {unresolvedLabel}
        </div>
      )}
    </div>
  );
}

function BidHistoryTable({ events }) {
  if (!events || events.length === 0) {
    return <div className="text-[14px] text-muted py-2">No bids yet.</div>;
  }
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-muted text-[12px] uppercase tracking-wide">
            <th className="text-left font-medium pb-1.5 pr-3">Time</th>
            <th className="text-left font-medium pb-1.5 pr-3">Bidder</th>
            <th className="text-left font-medium pb-1.5 pr-3">Bidder Type</th>
            <th className="text-right font-medium pb-1.5">Bid Amount</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i} className="border-t border-gridline">
              <td className="py-1.5 pr-3 tabular text-ink">{formatManila(e.timestamp)}</td>
              <td className="py-1.5 pr-3 text-ink">{e.bidder ?? "Unknown bidder"}</td>
              <td className="py-1.5 pr-3 text-ink capitalize">{e.new_or_returning}</td>
              <td className="py-1.5 text-right tabular text-ink">{formatPeso(e.bid_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LotRow({ lot, auction }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="tile px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-[14.5px] tabular text-ink mb-0.5">Lot {lot.lot_number}</div>
          <div className="text-[17px] text-ink font-medium">{lot.name || `Lot ${lot.lot_number}`}</div>
          {lot.reserved_price > 0 && (
            <div className="text-[13px] text-muted mt-0.5">Reserve: {formatPeso(lot.reserved_price)}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[13.5px] text-ink mb-0.5">Current Bid</div>
          <div className="text-[24px] leading-none text-series1 font-semibold">
            {lot.current_bid > 0 ? formatPeso(lot.current_bid) : "No bids yet"}
          </div>
          <div className="mt-1">
            <SourceBadge source={lot.current_bid_source} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13.5px] mb-3">
        <div>
          <div className="text-muted">Bidder Count</div>
          <div className="text-ink font-medium tabular">{lot.participating_bidders}</div>
        </div>
        <div>
          <div className="text-muted">New</div>
          <div className="text-ink font-medium tabular">{lot.new_bidders}</div>
        </div>
        <div>
          <div className="text-muted">Returning</div>
          <div className="text-ink font-medium tabular">{lot.returning_bidders}</div>
        </div>
        <div>
          <div className="text-muted">Last Bid Time</div>
          <div className="text-ink font-medium tabular">{lot.last_bid_time ? formatManila(lot.last_bid_time) : "—"}</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-muted text-[13.5px] mb-1">
          Leading Bidder
          {lot.leading_bidder?.as_of === "warehouse_sync" && (
            <span className="text-toneAmberText"> — as of warehouse sync, not necessarily current</span>
          )}
        </div>
        {lot.leading_bidder ? (
          <div className="text-ink text-[15px]">
            {lot.leading_bidder.name ?? "Unresolved bidder"}
            <span className="text-muted capitalize"> · {lot.leading_bidder.type}</span>
          </div>
        ) : (
          <div className="text-muted text-[15px]">No bids yet</div>
        )}
      </div>

      <div className="mb-1">
        <div className="text-muted text-[13.5px] mb-1.5">Bid Activity</div>
        <BidActivityBar
          timelineStart={auction.timeline_start}
          officialStartTime={auction.starting_time}
          endingTime={auction.ending_time}
          events={lot.bid_events}
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-[14px] font-semibold text-series1 hover:underline"
      >
        {expanded ? "Hide bid history" : `Show bid history (${lot.bid_events.length})`}
      </button>
      {expanded && <BidHistoryTable events={lot.bid_events} />}
    </div>
  );
}

// Level 2 content, nested under "Show Detailed Bidding Per Lot" — only
// mounted (and only polling) while a given auction card is expanded.
function DetailedLotsSection({ auctionNumber }) {
  const { auction, lots, loading, error } = useAuctionLotDetail(auctionNumber);

  // Real auction-wide activity events — built entirely from the lots
  // already fetched above (each lot's own bid_events), never a second
  // request. See src/utils/auctionActivityEvents.js for exactly which
  // event types this data actually supports.
  const activityEvents = useMemo(
    () =>
      auction
        ? buildAuctionActivityEvents({
            lots,
            timelineStart: auction.timeline_start,
            endingTime: auction.ending_time,
          })
        : null,
    [auction, lots],
  );

  if (error) {
    return <div className="text-center text-toneRedText text-[15.5px] py-4">Couldn't load lot detail: {error}</div>;
  }
  if (loading && !auction) {
    return <div className="text-center text-ink text-[15.5px] py-8">Loading lots…</div>;
  }
  if (!auction) return null;

  return (
    <div className="mt-4">
      <div className="mb-4">
        <div className="text-muted text-[13.5px] mb-1.5">Auction Timeline &amp; Activity</div>
        <AuctionProgressBar
          auctionNumber={auction.auction_number}
          auctionName={auction.name}
          timelineStart={auction.timeline_start}
          officialStartTime={auction.starting_time}
          endingTime={auction.ending_time}
          activityEvents={activityEvents}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {lots.map((lot) => (
          <LotRow key={lot.lot_number} lot={lot} auction={auction} />
        ))}
        {lots.length === 0 && !loading && (
          <div className="text-center text-ink text-[15.5px] py-8 lg:col-span-2">No lots found for this auction.</div>
        )}
      </div>
    </div>
  );
}

function AuctionCard({ auction }) {
  const [detailExpanded, setDetailExpanded] = useState(false);
  const endingSoon = isEndingSoon(auction.ending_time);
  const p = auction.participating;
  const l = auction.leading;

  // Real bid-event activity for THIS card's own always-visible timeline —
  // built from auction.timeline_lots, already included in the Level 1
  // /api/live-auctions payload (see that endpoint's own comment). No
  // second request: this is the exact same data every other active
  // auction's card already receives on the existing 20s poll.
  const activityEvents = useMemo(
    () =>
      buildAuctionActivityEvents({
        lots: auction.timeline_lots,
        timelineStart: auction.timeline_start,
        endingTime: auction.ending_time,
      }),
    [auction],
  );

  return (
    <div className="tile px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[14.5px] tabular text-ink mb-0.5">{auction.auction_number}</div>
          <div className="text-[19px] text-ink font-medium">{auction.name || auction.auction_number}</div>
          <div className="text-[14px] text-muted mt-0.5">{auction.store_name || "—"}</div>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-toneGreenText uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot" /> Live
          </span>
          {endingSoon && <div className="text-[12.5px] font-semibold text-toneRedText mt-1">Ending Soon</div>}
        </div>
      </div>

      <div className="mb-4">
        <AuctionProgressBar
          auctionNumber={auction.auction_number}
          auctionName={auction.name}
          timelineStart={auction.timeline_start}
          officialStartTime={auction.starting_time}
          endingTime={auction.ending_time}
          activityEvents={activityEvents}
        />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <div>
          <div className="text-[13.5px] text-muted mb-0.5">Current Bid Value</div>
          <div className="text-[26px] leading-none text-series1 font-semibold">{formatPeso(auction.current_bid_value)}</div>
        </div>
        <div className="text-right text-[13px] text-muted">
          {auction.lot_count} lots · {auction.lots_with_bids} with bids
          <div className="mt-0.5"><SourceBadge source={auction.current_bid_source} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <BidderBreakdownCard
          title="Participating Bidders"
          amountLabel="activity"
          total={p.total}
          newCount={p.new}
          returningCount={p.returning}
          amount={p.total_activity}
          newAmount={p.new_activity}
          returningAmount={p.returning_activity}
          unresolvedAmount={p.unclassified_activity}
          unresolvedLabel="unclassified activity (no email on record)"
        />
        <BidderBreakdownCard
          title="Leading Bidders"
          amountLabel="current leading value"
          total={l.total}
          newCount={l.new}
          returningCount={l.returning}
          amount={l.new_value + l.returning_value}
          newAmount={l.new_value}
          returningAmount={l.returning_value}
          unresolvedAmount={l.unresolved_value}
          unresolvedLabel="unresolved leading value"
        />
      </div>

      <button
        type="button"
        onClick={() => setDetailExpanded((v) => !v)}
        className="text-[14.5px] font-semibold text-series1 hover:underline"
      >
        {detailExpanded ? "Hide Detailed Bidding Per Lot" : "Show Detailed Bidding Per Lot"}
      </button>

      {detailExpanded && <DetailedLotsSection auctionNumber={auction.auction_number} />}
    </div>
  );
}

function AuctionEventsList({ store }) {
  // "All Stores" is a mock-only sentinel, not a real branch value (same
  // conversion useLiveOverview's caller already applies in App.jsx) — it
  // must never be sent to /api/live-auctions as a literal store filter,
  // or the backend's store_name = {store:String} predicate matches zero
  // real branches and the auction list silently comes back empty.
  const { auctions, loading, error } = useLiveAuctionEvents(store === ALL_STORES ? undefined : store);

  return (
    <StorySection
      title="Auction Events"
      insight="Currently active Online Bidding auctions — independent of the Overview date range, since an auction's own open/close window is what matters here."
      last
    >
      {error && (
        <div className="text-center text-toneRedText text-[15.5px] py-4">Couldn't load live auctions: {error}</div>
      )}
      {!error && loading && auctions.length === 0 && (
        <div className="text-center text-ink text-[15.5px] py-12">Loading auction events…</div>
      )}
      {!loading && !error && auctions.length === 0 && (
        <div className="text-center text-ink text-[15.5px] py-12">No Online Bidding auctions currently active at {store}.</div>
      )}
      {auctions.length > 0 && (
        <div className="flex flex-col gap-5">
          {auctions.map((a) => (
            <AuctionCard key={a.auction_number} auction={a} />
          ))}
        </div>
      )}
    </StorySection>
  );
}

export default function LiveAuctionView({ store }) {
  return (
    <div>
      <AuctionEventsList store={store} />
    </div>
  );
}
