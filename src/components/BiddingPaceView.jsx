import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import HourlyTrend from "./HourlyTrend";

export default function BiddingPaceView({ store, overview, rangeLabel, isLive }) {
  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel}${isLive ? " · Live" : ""}`}
          headline="How bidding activity is spread across the hours of the day."
        />
      </div>
      <StorySection
        title="Bidding Activity by Hour"
        insight="How bidding activity is spread across the hours of the day."
        last
      >
        <HourlyTrend data={overview.hourlyTrend} rangeLabel={rangeLabel} />
      </StorySection>
    </div>
  );
}
