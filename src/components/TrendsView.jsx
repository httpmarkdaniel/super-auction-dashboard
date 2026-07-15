import TrendChart from "./TrendChart";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import { getYearlyTrendsForStore } from "../mockData";
import { buildTrendsStoryline } from "../insights";

function metric(trends, key) {
  return trends.metrics.find((m) => m.key === key);
}

function pick(m) {
  return { label: m.label, unit: m.unit, trend: m.trend, values: m.values };
}

export default function TrendsView({ store }) {
  const trends = getYearlyTrendsForStore(store);
  const story = buildTrendsStoryline(trends, store);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${trends.years[0]}–${trends.years[trends.years.length - 1]} · The Story`}
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
