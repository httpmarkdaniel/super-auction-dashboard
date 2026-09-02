// Compact "right now" card — Today's Bid / Active Auctions, stacked next
// to the now-dominant Bid Trend chart. Deliberately small and quiet (a
// single subtle live dot, no banner) — the large standalone Live Auction
// Activity panel this replaces drew far more visual weight than a "right
// now" snapshot warrants next to the historical Bid Trend it now sits
// beside. No period comparison here: these are live numbers, not a range
// with a comparable prior period.
//
// `footer`: optional compact live-bidder-activity row(s) rendered below
// `sub`, inside a top-bordered strip — e.g. Total Clicks/Bids Today / New
// Bidders Today under Active Auctions (see App.jsx), kept small/within
// this "Auction Events / Live Now" card rather than a separate standalone
// section.
export default function LiveMiniCard({ label, value, sub, onClick, footer }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex-1 bg-surface1 border border-gridline rounded-lg shadow-card px-4 py-3.5 text-left w-full flex flex-col justify-center min-h-[104px] ${
        onClick ? "cursor-pointer hover:border-navy/40 transition-colors group" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-critical pulse-dot inline-block shrink-0" />
        <span className="kpi-label truncate">{label}</span>
        {onClick && (
          <span className="text-navy group-hover:translate-x-0.5 transition-transform ml-auto shrink-0">→</span>
        )}
      </div>
      <div className="font-display text-[28px] leading-none text-ink">{value}</div>
      {sub && <div className="text-[13px] text-muted mt-1.5 truncate">{sub}</div>}
      {footer && <div className="mt-2 pt-2 border-t border-gridline">{footer}</div>}
    </Wrapper>
  );
}
