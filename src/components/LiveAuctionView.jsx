import { useState } from "react";
import { useLiveBidding, useLotDetail } from "../useLiveBidding";
import { formatPeso } from "../utils/format";
import { buildLiveAuctionStoryline } from "../insights";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";

function formatCountdown(sec) {
  if (sec == null) return "—";
  const totalMin = Math.floor(sec / 60);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
  return `${totalMin}m ${Math.floor(sec % 60)}s`;
}

function formatBidTime(ts) {
  return new Date(ts).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// Per-lot bidding-war feed, most recent first — fetched on demand (see
// useLotDetail) rather than eagerly for every lot, to stay well under
// cms.hmr.ph's 60 requests/min limit.
function BidHistory({ bids }) {
  if (!bids || bids.length === 0) {
    return <div className="mt-3 pt-3 border-t border-gridline text-[14.5px] text-muted">No bids yet.</div>;
  }
  return (
    <div className="mt-3 pt-3 border-t border-gridline">
      <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">Recent Bids</div>
      <div className="space-y-1">
        {bids.slice(0, 6).map((b, i) => (
          <div key={`${b.bidderNumber}-${b.timestamp}-${i}`} className="flex items-center justify-between gap-2 text-[14.5px]">
            <div className="flex items-center gap-1.5 min-w-0">
              {i === 0 && <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot shrink-0" />}
              <span className="text-ink truncate">
                {b.bidderNumber != null ? `Bidder #${b.bidderNumber}` : "Floor bid"}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="tabular text-ink">{formatPeso(b.amount)}</span>
              <span className="tabular text-muted text-[13.5px] w-[68px] text-right">{formatBidTime(b.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bidders({ bidders }) {
  if (!bidders || bidders.length === 0) {
    return <div className="mt-3 pt-3 border-t border-gridline text-[14.5px] text-muted">No named bidders yet.</div>;
  }
  return (
    <div className="mt-3 pt-3 border-t border-gridline">
      <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-1.5">
        Bidders ({bidders.length})
      </div>
      <div className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
        {bidders.map((b) => (
          <div key={b.bidderNumber} className="flex items-center justify-between gap-2 text-[14.5px]">
            <span className="text-ink truncate">{b.name || `Bidder #${b.bidderNumber}`}</span>
            <span className="tabular text-muted text-[13.5px]">#{b.bidderNumber}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LotCard({ lot }) {
  const [expanded, setExpanded] = useState(false);
  const detail = useLotDetail(lot.postingId, expanded);
  const closingSoon = lot.closesInSec != null && lot.closesInSec <= 60;

  return (
    <div className="tile px-5 py-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[14.5px] tabular text-ink mb-0.5">Lot {lot.lotNumber}</div>
          <div className="text-[17px] text-ink font-medium">{lot.item}</div>
        </div>
        <span
          className={`text-[13.5px] font-semibold px-2 py-0.5 rounded shrink-0 ${
            closingSoon ? "text-toneRedText bg-critical/10" : "text-toneGreenText bg-good/10"
          }`}
        >
          {closingSoon ? "Closing Soon" : "Active"}
        </span>
      </div>
      <div className="flex items-end justify-between mt-3">
        <div>
          <div className="text-[13.5px] text-ink mb-0.5">
            {lot.currentBid != null ? "Current Bid" : lot.startingBid != null ? "Starting Bid" : "Current Bid"}
          </div>
          <div className="text-[27px] leading-none text-series1 font-semibold">
            {lot.currentBid != null
              ? formatPeso(lot.currentBid)
              : lot.startingBid != null
              ? formatPeso(lot.startingBid)
              : "No bids yet"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13.5px] text-ink mb-0.5">Closes in</div>
          <div className={`tabular text-[18px] ${closingSoon ? "text-toneRedText font-semibold" : "text-series1"}`}>
            {formatCountdown(lot.closesInSec)}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-[14px] font-semibold text-series1 hover:underline"
      >
        {expanded ? "Hide bid history & bidders" : "View bid history & bidders"}
      </button>

      {expanded && (
        <>
          {detail.loading && <div className="mt-3 pt-3 border-t border-gridline text-[14.5px] text-muted">Loading…</div>}
          {!detail.loading && (
            <>
              {detail.biddersError ? (
                <div className="mt-3 pt-3 border-t border-gridline text-[14.5px] text-toneRedText">
                  Couldn't load bidders: {detail.biddersError}
                </div>
              ) : (
                <Bidders bidders={detail.bidders} />
              )}
              {detail.bidsError ? (
                <div className="mt-3 pt-3 border-t border-gridline text-[14.5px] text-toneRedText">
                  Couldn't load bid history: {detail.bidsError}
                </div>
              ) : (
                <BidHistory bids={detail.bids} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function LiveAuctionView({ store }) {
  const { auctions, loading, error } = useLiveBidding(store);
  const allLots = auctions.flatMap((a) => a.lots.map((l) => ({ ...l, store: a.store })));
  const story = buildLiveAuctionStoryline(allLots);
  const auctionsWithLots = auctions.filter((a) => a.lots.length > 0);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader eyebrow={`${store} · Right Now · The Story`} headline={story.headline} />
      </div>

      <StorySection title="Lots to Watch" insight="Every lot currently live, with real-time bid amounts and countdowns." last>
        <div className="flex items-center gap-2 mb-6">
          <span className="w-2 h-2 rounded-full bg-critical pulse-dot" />
          <span className="text-[15.5px] font-medium text-toneRedText">{allLots.length} lots live now at {store}</span>
        </div>

        {error && <div className="text-center text-toneRedText text-[15.5px] py-4">Couldn't load live bidding: {error}</div>}

        {!error && loading && auctions.length === 0 && (
          <div className="text-center text-ink text-[15.5px] py-12">Loading live auctions…</div>
        )}

        {auctionsWithLots.map((a) => (
          <div key={a.auctionNumber} className="mb-6 last:mb-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-4 rounded-sm bg-navy shrink-0" />
              <h3 className="text-[16px] font-semibold text-series1">
                {a.auctionNumber} · {a.store}
              </h3>
              <span className="text-[14.5px] text-muted">({a.lots.length} lots)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {a.lots.map((lot) => (
                <LotCard key={lot.key} lot={lot} />
              ))}
            </div>
          </div>
        ))}

        {!loading && !error && allLots.length === 0 && (
          <div className="text-center text-ink text-[15.5px] py-12">No live lots at {store} right now.</div>
        )}
      </StorySection>
    </div>
  );
}
