import { useEffect, useState } from "react";
import Modal from "./Modal";
import { formatManila } from "../../utils/manilaTime";

function fmtAbs2dp(n) {
  if (n === null || n === undefined) return "—";
  return Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// BIDDER'S OWN LOTS — click-through from Bidder Analytics' Top Bidders —
// 5-Year Bid Value table, per explicit request ("display which auction
// they participated ... auction number, bid amount, lot number etc").
// Fetches api/leaderboards.js's type=bidder-lots-detail on open (not
// preloaded — a bidder can have hundreds/thousands of lots, see that
// endpoint's own comment), scoped to the SAME bidder name + category
// filter the table row was opened from, so the list always reconciles
// with what's on screen. Bidder Analytics only — Vendor Analytics has no
// equivalent per explicit request.
export default function BidderLotsModal({ bidderName, category, onClose }) {
  const [state, setState] = useState({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!bidderName) return;
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    const qs = new URLSearchParams({ type: "bidder-lots-detail", bidder: bidderName, category: category || "" });
    fetch(`/api/leaderboards?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`bidder-lots-detail returned ${res.status}: ${await res.text()}`);
        return res.json();
      })
      .then((result) => {
        if (!cancelled) setState({ data: result, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [bidderName, category]);

  const rows = state.data?.rows || [];

  return (
    <Modal open={Boolean(bidderName)} onClose={onClose} title={bidderName || "Bidder Lots"} subtitle="Auctions & lots won (Paid/Released), 5-year window">
      {state.loading && <div className="text-center text-ink text-[14.5px] py-8">Loading…</div>}
      {state.error && <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[14.5px]">Couldn't load lot detail: {state.error}</div>}
      {!state.loading && !state.error && (
        <>
          {state.data?.truncated && (
            <div className="text-[12px] text-muted mb-2">Showing the most recent 500 lots — this bidder has more than that on file.</div>
          )}
          <div className="overflow-x-auto max-h-[440px] overflow-y-auto border border-gridline rounded-lg">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-white text-[11.5px] uppercase tracking-wide bg-navy sticky top-0">
                  <th className="text-left font-medium py-2 px-3">Date</th>
                  <th className="text-left font-medium py-2 px-3">Auction Number</th>
                  <th className="text-left font-medium py-2 px-3">Lot Number</th>
                  <th className="text-left font-medium py-2 px-3">Item</th>
                  <th className="text-left font-medium py-2 px-3">Category</th>
                  <th className="text-left font-medium py-2 px-3">Branch</th>
                  <th className="text-right font-medium py-2 px-3">Bid Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.auction_number}-${r.lot_number}-${i}`} className="border-t border-gridline">
                    <td className="py-2 px-3 text-ink whitespace-nowrap">{r.event_date ? formatManila(r.event_date, { withYear: true }) : "—"}</td>
                    <td className="py-2 px-3 text-ink whitespace-nowrap">{r.auction_number ?? "—"}</td>
                    <td className="py-2 px-3 text-ink whitespace-nowrap">{r.lot_number ?? "—"}</td>
                    <td className="py-2 px-3 text-ink max-w-[220px] truncate" title={r.lot_name || ""}>{r.lot_name || "—"}</td>
                    <td className="py-2 px-3 text-ink whitespace-nowrap">{r.lot_category || "—"}</td>
                    <td className="py-2 px-3 text-ink whitespace-nowrap">{r.store_name || "—"}</td>
                    <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{fmtAbs2dp(r.bid_amount)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted text-[13.5px]">No settled lots found for this bidder in the 5-year window/category.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-[11.5px] text-muted mt-2">{rows.length} lot(s) shown.</div>
        </>
      )}
    </Modal>
  );
}
