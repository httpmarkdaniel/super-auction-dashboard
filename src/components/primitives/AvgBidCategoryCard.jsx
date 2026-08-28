import { CATEGORY_NAMES } from "../../../api/_category.js";
import { formatPeso, formatCompactPeso } from "../../utils/format";

// Category-aware Avg Bid / Auction and Avg Bid / Sold Lot cards — see
// App.jsx's avgBidCategoryBreakdown comment for the underlying data (every
// canonical category always present, null-filled when a category had zero
// settled results this period). `category`/`onCategoryChange` are a LOCAL
// selector scoped to just these two cards, shared so switching one switches
// both (see HeroKPIs.jsx) — UNLESS `locked` is true, meaning the Overview's
// own global Category filter already picked a specific category: in that
// case the dropdown is replaced with a static label so the card can never
// show a category that contradicts the global filter, and `onCategoryChange`
// is not called. Metric-specific value/pct fields are picked via `metric`
// ("auction" | "soldLot") so this one component serves both cards.
function PctBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const rising = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12.5px] font-medium shrink-0 ${rising ? "text-toneGreenText" : "text-toneRedText"}`}>
      {rising ? "▲" : "▼"}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function AvgBidCategoryCard({
  icon,
  eyebrow,
  metric,
  methodology,
  rangeLabel,
  compareLabel,
  categoryBreakdown,
  category,
  locked = false,
  onCategoryChange,
  onClickCategory,
}) {
  const valueKey = metric === "auction" ? "avgBidPerAuction" : "avgBidPerSoldLot";
  const pctKey = metric === "auction" ? "avgBidPerAuctionPct" : "avgBidPerSoldLotPct";

  const byCategory = new Map(categoryBreakdown.map((c) => [c.category, c]));
  const selected = category ? byCategory.get(category) : null;

  return (
    <div className="relative bg-surface1 border border-gridline rounded-lg shadow-card px-4 py-3.5 group/tip">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="flex items-center justify-center w-6 h-6 rounded-md bg-navySoft text-navy shrink-0">{icon}</span>}
          <span className="eyebrow truncate">{eyebrow}</span>
          {methodology && (
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10.5px] font-bold shrink-0 leading-none">
              i
            </span>
          )}
        </div>
        {locked ? (
          <span
            title="Set by the Overview Category filter"
            className="text-[12.5px] font-medium bg-plane border border-gridline rounded px-1.5 py-1 text-muted shrink-0 max-w-[130px] truncate"
          >
            {category}
          </span>
        ) : (
          <select
            value={category}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="text-[12.5px] font-medium bg-plane border border-gridline rounded px-1.5 py-1 text-ink shrink-0 max-w-[120px]"
          >
            <option value="">All Categories</option>
            {CATEGORY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {category === "" ? (
        <div className="flex flex-col gap-1.5">
          {categoryBreakdown.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => onClickCategory(c.category)}
              className="flex items-center justify-between gap-2 text-left rounded px-1 py-0.5 -mx-1 hover:bg-plane transition-colors"
            >
              <span className="text-[14px] text-ink truncate" title={c.category}>
                {c.category}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="tabular font-semibold text-[15px] text-ink">
                  {c.hasData ? formatCompactPeso(c[valueKey]) : "—"}
                </span>
                <PctBadge pct={c[pctKey]} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => onClickCategory(category)} className="text-left w-full">
          <div className="text-[13px] text-muted mb-1 truncate" title={category}>
            {category}
          </div>
          <div className="font-display text-[32px] leading-none mb-2 text-ink">
            {selected && selected.hasData ? formatPeso(selected[valueKey]) : "—"}
          </div>
          {selected && selected[pctKey] != null && (
            <div className="flex items-center gap-1.5 text-[14px]">
              <PctBadge pct={selected[pctKey]} />
              <span className="text-muted">{compareLabel}</span>
            </div>
          )}
          {(!selected || !selected.hasData) && <div className="text-[13.5px] text-muted">No settled results · {rangeLabel}</div>}
        </button>
      )}

      {methodology && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-3 right-3 top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        >
          <div className="methodology px-3 py-2 text-[14px] leading-snug shadow-lg text-left">{methodology}</div>
        </div>
      )}
    </div>
  );
}
