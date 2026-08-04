import TrendChart from "./TrendChart";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import { buildTrendsStoryline } from "../insights";
import { useTrends } from "../useTrends";

function metric(trends, key) {
  return trends.metrics.find((m) => m.key === key);
}

function pick(m) {
  return { label: m.label, unit: m.unit, trend: m.trend, values: m.values };
}

export default function TrendsView({ store, refreshNonce }) {
  const { data: trends, loading, error } = useTrends(store, refreshNonce);

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[13px]">
        Couldn't load trends data: {error}
      </div>
    );
  }
  if (loading || !trends) {
    return <div className="text-center text-ink text-[13px] py-12">Loading yearly trends…</div>;
  }
  if (!trends.years?.length) {
    return (
      <div className="text-center text-ink text-[13px] py-12">
        Not enough historical data {store === "All Stores" ? "company-wide" : `for ${store}`} to chart a trend yet.
      </div>
    );
  }

  const story = buildTrendsStoryline(trends, store);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${trends.years[0]}–${trends.years[trends.years.length - 1]} · Live · The Story`}
          headline={story.headline}
        />
      </div>

      <StorySection title="Volume & structure" insight={story.volumeInsight}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrendChart years={trends.years} {...pick(metric(trends, "itemsPerAuction"))} />
          <TrendChart years={trends.years} {...pick(metric(trends, "avgAuctionsPerBranch"))} />
        </div>
      </StorySection>

      <StorySection title="Demand strength" insight={story.demandInsight}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrendChart years={trends.years} {...pick(metric(trends, "bidderToAuctionRatio"))} />
          <TrendChart years={trends.years} {...pick(metric(trends, "sellThroughRate"))} />
        </div>
      </StorySection>

      <StorySection title="Value & margin" insight={story.marginInsight} last>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrendChart years={trends.years} {...pick(metric(trends, "avgBidPerItem"))} />
          <TrendChart years={trends.years} {...pick(metric(trends, "serviceIncomeMargin"))} />
        </div>
      </StorySection>
    </div>
  );
}
