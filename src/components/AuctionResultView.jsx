import { useAuctionResult } from "../useAuctionResult";
import { formatPeso } from "../utils/format";

// AUCTION RESULT — reproduces the Superset "Auction Result" report
// (xv3.mart_auction_vendor_analysis grouped by Payment Status/For Approval
// Status) inside the dashboard, scoped to this tab's own Date filter (see
// App.jsx's auctionResultDateRange, defaulting to YTD, independent of
// Overview/Bidder/Vendor Analytics — no cross-tab bleed). One request via
// useAuctionResult.js -> /api/overview?type=auction-result. No drilldowns,
// modals, exports, or charts this round — table + totals only.
//
// The Total row comes from the API's own separate, non-grouped `totals`
// query — never a sum of this page's grouped rows, since a lot_number can
// appear in more than one Payment/Approval status combination (verified
// against real data; see api/overview.js's own comment on this handler).
export default function AuctionResultView({ dateRange, store, category, rangeLabel, refreshNonce }) {
  const { data, loading, error } = useAuctionResult(dateRange, store, category, refreshNonce);

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Auction Result: {error}</div>;
  }

  const rows = data?.rows || [];
  const totals = data?.totals || { count_of_lot: 0, reserved_price: 0, bid_amount: 0 };

  return (
    <div className={loading && !data ? "opacity-50" : ""}>
      <p className="text-[15.5px] text-muted mb-6">
        Lot payment and approval status summary for the selected period. <span className="text-ink font-medium">{rangeLabel}</span>
        {store ? <span> · {store}</span> : null}
        {category ? <span> · {category}</span> : null}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
          <div className="kpi-label mb-2.5">Total Lots</div>
          <div className="font-display text-[36.5px] leading-none text-ink">{totals.count_of_lot.toLocaleString()}</div>
        </div>
        <div className="bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
          <div className="kpi-label mb-2.5">Total Reserved Price</div>
          <div className="font-display text-[36.5px] leading-none text-ink">{formatPeso(totals.reserved_price)}</div>
        </div>
        <div className="bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
          <div className="kpi-label mb-2.5">Total Bid Amount</div>
          <div className="font-display text-[36.5px] leading-none text-series1">{formatPeso(totals.bid_amount)}</div>
        </div>
      </div>

      <div className="overflow-x-auto bg-surface1 border border-gridline rounded-lg shadow-card">
        <table className="w-full text-[14px] min-w-[720px]">
          <thead>
            <tr className="text-white text-[12px] uppercase tracking-wide bg-navy">
              <th className="text-left font-medium py-2 px-3">Payment Status</th>
              <th className="text-left font-medium py-2 px-3">For Approval Status</th>
              <th className="text-right font-medium py-2 px-3">Count of Lot</th>
              <th className="text-right font-medium py-2 px-3">Reserved Price</th>
              <th className="text-right font-medium py-2 px-3">Bid Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.payment_status}-${row.for_approval_status}-${i}`} className="border-t border-gridline hover:bg-plane">
                <td className="py-2 px-3 text-ink font-medium">{row.payment_status}</td>
                <td className="py-2 px-3 text-ink">{row.for_approval_status}</td>
                <td className="py-2 px-3 text-right tabular text-ink">{row.count_of_lot.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular text-ink">{formatPeso(row.reserved_price)}</td>
                <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(row.bid_amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted text-[14px]">
                  No auction result activity in this scope.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-navy bg-navySoft font-semibold">
              <td className="py-2.5 px-3 text-navy" colSpan={2}>
                Total (distinct lots)
              </td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{totals.count_of_lot.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{formatPeso(totals.reserved_price)}</td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{formatPeso(totals.bid_amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-[11.5px] text-muted mt-3">
        Reflects every lot/status/approval combination for the selected period — not limited to Paid/Released lots. The Total row is its own distinct-lot count, not a sum of the rows above (a lot can appear under more than one status/approval combination).
      </div>
    </div>
  );
}
