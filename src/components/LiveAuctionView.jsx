import { useState } from "react";
import { useLiveAuctionEvents, useAuctionLotDetail } from "../useOnlineBidding";
import { formatPeso } from "../utils/format";
import { formatManila, timeRemainingLabel, isEndingSoon } from "../utils/manilaTime";
import { ALL_STORES } from "../mockData";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import BidActivityBar from "./primitives/BidActivityBar";

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

function AuctionEventsTable({ store, onSelectAuction }) {
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
        <div className="overflow-x-auto">
          <table className="w-full text-[15.5px]">
            <thead>
              <tr className="text-ink text-[13.5px] uppercase tracking-wide">
                <th className="text-left font-medium pb-2 pr-4">Auction #</th>
                <th className="text-left font-medium pb-2 pr-4">Auction Name</th>
                <th className="text-left font-medium pb-2 pr-4">Branch</th>
                <th className="text-left font-medium pb-2 pr-4">Starting Time</th>
                <th className="text-left font-medium pb-2 pr-4">Ending Time</th>
                <th className="text-right font-medium pb-2 pr-4">Total Lots</th>
                <th className="text-right font-medium pb-2 pr-4">Lots With Bids</th>
                <th className="text-right font-medium pb-2 pr-4">Current Bid Value</th>
                <th className="text-left font-medium pb-2">Time Remaining</th>
              </tr>
            </thead>
            <tbody>
              {auctions.map((a) => {
                const endingSoon = isEndingSoon(a.ending_time);
                return (
                  <tr
                    key={a.auction_number}
                    className="border-t border-gridline cursor-pointer hover:bg-plane"
                    onClick={() => onSelectAuction(a.auction_number)}
                  >
                    <td className="py-2.5 pr-4 tabular text-ink font-medium">{a.auction_number}</td>
                    <td className="py-2.5 pr-4 text-ink max-w-[240px] truncate" title={a.name}>
                      {a.name || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{a.store_name || "—"}</td>
                    <td className="py-2.5 pr-4 tabular text-ink">{formatManila(a.starting_time)}</td>
                    <td className="py-2.5 pr-4 tabular text-ink">{formatManila(a.ending_time)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{a.lot_count}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{a.lots_with_bids}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">
                      {formatPeso(a.current_bid_value)}
                      <div>
                        <SourceBadge source={a.current_bid_source} />
                      </div>
                    </td>
                    <td className={`py-2.5 tabular ${endingSoon ? "text-toneRedText font-semibold" : "text-ink"}`}>
                      {timeRemainingLabel(a.ending_time)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </StorySection>
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
        {expanded ? "Hide bid history" : `View bid history (${lot.bid_events.length})`}
      </button>
      {expanded && <BidHistoryTable events={lot.bid_events} />}
    </div>
  );
}

function AuctionLotDetail({ auctionNumber, onBack }) {
  const { auction, lots, loading, error } = useAuctionLotDetail(auctionNumber);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-[14.5px] font-semibold text-series1 hover:underline"
      >
        ← Back to Auctions
      </button>

      {error && <div className="text-center text-toneRedText text-[15.5px] py-4">Couldn't load auction detail: {error}</div>}
      {!error && loading && !auction && (
        <div className="text-center text-ink text-[15.5px] py-12">Loading auction…</div>
      )}

      {auction && (
        <>
          <div className="mb-6">
            <StoryHeader
              eyebrow={`${auction.auction_number} · ${auction.store_name}${isEndingSoon(auction.ending_time) ? " · Ending Soon" : ""}`}
              headline={auction.name || auction.auction_number}
              amount={formatPeso(auction.current_bid_value)}
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2 text-[14px] text-muted">
              <span>Starts {formatManila(auction.starting_time)}</span>
              <span>Ends {formatManila(auction.ending_time)}</span>
              <span className={isEndingSoon(auction.ending_time) ? "text-toneRedText font-semibold" : ""}>
                {timeRemainingLabel(auction.ending_time)}
              </span>
              <span>{auction.lot_count} lots</span>
              <SourceBadge source={auction.current_bid_source} />
            </div>
          </div>

          <StorySection title="Lots" insight="Every lot in this auction, including ones with no bids yet." last>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {lots.map((lot) => (
                <LotRow key={lot.lot_number} lot={lot} auction={auction} />
              ))}
            </div>
            {lots.length === 0 && !loading && (
              <div className="text-center text-ink text-[15.5px] py-12">No lots found for this auction.</div>
            )}
          </StorySection>
        </>
      )}
    </div>
  );
}

export default function LiveAuctionView({ store }) {
  const [selectedAuction, setSelectedAuction] = useState(null);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · Online Bidding`}
          headline={selectedAuction ? "Auction Lot Detail" : "Active Auction Events"}
        />
      </div>

      {selectedAuction ? (
        <AuctionLotDetail auctionNumber={selectedAuction} onBack={() => setSelectedAuction(null)} />
      ) : (
        <AuctionEventsTable store={store} onSelectAuction={setSelectedAuction} />
      )}
    </div>
  );
}
