import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import BiddingPaceHourlyTrend from "./BiddingPaceHourlyTrend";
import { useBiddingPace } from "../useBiddingPace";

export default function BiddingPaceView({ store, dateRange, rangeLabel, refreshNonce }) {
  const { data, loading, error, unsupported } = useBiddingPace(store, dateRange, refreshNonce);

  if (unsupported) {
    return (
      <div className="px-4 py-6 rounded-lg border border-gridline bg-plane text-center text-ink text-[15.5px]">
        <div className="font-medium mb-1">All Time is not currently available for Bidding Pace.</div>
        <div className="text-muted text-[14px]">Select a specific date range to load bidding activity and bidder details.</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load bidding pace: {error}
      </div>
    );
  }
  if (loading || !data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading bidding pace…</div>;
  }

  const { hourlyTrend, hourlyDetail } = data;

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-critical/10 text-toneRedText text-[13.5px]">
          Couldn't refresh bidding pace: {error} — showing last loaded data.
        </div>
      )}

      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel}`}
          headline="How bidding activity is spread across the hours of the day — hover an hour for its Participating and Winning bidder breakdown."
        />
      </div>

      <StorySection title="Bidding Activity by Hour" last>
        <BiddingPaceHourlyTrend data={hourlyTrend} rangeLabel={rangeLabel} hourlyDetail={hourlyDetail} />

        <div className="mt-4 px-4 py-3 rounded-lg border border-gridline bg-plane text-[13px] text-muted">
          <div className="text-ink font-medium mb-0.5">What "Auction Events" counts</div>
          The distinct auctions with real bidding activity in each hour — an auction bid on many times in one hour
          still counts once; the same auction can appear again in a later hour if it stays active.
        </div>
      </StorySection>
    </div>
  );
}
