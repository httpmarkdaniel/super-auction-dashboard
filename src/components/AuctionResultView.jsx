import { useEffect, useState } from "react";
import { useAuctionResult, useAuctionResultFilters } from "../useAuctionResult";
import { formatPeso } from "../utils/format";
import { manilaYesterdayISODate } from "../utils/manilaTime";

function defaultFilters() {
  return {
    endDate: manilaYesterdayISODate(),
    branch: "",
    vendor: "",
    auctionNumber: "",
    status: "",
    bdm: "",
  };
}

function FilterSelect({ label, value, onChange, options, allLabel, disabled }) {
  return (
    <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="text-[14px] font-medium text-ink bg-transparent outline-none cursor-pointer max-w-[150px]"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// Free-text exact-match filter, not a dropdown — auction_number has 10,772
// distinct values on this table (verified against real data), far too
// many for a usable <select>. Commits on blur/Enter only, never per
// keystroke, so typing doesn't trigger a fetch on every character.
function AuctionNumberFilter({ value, onChange }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== value) onChange(trimmed);
  }

  return (
    <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">Auction #</span>
      <input
        type="text"
        value={draft}
        placeholder="All Auctions"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        className="text-[14px] font-medium text-ink bg-transparent outline-none w-[110px] placeholder:text-muted placeholder:font-normal"
      />
    </div>
  );
}

function EndDateFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">End Date</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[14px] font-medium text-ink bg-transparent outline-none"
      />
    </div>
  );
}

// AUCTION RESULT — operational report keyed on a single Manila calendar
// day (End Date, defaulting to Yesterday PHT), reproducing the Superset
// "Auction Result" report (xv3.mart_auction_vendor_analysis grouped by
// Payment Status/For Approval Status) with its own Branch/Vendor/Auction
// Number/Status/BDM filter set. Deliberately independent of the
// dashboard's global Store/Category/WTD-MTD-YTD-Custom controls — see
// App.jsx's hideFilters wiring on Topbar. One request per filter change
// via useAuctionResult.js; filter option lists load once via
// useAuctionResultFilters.js. No drilldowns, modals, exports, or charts.
//
// The Total row comes from the API's own separate, non-grouped `totals`
// query over the SAME filtered population — never a sum of this page's
// grouped rows, since a lot_number can appear in more than one Payment/
// Approval status combination (verified against real data; see
// api/overview.js's own comment on this handler).
export default function AuctionResultView({ refreshNonce }) {
  const [filters, setFilters] = useState(defaultFilters);
  const { filters: filterOptions, loading: filtersLoading } = useAuctionResultFilters();
  const { data, loading, error } = useAuctionResult(filters, refreshNonce);

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const resetFilters = () => setFilters(defaultFilters());

  const rows = data?.rows || [];
  const totals = data?.totals || { count_of_lot: 0, reserved_price: 0, bid_amount: 0 };

  const branches = filterOptions?.branches || [];
  const vendors = filterOptions?.vendors || [];
  const statuses = filterOptions?.statuses || [];
  const bdms = filterOptions?.bdms || [];

  const activeFilterCount = ["branch", "vendor", "auctionNumber", "status", "bdm"].filter((k) => filters[k]).length;

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Auction Result: {error}</div>;
  }

  return (
    <div className={loading && !data ? "opacity-50" : ""}>
      <p className="text-[15.5px] text-muted mb-4">Lot payment and approval status summary for the selected End Date.</p>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <FilterSelect label="Branch" value={filters.branch} onChange={setFilter("branch")} options={branches} allLabel="All Branches" disabled={filtersLoading} />
        <FilterSelect label="Vendor" value={filters.vendor} onChange={setFilter("vendor")} options={vendors} allLabel="All Vendors" disabled={filtersLoading} />
        <AuctionNumberFilter value={filters.auctionNumber} onChange={setFilter("auctionNumber")} />
        <EndDateFilter value={filters.endDate} onChange={setFilter("endDate")} />
        <FilterSelect label="Status" value={filters.status} onChange={setFilter("status")} options={statuses} allLabel="All Statuses" disabled={filtersLoading} />
        <FilterSelect label="BDM" value={filters.bdm} onChange={setFilter("bdm")} options={bdms} allLabel="All BDMs" disabled={filtersLoading} />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-[13.5px] font-semibold text-navy hover:underline shrink-0 px-1"
          >
            Reset Filters
          </button>
        )}
      </div>

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
                  No auction result activity for {filters.endDate} with the selected filters.
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
        Reflects every lot/status/approval combination for the selected End Date and filters — not limited to Paid/Released lots. The Total row is its own distinct-lot count, not a sum of the rows above (a lot can appear under more than one status/approval combination).
      </div>
    </div>
  );
}
