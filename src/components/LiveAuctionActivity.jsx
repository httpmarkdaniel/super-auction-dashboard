import { formatPeso } from "../utils/format";

// Live/current-moment panel — deliberately separate from the WTD/MTD/YTD
// historical scorecards below it. Both fields are already-fetched Overview
// data (heroKPIs.todaysBidAmount / heroKPIs.activeAuctionsNow), no new
// request. No period comparison here: these are "right now" numbers, not
// a range that has a comparable prior period.
export default function LiveAuctionActivity({ todaysBidAmount, activeAuctionsNow, updatedAt, onClickActiveAuctions }) {
  return (
    <div className="relative rounded-xl border-2 border-navy/15 bg-gradient-to-br from-navySoft to-surface1 px-6 py-6 md:px-8 md:py-7 shadow-card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-critical pulse-dot inline-block" />
          <span className="text-[13px] tracking-[0.12em] uppercase text-navy font-bold font-display">Live Auction Activity</span>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-toneRedBg text-toneRedText text-[12px] font-bold tracking-wide uppercase px-2 py-1 rounded-md">
          <span className="w-1.5 h-1.5 rounded-full bg-toneRedText pulse-dot" />
          Live Now
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10">
        <div>
          <div className="kpi-label mb-1.5">Today's Bid</div>
          <div className="font-display text-[44px] md:text-[52px] leading-none text-ink">{formatPeso(todaysBidAmount)}</div>
          <div className="text-[14px] text-muted mt-2">Current standing bid value</div>
        </div>

        <button
          type="button"
          onClick={onClickActiveAuctions}
          className="text-left group"
        >
          <div className="kpi-label mb-1.5 flex items-center gap-1">
            Active Auctions
            <span className="text-navy group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
          <div className="font-display text-[44px] md:text-[52px] leading-none text-ink group-hover:text-navy transition-colors">
            {activeAuctionsNow}
          </div>
          <div className="text-[14px] text-muted mt-2">Auction events live now</div>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-navy/10 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot inline-block" />
          Live data
        </span>
        <span>Updated {updatedAt}</span>
      </div>
    </div>
  );
}
