import Modal from "./Modal";
import { formatPeso } from "../../utils/format";
import { formatManila } from "../../utils/manilaTime";

function Field({ label, value }) {
  return (
    <div>
      <div className="text-muted text-[12.5px]">{label}</div>
      <div className="tabular font-medium text-[15px] text-ink">{value ?? "—"}</div>
    </div>
  );
}

// TOP BIDDER click-through detail (executive cleanup task) — replaces the
// old hover-only card. Same fields, same zero-network-request source
// (the already-loaded `hoverRow` built by BidderAnalyticsView.jsx's
// toHoverRow()), just reorganized as PROFILE/ACTIVITY/WINNING sections in
// a full modal instead of a small hover popup, opened by clicking the row
// (see BidderAnalyticsView.jsx's onClick + "Click to view details"
// affordance) rather than requiring hover to discover it.
export default function BidderDetailModal({ bidder, onClose }) {
  return (
    <Modal open={Boolean(bidder)} onClose={onClose} title={bidder?.name || "Bidder Detail"} subtitle={bidder?.isNew != null ? (bidder.isNew ? "New" : "Returning") : undefined}>
      {bidder && (
        <div className="space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Profile</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Bidder Name" value={bidder.name} />
              <Field label="Date Registered" value={bidder.registeredAt ? formatManila(bidder.registeredAt, { withYear: true }) : "Not Available"} />
              <Field label="New / Returning" value={bidder.isNew != null ? (bidder.isNew ? "New" : "Returning") : "—"} />
              <Field label="Most Frequent Store" value={bidder.mostFrequentStore || "Not Available"} />
            </div>
          </div>

          <div className="pt-4 border-t border-gridline">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Activity</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Auctions Participated" value={bidder.auctionsParticipated} />
              <Field label="Distinct Lots Bid On" value={bidder.distinctLotsBidOn} />
              <Field label="Total Bid Actions" value={bidder.totalBidActions} />
              <Field label="Avg Bid Actions / Lot" value={bidder.avgBidActionsPerLot != null ? bidder.avgBidActionsPerLot.toFixed(2) : "—"} />
              <Field label="Months Active" value={bidder.monthsActive} />
              <Field label="Last Active Date" value={bidder.lastActiveAt ? formatManila(bidder.lastActiveAt, { withYear: true }) : "—"} />
            </div>
          </div>

          <div className="pt-4 border-t border-gridline">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Winning</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Winning Auctions" value={bidder.winningAuctions} />
              <Field label="Winning Lots" value={bidder.winningLots} />
              <Field label="Winning Bid Amount" value={bidder.winningBidAmount != null ? formatPeso(bidder.winningBidAmount) : "—"} />
              <Field label="Max Bid Usage %" value={bidder.maxBidUsagePct != null ? `${bidder.maxBidUsagePct.toFixed(1)}%` : "—"} />
            </div>
            {bidder.winningAuctions == null && (
              <div className="text-[12px] text-muted mt-2">Winning fields are unavailable in "By Bid Activity" mode when this identity can't be resolved against the settled/winning population.</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
