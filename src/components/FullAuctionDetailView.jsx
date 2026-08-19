import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import AuctionSummaryTable from "./AuctionSummaryTable";

export default function FullAuctionDetailView({ store, overview, rangeLabel, isLive }) {
  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel}${isLive ? " · Live" : ""}`}
          headline={`Every auction ${
            rangeLabel === "Today" ? "today" : `in the ${rangeLabel.toLowerCase()}`
          }, rolled up from its individual lots.`}
        />
      </div>
      <StorySection
        title="Full Auction Detail"
        insight="Every auction from the selected date range, rolled up from its individual lots — search by auction #, branch, or category."
        last
      >
        <AuctionSummaryTable data={overview.operationsDetail} />
      </StorySection>
    </div>
  );
}
