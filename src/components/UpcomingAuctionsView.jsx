import { scopeAdverb } from "../insights";
import { useUpcomingAuctions } from "../useUpcomingAuctions";
import { formatManila, manilaToEpochMs } from "../utils/manilaTime";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";

// "Starts in" — computed client-side from the real starting_time, same
// Manila-safe epoch math as Online Bidding's timeRemainingLabel (this
// codebase's ClickHouse timestamps carry no timezone marker and represent
// Asia/Manila wall-clock time directly, not UTC — see manilaTime.js).
function startsInLabel(startingTime) {
  const startMs = manilaToEpochMs(startingTime);
  if (startMs == null) return "—";
  const ms = startMs - Date.now();
  if (ms <= 0) return "Starting now";
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Same "starting now" boundary as startsInLabel above (ms <= 0) — kept as
// its own check purely so the card can swap "Starts in Starting now" for
// a clean standalone "Starting Now" label, without touching the countdown
// math itself.
function isStartingNow(startingTime) {
  const startMs = manilaToEpochMs(startingTime);
  if (startMs == null) return false;
  return startMs - Date.now() <= 0;
}

function AuctionCard({ a }) {
  return (
    <div className="tile px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[16px] font-semibold text-ink truncate">
          {a.auction_number}{" "}
          <span className="text-muted font-normal">
            · {a.category}
            {a.sub_type ? ` (${a.sub_type})` : ""}
          </span>
        </div>
        <div className="text-[14.5px] text-ink mt-0.5 truncate" title={a.name}>
          {a.name || "—"}
        </div>
        <div className="text-[13.5px] text-muted mt-0.5">
          {a.store_name || "—"} · ~{a.lot_count} lots
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[15.5px] font-semibold text-series1">
          {isStartingNow(a.starting_time) ? "Starting Now" : `Starts in ${startsInLabel(a.starting_time)}`}
        </div>
        <div className="text-[14.5px] text-ink tabular">{formatManila(a.starting_time)}</div>
        <div className="text-[13px] text-muted tabular">Ends {formatManila(a.ending_time)}</div>
      </div>
    </div>
  );
}

// Broader future auction calendar — ALL categories (Online Bidding, Live
// Auction, Simulcast, Buy Now), unlike the Online Bidding tab which is
// scoped specifically to currently-active category='Online Bidding'
// events. Independent of the Overview date range: an auction's own
// starting_time is what defines "upcoming," not when bids were placed —
// see api/upcoming-auctions.js.
export default function UpcomingAuctionsView({ store, refreshNonce }) {
  const { data: auctions, loading, error } = useUpcomingAuctions(store, refreshNonce);

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load upcoming auctions: {error}
      </div>
    );
  }

  if (loading && auctions.length === 0) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading upcoming auctions…</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · Upcoming Auctions`}
          headline={`${auctions.length} auction${auctions.length === 1 ? "" : "s"} scheduled ${scopeAdverb(
            store
          )}, across all auction types.`}
        />
      </div>

      <StorySection title="Scheduled Auctions" insight="Sorted soonest first." last>
        <div className="space-y-3">
          {auctions.length === 0 && (
            <div className="text-center text-ink text-[15.5px] py-12">No upcoming auctions scheduled {scopeAdverb(store)}.</div>
          )}
          {auctions.map((a) => (
            <AuctionCard key={a.auction_number} a={a} />
          ))}
        </div>
      </StorySection>
    </div>
  );
}
