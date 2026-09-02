import { useState } from "react";
import Modal from "./Modal";
import { formatPeso } from "../../utils/format";

// Compact previous-period Bid Value change badge for the ranked row itself
// (PART 13) — CURRENT PERIOD BID VALUE vs PREVIOUS COMPARABLE PERIOD BID
// VALUE only, never a bidder/auction-count comparison. "New" when the
// entity had zero prior-period value; otherwise a signed %, never a
// fabricated Infinity%.
function ChangeBadge({ pctChange, isNewEntity }) {
  if (isNewEntity) return <span className="text-[12px] font-semibold text-series1">New</span>;
  if (pctChange == null) return null;
  const up = pctChange >= 0;
  return (
    <span className={`text-[12px] font-medium ${up ? "text-toneGreenText" : "text-toneRedText"}`}>
      {up ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
    </span>
  );
}

// Shared clickable row for CategoryStrip/BranchStrip — bar + share
// (unchanged visual language), a compact previous-period change badge
// always visible, and a CLICK-triggered detail modal telling the complete
// financial + bidder story for THIS entity only (never the overall
// Overview totals). Hover is visual-affordance-only now — no hover panel
// (see PART 8/20: the old hover-reveals-everything behavior is removed).
// Every field here already exists on the already-fetched Overview payload
// (App.jsx's withHoverDetail/bidValueComparison) — opening the modal
// triggers zero network requests.
export default function EntityBreakdownRow({ label, bidAmount, share, max, detail, onClick, rangeLabel, compareLabel }) {
  const [open, setOpen] = useState(false);
  const p = detail.participating;
  const w = detail.winning;

  // "Others" (the branch rollup bucket) deliberately carries no comparison
  // data (see App.jsx's branchBreakdown) — never show a misleading badge
  // for a bucket that isn't a real, comparable entity.
  const showComparison = detail.hasPreviousData || detail.isNewEntity;

  // "Others" (branch rollup) has no onClick (not a real, selectable
  // branch — see BranchStrip's own comment) — stays inert, same as before
  // the hover-to-click change, rather than opening a detail modal whose
  // own "view full auction detail" action would then have nothing to do.
  const interactive = Boolean(onClick);

  return (
    <>
      <button
        type="button"
        onClick={interactive ? () => setOpen(true) : undefined}
        className={`relative flex items-center gap-3 w-full text-left rounded-md px-1.5 py-1 -mx-1.5 border border-transparent transition-colors ${
          interactive ? "cursor-pointer hover:bg-plane hover:border-gridline" : "cursor-default"
        }`}
      >
        <div className="w-[150px] shrink-0 min-w-0">
          <div className="text-[15.5px] text-ink truncate">{label}</div>
          <div className="text-[13.5px] text-muted">{share}% share</div>
        </div>
        <div className="flex-1 h-2 rounded-full bg-gridline overflow-hidden">
          <div className="h-full rounded-full bg-series1" style={{ width: `${(bidAmount / max) * 100}%` }} />
        </div>
        <div className="w-[112px] text-right shrink-0">
          <div className="text-[15.5px] tabular text-series1">{formatPeso(bidAmount)}</div>
          {showComparison && (
            <div className="mt-0.5">
              <ChangeBadge pctChange={detail.bidValueChangePct} isNewEntity={detail.isNewEntity} />
            </div>
          )}
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={label} subtitle={rangeLabel}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 pb-4 border-b border-gridline">
          <div>
            <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Current Period Bid Value</div>
            <div className="font-display text-[22px] text-ink">{formatPeso(bidAmount)}</div>
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">
              Previous Comparable Period{compareLabel ? ` · ${compareLabel}` : ""}
            </div>
            <div className="font-display text-[22px] text-ink">
              {detail.hasPreviousData || detail.isNewEntity ? formatPeso(detail.previousBidAmount) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Change</div>
            <div className="font-display text-[22px]">
              {detail.isNewEntity ? (
                <span className="text-series1">New</span>
              ) : detail.bidValueChangePct != null ? (
                <span className={detail.bidValueChangePct >= 0 ? "text-toneGreenText" : "text-toneRedText"}>
                  {detail.bidValueChangePct >= 0 ? "+" : ""}
                  {detail.bidValueChangePct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-ink">—</span>
              )}
            </div>
            {(detail.hasPreviousData || detail.isNewEntity) && (
              <div className="text-[12px] tabular text-muted mt-0.5">
                {detail.bidValueChangeAbsolute >= 0 ? "+" : ""}
                {formatPeso(detail.bidValueChangeAbsolute)}
              </div>
            )}
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-wide text-muted font-semibold mb-1">Share of Current Bid Value</div>
            <div className="font-display text-[22px] text-ink">{share}%</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5 pb-4 border-b border-gridline">
          <div>
            <div className="text-muted text-[12px]">Auctions Concluded</div>
            <div className="tabular font-medium text-[15px]">{detail.auctionCount}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Lots Sold</div>
            <div className="tabular font-medium text-[15px]">{detail.lotsSold}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Participating Bidders</div>
            <div className="tabular font-medium text-[15px]">
              {p.total} <span className="text-muted font-normal text-[13px]">({p.newBidders} New · {p.returningBidders} Returning)</span>
            </div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Winning Bidders</div>
            <div className="tabular font-medium text-[15px]">
              {w.total} <span className="text-muted font-normal text-[13px]">({w.newBidders} New · {w.returningBidders} Returning)</span>
            </div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Total Bids</div>
            <div className="tabular font-medium text-[15px]">{p.totalBids.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Avg Bids / Unique Bidder</div>
            <div className="tabular font-medium text-[15px] text-series1">
              {p.avgBidsPerUniqueBidder != null ? p.avgBidsPerUniqueBidder.toFixed(2) : "—"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onClick?.();
          }}
          className="w-full text-left text-[14.5px] font-semibold text-series1 hover:underline"
        >
          Click to view full auction detail →
        </button>
      </Modal>
    </>
  );
}
