import { useState } from "react";
import { useVendorFinancialSummary } from "../useVendorFinancialSummary";
import { useAuctionResultFilters } from "../useAuctionResult";
import { FilterSelect, AuctionNumberFilter, FromToFilter } from "./primitives/AuctionFilterControls";
import { formatPeso, formatCompactPeso } from "../utils/format";
import { manilaYesterdayISODate, manilaFirstDayOfCurrentMonthISODate } from "../utils/manilaTime";

// VENDOR SUMMARY — its own dedicated sidebar destination (moved out of
// Vendor Analytics, not duplicated — see VendorAnalyticsView.jsx, which no
// longer renders this section). A distinct, hardcoded Paid/Released-only
// financial rollup by calendar year, scoped by end_date (never
// ending_time/the Overview auction cohort), with its OWN independent
// Branch/Vendor/Auction Number/From/To/BDM filter set — completely
// separate from every other tab's filters/state (own hook, own fetch,
// own state). Status is deliberately NOT a user-facing filter here — the
// population is always Paid+Released, shown as static explanatory text
// rather than a control the user can change. Backend: api/leaderboards.js's
// type=vendor-financial-summary (unchanged by this move — same query,
// same formulas, only the frontend location changed).
function defaultVendorSummaryFilters() {
  const to = manilaYesterdayISODate();
  let from = manilaFirstDayOfCurrentMonthISODate();
  // Month-boundary edge case: if today is the 1st, "first day of this
  // month" is TODAY while "yesterday" is the LAST day of the PREVIOUS
  // month — From would be after To. Clamp to a single day (yesterday)
  // rather than emit a silently-inverted, always-empty range.
  if (from > to) from = to;
  return { from, to, branch: "", vendor: "", auctionNumber: "", bdm: "" };
}

export default function VendorSummaryView({ refreshNonce }) {
  const [filters, setFilters] = useState(defaultVendorSummaryFilters);
  const { filters: filterOptions, loading: filtersLoading } = useAuctionResultFilters();
  const { data, loading, error } = useVendorFinancialSummary(filters, refreshNonce);

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const resetFilters = () => setFilters(defaultVendorSummaryFilters());

  const branches = filterOptions?.branches || [];
  const vendors = filterOptions?.vendors || [];
  const bdms = filterOptions?.bdms || [];

  const rows = data?.rows || [];
  const totals = data?.totals || { total_bid_amount: 0, buyers_premium: 0, service_fee: 0, service_income: 0 };
  const activeFilterCount = ["branch", "vendor", "auctionNumber", "bdm"].filter((k) => filters[k]).length;
  const isCustomRange = filters.from !== defaultVendorSummaryFilters().from || filters.to !== defaultVendorSummaryFilters().to;

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Vendor Summary: {error}</div>;
  }

  return (
    <div className={loading && !data ? "opacity-50" : ""}>
      <p className="text-[15.5px] text-muted mb-4">Settled vendor financial performance by auction end date.</p>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <FilterSelect label="Branch" value={filters.branch} onChange={setFilter("branch")} options={branches} allLabel="All Branches" disabled={filtersLoading} />
        <FilterSelect label="Vendor" value={filters.vendor} onChange={setFilter("vendor")} options={vendors} allLabel="All Vendors" disabled={filtersLoading} />
        <AuctionNumberFilter value={filters.auctionNumber} onChange={setFilter("auctionNumber")} />
        <FromToFilter from={filters.from} to={filters.to} onFromChange={setFilter("from")} onToChange={setFilter("to")} />
        <FilterSelect label="BDM" value={filters.bdm} onChange={setFilter("bdm")} options={bdms} allLabel="All BDMs" disabled={filtersLoading} />
        {(activeFilterCount > 0 || isCustomRange) && (
          <button type="button" onClick={resetFilters} className="text-[13.5px] font-semibold text-navy hover:underline shrink-0 px-1">
            Reset Filters
          </button>
        )}
      </div>
      <div className="text-[12px] text-muted mb-4">Settled results only — Paid &amp; Released.</div>

      <div className="overflow-x-auto bg-surface1 border border-gridline rounded-lg shadow-card">
        <table className="w-full text-[14px] min-w-[600px]">
          <thead>
            <tr className="text-white text-[12px] uppercase tracking-wide bg-navy">
              <th className="text-left font-medium py-2 px-3">Year</th>
              <th className="text-right font-medium py-2 px-3">Total Bid Amount</th>
              <th className="text-right font-medium py-2 px-3">Buyer's Premium</th>
              <th className="text-right font-medium py-2 px-3">Service Fee</th>
              <th className="text-right font-medium py-2 px-3">Service Income</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-t border-gridline hover:bg-plane">
                <td className="py-2 px-3 text-ink font-medium">{row.year}</td>
                <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(row.total_bid_amount)}</td>
                <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(row.buyers_premium)}</td>
                <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(row.service_fee)}</td>
                <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(row.service_income)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted text-[14px]">No Paid/Released activity in this period.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-navy bg-navySoft font-semibold">
              <td className="py-2.5 px-3 text-navy">Total</td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{formatPeso(totals.total_bid_amount)}</td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{formatCompactPeso(totals.buyers_premium)}</td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{formatCompactPeso(totals.service_fee)}</td>
              <td className="py-2.5 px-3 text-right tabular text-navy">{formatCompactPeso(totals.service_income)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
