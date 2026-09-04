import Modal from "./Modal";
import { formatPeso } from "../../utils/format";

function Field({ label, value }) {
  return (
    <div>
      <div className="text-muted text-[12.5px]">{label}</div>
      <div className="tabular font-medium text-[15px] text-ink">{value ?? "—"}</div>
    </div>
  );
}

// TOP VENDOR click-through detail (executive cleanup task) — replaces the
// old hover-only card. Every field is already present on the enriched
// vendor_analytics.all_lots row (see api/leaderboards.js's vendorAllLotsQuery
// comment) — zero new requests. "First Seen" (not "Date Registered") is
// the correct label: no genuine vendor registration-date field exists on
// any mart this dashboard queries. Unsold Lots/Unsold Reserve Value/
// Primary Category/Most Recent Auction are explicitly NOT available on
// this row (verified against real data) — shown as "Not Available" here
// rather than fabricated, per this task's own instruction.
export default function VendorDetailModal({ vendor, onClose }) {
  const v = vendor;
  const sellThroughPct = v && v.lots_listed > 0 ? (v.lots_sold / v.lots_listed) * 100 : null;
  const branchNames = v?.branch_names || [];
  const allAEs = v?.all_account_executives || [];
  const serviceIncome = v ? (v.buyers_premium_income || 0) + (v.commission_income || 0) : 0;

  return (
    <Modal open={Boolean(v)} onClose={onClose} title={v?.vendor || "Vendor Detail"}>
      {v && (
        <div className="space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Profile</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <Field label="Vendor" value={v.vendor} />
              <Field label="First Seen" value={v.first_seen ? String(v.first_seen).slice(0, 10) : "Not Available"} />
              <Field label="Account Executive" value={v.account_executive || "Not Available"} />
              <Field label="Branches Supplied" value={branchNames.length || 0} />
            </div>
            {allAEs.length > 1 && (
              <div className="mb-2">
                <div className="text-muted text-[12.5px]">All Account Executives ({allAEs.length})</div>
                <div className="text-[14px] text-ink">{allAEs.join(", ")}</div>
              </div>
            )}
            {branchNames.length > 0 && (
              <div>
                <div className="text-muted text-[12.5px]">Branches Supplied (this period)</div>
                <div className="text-[14px] text-ink">{branchNames.join(", ")}</div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gridline">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Performance</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Lots Listed" value={v.lots_listed} />
              <Field label="Lots Sold" value={v.lots_sold} />
              <Field label="Sell-Through" value={sellThroughPct != null ? `${sellThroughPct.toFixed(1)}%` : "—"} />
              <Field label="Sold Bid Value" value={formatPeso(v.settled_bid_amount)} />
              <Field label="Buyer's Premium" value={formatPeso(v.buyers_premium_income || 0)} />
              <Field label="Service Fee" value={formatPeso(v.commission_income || 0)} />
              <Field label="Service Income" value={formatPeso(serviceIncome)} />
            </div>
          </div>

          <div className="pt-4 border-t border-gridline">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Other</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Unsold Lots" value="Not Available" />
              <Field label="Unsold Reserve Value" value="Not Available" />
              <Field label="Primary Category" value="Not Available" />
              <Field label="Most Recent Auction" value="Not Available" />
            </div>
            <div className="text-[12px] text-muted mt-2">These four fields have no safe, non-fabricated source on the currently loaded vendor dataset.</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
