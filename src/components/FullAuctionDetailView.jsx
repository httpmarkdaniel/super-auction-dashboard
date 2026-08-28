import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import AuctionSummaryTable from "./AuctionSummaryTable";
import { useFullAuctionDetail } from "../useFullAuctionDetail";

export default function FullAuctionDetailView({ store, dateRange, rangeLabel, refreshNonce, category, onClearCategory }) {
  const { data, loading, error, unsupported } = useFullAuctionDetail(store, dateRange, refreshNonce);

  // A deliberate, expected state (unbounded "All Time" isn't currently
  // executable for this tab — see useFullAuctionDetail.js) — never framed
  // as a failure, and never shows stale rows from a previously-loaded
  // range under the "All Time" label.
  if (unsupported) {
    return (
      <div className="px-4 py-6 rounded-lg border border-gridline bg-plane text-center text-ink text-[15.5px]">
        <div className="font-medium mb-1">All Time is not currently available for Full Auction Detail.</div>
        <div className="text-muted text-[14px]">Select a specific date range to load auction and bidder details.</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load auction detail: {error}
      </div>
    );
  }
  if (loading || !data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading auction detail…</div>;
  }

  const { lots, bidderActivity } = data;
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
          eyebrow={`Store: ${store} · Date: ${rangeLabel}${category ? ` · Category: ${category}` : ""} · Live`}
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
        <AuctionSummaryTable
          data={lots}
          bidderActivity={bidderActivity}
          categoryFilter={category}
          onClearCategoryFilter={onClearCategory}
        />
      </StorySection>
    </div>
  );
}
