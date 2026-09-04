// Shared progress-bar primitive (Winning Bidders UI consistency task) —
// used for every New/Returning/Unclassified-style composition breakdown
// in the dashboard: Overview's Winning Bidders card (BOTH its Bidders-
// count bar and its Winning-Value bar — previously two visually
// DIFFERENT constructions, the Value bar rendering only a single "New"
// fill with no distinct Returning segment) and Branch/Category
// Performance's EntityBidderBreakdown (Participating/Winning bars). Same
// height/radius/segment construction/spacing everywhere, so two bars
// with different denominators (bidder count vs. peso value) still read
// as two instances of the same visualization, per this task's explicit
// requirement — never two different-looking bars for the same kind of
// composition.
//
// `segments`: [{ pct, colorClass }] — pct is the TRUE, unrounded share;
// labels elsewhere must always display this exact value, never a value
// implied by the rendered width. A non-zero segment gets a 3px minWidth
// floor so a genuinely small share (e.g. 2.1%) stays visible instead of
// vanishing — flexbox's default shrink behavior absorbs that from the
// larger segments automatically, so the bar never visually exceeds 100%
// and no percentage is falsified in the process.
export default function SegmentedShareBar({ segments }) {
  return (
    <div className="h-2 rounded-full overflow-hidden flex bg-gridline mb-1.5">
      {segments.map((s, i) => (
        <div
          key={i}
          className={`${s.colorClass} h-full`}
          style={{ width: `${Math.max(s.pct, 0)}%`, minWidth: s.pct > 0 ? "3px" : 0 }}
        />
      ))}
    </div>
  );
}
