import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import AuctionSummaryTable from "./AuctionSummaryTable";
import { useFullAuctionDetail } from "../useFullAuctionDetail";

export default function FullAuctionDetailView({ store, dateRange, rangeLabel, refreshNonce }) {
  const { data: lots, loading, error } = useFullAuctionDetail(store, dateRange, refreshNonce);

  if (error && !lots) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load auction detail: {error}
      </div>
    );
  }
  if (loading || !lots) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading auction detail…</div>;
  }

  const auctionCount = new Set(lots.map((l) => l.auction_number)).size;

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-critical/10 text-toneRedText text-[13.5px]">
          Couldn't refresh auction detail: {error} — showing last loaded data.
        </div>
      )}

      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel} · Live`}
          headline={`${auctionCount} auction${auctionCount === 1 ? "" : "s"} ${
            rangeLabel === "Today" ? "today" : `in the ${rangeLabel.toLowerCase()}`
          }, rolled up from ${lots.length} individual lot${lots.length === 1 ? "" : "s"}.`}
        />
      </div>
      <StorySection
        title="Full Auction Detail"
        insight="Every auction from the selected date range, rolled up from its individual lots — search by auction #, branch, or category."
        last
      >
        <AuctionSummaryTable data={lots} />
      </StorySection>
    </div>
  );
}
