import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import MoneyFlowWaterfall from "./MoneyFlowWaterfall";

export default function RevenueBreakdownView({ store, overview, rangeLabel, isLive }) {
  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel}${isLive ? " · Live" : ""}`}
          headline="How the total bid amount splits between commission, buyer's premium, service fees, and what's left for the vendor."
        />
      </div>
      <StorySection
        title="Revenue & Payout Breakdown"
        insight="How the total bid amount splits between commission, buyer's premium, service fees, and what's left for the vendor."
        last
      >
        <MoneyFlowWaterfall data={overview.moneyFlow} rangeLabel={rangeLabel} />
      </StorySection>
    </div>
  );
}
