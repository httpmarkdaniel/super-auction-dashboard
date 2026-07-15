import { useState, useEffect } from "react";
import { getLiveLotsForStore, CATEGORY_NAMES } from "../mockData";
import { formatPeso } from "../utils/format";
import { buildLiveAuctionStoryline } from "../insights";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";

function formatCountdown(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function LotCard({ lot }) {
  const closingSoon = lot.closesInSec <= 60;
  return (
    <div className="card px-5 py-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[12px] tabular text-ink2 mb-0.5">
            {lot.lotNumber} · {lot.store}
          </div>
          <div className="text-[14px] text-ink font-medium">{lot.item}</div>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${
            closingSoon ? "text-critical bg-critical/10" : "text-good bg-good/10"
          }`}
        >
          {closingSoon ? "Closing Soon" : "Active"}
        </span>
      </div>
      <div className="flex items-end justify-between mt-3">
        <div>
          <div className="text-[11px] text-ink2 mb-0.5">Current Bid</div>
          <div className="text-[22px] leading-none text-series1 font-semibold">{formatPeso(lot.currentBid)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-ink2 mb-0.5">{lot.bidders} bidders</div>
          <div className={`tabular text-[15px] ${closingSoon ? "text-critical font-semibold" : "text-ink"}`}>
            {formatCountdown(lot.closesInSec)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LiveAuctionView({ store }) {
  const [lots, setLots] = useState(() => getLiveLotsForStore(store));

  useEffect(() => {
    setLots(getLiveLotsForStore(store));
  }, [store]);

  useEffect(() => {
    const t = setInterval(() => {
      setLots((prev) => prev.map((l) => ({ ...l, closesInSec: Math.max(0, l.closesInSec - 1) })));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const story = buildLiveAuctionStoryline(lots);
  const grouped = CATEGORY_NAMES.map((category) => ({
    category,
    lots: lots.filter((l) => l.category === category),
  })).filter((g) => g.lots.length > 0);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader eyebrow={`${store} · Right Now · The Story`} headline={story.headline} />
      </div>

      <StorySection title="Lots to watch" insight={story.hotLotInsight} last>
        <div className="flex items-center gap-2 mb-6">
          <span className="w-2 h-2 rounded-full bg-critical pulse-dot" />
          <span className="text-[13px] font-medium text-critical">{lots.length} lots live now at {store}</span>
        </div>

        {grouped.map(({ category, lots: categoryLots }) => (
          <div key={category} className="mb-6 last:mb-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-4 rounded-sm bg-brandOrange shrink-0" />
              <h3 className="text-[13.5px] font-semibold text-series1">{category}</h3>
              <span className="text-[12px] text-muted">({categoryLots.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryLots.map((lot) => (
                <LotCard key={lot.lotNumber} lot={lot} />
              ))}
            </div>
          </div>
        ))}

        {lots.length === 0 && (
          <div className="text-center text-ink2 text-[13px] py-12">No live lots at {store} right now.</div>
        )}
      </StorySection>
    </div>
  );
}
