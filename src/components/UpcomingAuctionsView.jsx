import { scopeAdverb } from "../insights";
import { useUpcomingAuctions } from "../useUpcomingAuctions";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";

function formatDay(date) {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOffset = Math.round((date - startOfToday) / (24 * 60 * 60 * 1000));
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return date.toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

// ClickHouse gives "YYYY-MM-DD HH:MM:SS.mmm" with no timezone marker — see
// useLiveBidding.js's parseChDateTime for why local-time parsing is the
// closest match without a server-side timezone contract.
function parseChDateTime(s) {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function AuctionCard({ a }) {
  return (
    <div className="tile px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[16px] font-semibold text-ink truncate">
          {a.auctionNumber} <span className="text-muted font-normal">· {a.channel}</span>
        </div>
        <div className="text-[14.5px] text-ink mt-0.5">
          {a.venue} · ~{a.lotsCount} lots
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[15.5px] font-semibold text-series1">{formatDay(a.startingTime)}</div>
        <div className="text-[14.5px] text-ink tabular">{formatTime(a.startingTime)}</div>
      </div>
    </div>
  );
}

export default function UpcomingAuctionsView({ store, refreshNonce }) {
  const { data: live, loading, error } = useUpcomingAuctions(store, refreshNonce);

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load upcoming auctions: {error}
      </div>
    );
  }
  if (loading || !live) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading upcoming auctions…</div>;
  }

  const auctions = live
    .map((a) => ({
      id: a.auction_number,
      auctionNumber: a.auction_number,
      channel: a.category,
      venue: a.store_name,
      lotsCount: Number(a.lot_count) || 0,
      startingTime: parseChDateTime(a.starting_time),
    }))
    .filter((a) => a.startingTime);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · Upcoming · Live`}
          headline={`${auctions.length} auction${auctions.length === 1 ? "" : "s"} scheduled ${scopeAdverb(
            store
          )} in the coming days.`}
        />
      </div>

      <StorySection title="Scheduled Auctions" insight="Sorted soonest first." last>
        <div className="space-y-3">
          {auctions.length === 0 && (
            <div className="text-center text-ink text-[15.5px] py-12">No upcoming auctions scheduled {scopeAdverb(store)}.</div>
          )}
          {auctions.map((a) => (
            <AuctionCard key={a.id} a={a} />
          ))}
        </div>
      </StorySection>
    </div>
  );
}
