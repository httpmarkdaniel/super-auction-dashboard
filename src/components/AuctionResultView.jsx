import { useEffect, useRef, useState } from "react";
import { useAuctionResult, useAuctionResultFilters, fetchAuctionResultExportData } from "../useAuctionResult";
import { formatPeso, formatCompactPeso } from "../utils/format";
import { manilaYesterdayISODate } from "../utils/manilaTime";
import { exportAuctionResultExcel, exportAuctionResultPdf } from "../utils/auctionResultExport";

function dash(value) {
  return value && String(value).trim() ? value : "—";
}

// end_date is a UTC-typed ClickHouse column (see api/overview.js's own
// comment) — the raw string's first 10 characters already ARE the exact
// calendar day used for grouping/filtering, so display needs no timezone
// math, just truncation.
function endDateOnly(value) {
  return value ? String(value).slice(0, 10) : "—";
}

// Default From=To=Yesterday PHT — reproduces the exact original single-
// day report on first load (see api/overview.js's buildAuctionResultFilter
// comment: From=To is mathematically identical to the old single End
// Date). Recomputed fresh on every mount/Reset, never frozen at import
// time.
function defaultFilters() {
  const yesterday = manilaYesterdayISODate();
  return {
    from: yesterday,
    to: yesterday,
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

// From/To (executive cleanup task) — replaces the single End Date input.
// Both bound to the same v.end_date column server-side; `to` is inclusive
// at the calendar-day level (see api/overview.js's buildAuctionResultFilter).
function FromToFilter({ from, to, onFromChange, onToChange }) {
  return (
    <>
      <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">From</span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className="text-[14px] font-medium text-ink bg-transparent outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">To</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className="text-[14px] font-medium text-ink bg-transparent outline-none"
        />
      </div>
    </>
  );
}

// Compact "Export ▼" control — Excel (primary/default, listed first) and
// PDF. Sheets 1-2 (Auction Result Summary/Top Info) come from the
// already-loaded on-screen data; both handlers additionally fetch the
// detailed export dataset ON CLICK ONLY (never on page load or filter
// change — see useAuctionResult.js's fetchAuctionResultExportData) for
// Sheet 3 / the Detailed Auction Result PDF section. One request per
// click, disabled + "Exporting…" while in flight, inline error on failure.
// Placed beside the Sales Summary heading (executive cleanup task) —
// previously sat in the filter bar, a much less noticeable position.
function ExportMenu({ onExportExcel, onExportPdf }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  async function run(fn) {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-navy text-white border border-navy rounded-lg px-3.5 h-9 text-[14.5px] font-semibold shrink-0 disabled:opacity-60 shadow-card"
      >
        {busy ? "Exporting…" : "Export"}
        {!busy && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {error && <div className="absolute right-0 top-full mt-1 text-[12.5px] text-toneRedText whitespace-nowrap">{error}</div>}

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 floating py-1.5 z-30">
          <button type="button" onClick={() => run(onExportExcel)} className="w-full text-left px-3.5 py-1.5 text-[14.5px] text-ink hover:bg-gridline/50">
            Export Excel
          </button>
          <button type="button" onClick={() => run(onExportPdf)} className="w-full text-left px-3.5 py-1.5 text-[14.5px] text-ink hover:bg-gridline/50">
            Export PDF
          </button>
        </div>
      )}
    </div>
  );
}

// VENDOR SUMMARY (new) — a distinct, hardcoded Paid/Released-only
// financial rollup by calendar year, ALWAYS scoped this way regardless of
// the Status filter above it (see api/overview.js's vendorSummaryWhere
// comment) — labeled explicitly so it's never mistaken for Sales
// Summary's own Status-sensitive population.
function VendorSummaryTable({ rows, totals }) {
  return (
    <div className="mb-8">
      <h3 className="text-[13px] uppercase tracking-wide text-muted font-semibold mb-1">Vendor Summary</h3>
      <div className="text-[12px] text-muted mb-2">Paid + Released lots only — always, regardless of the Status filter above (which affects Sales Summary/Top Info only).</div>
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

// AUCTION RESULT — operational report keyed on a From/To Manila-anchored
// date range (defaulting to Yesterday-Yesterday, reproducing the exact
// original single-day report), reproducing the Superset "Auction Result"
// report (xv3.mart_auction_vendor_analysis grouped by Payment Status/For
// Approval Status — "Sales Summary") plus a Vendor Summary (Paid/
// Released-only, by year) and Top Info, all sharing one Branch/Vendor/
// Auction Number/Status/BDM filter set. Deliberately independent of the
// dashboard's global Store/Category/WTD-MTD-YTD-Custom controls — see
// App.jsx's hideFilters wiring on Topbar. One request per filter change
// via useAuctionResult.js; filter option lists load once via
// useAuctionResultFilters.js. Still no drilldowns/charts — Export (Excel/
// PDF) and the Top Info vendor-click-to-filter interaction are the two
// exceptions, and neither adds a new HTTP request of its own (vendor-
// click just sets the existing `vendor` filter, refetching the SAME one
// endpoint exactly like any other filter change would).
//
// The Sales Summary Total row comes from the API's own separate, non-
// grouped `totals` query over the SAME filtered population — never a sum
// of this page's grouped rows, since a lot_number can appear in more than
// one Payment/Approval status combination (verified against real data;
// see api/overview.js's own comment on this handler). Vendor Summary's
// own Total row follows the identical discipline with its own separate
// query.
export default function AuctionResultView({ refreshNonce }) {
  const [filters, setFilters] = useState(defaultFilters);
  const { filters: filterOptions, loading: filtersLoading } = useAuctionResultFilters();
  const { data, loading, error } = useAuctionResult(filters, refreshNonce);

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const resetFilters = () => setFilters(defaultFilters());

  const rows = data?.rows || [];
  const totals = data?.totals || { count_of_lot: 0, reserved_price: 0, bid_amount: 0 };
  const topInfo = data?.top_info || [];
  const vendorSummaryRows = data?.vendor_summary || [];
  const vendorSummaryTotals = data?.vendor_summary_totals || { total_bid_amount: 0, buyers_premium: 0, service_fee: 0, service_income: 0 };

  const branches = filterOptions?.branches || [];
  const vendors = filterOptions?.vendors || [];
  const statuses = filterOptions?.statuses || [];
  const bdms = filterOptions?.bdms || [];

  const activeFilterCount = ["branch", "vendor", "auctionNumber", "status", "bdm"].filter((k) => filters[k]).length;
  const isCustomRange = filters.from !== filters.to;

  // Human-readable labels for the export filter-context section — the
  // exact currently-active selections, "All X" when a filter is unset.
  const filterLabels = {
    branch: filters.branch || "All Branches",
    vendor: filters.vendor || "All Vendors",
    auctionNumber: filters.auctionNumber || "All Auctions",
    status: filters.status || "All Statuses",
    bdm: filters.bdm || "All BDMs",
  };

  // Detailed dataset is deliberately NOT part of `data`/useAuctionResult —
  // it's fetched fresh, on demand, only inside these two handlers (see
  // fetchAuctionResultExportData's own comment), using the filters active
  // AT CLICK TIME, so there is never stale data from a previous filter
  // selection carried into an export.
  async function handleExportExcel() {
    const detailed = await fetchAuctionResultExportData(filters);
    exportAuctionResultExcel({ filters, filterLabels, totals, rows, topInfo, detailed });
  }
  async function handleExportPdf() {
    const detailed = await fetchAuctionResultExportData(filters);
    exportAuctionResultPdf({ filters, filterLabels, totals, rows, topInfo, detailed });
  }

  // TOP INFO VENDOR CLICK (executive cleanup task) — selecting a distinct
  // vendor here is EXACTLY equivalent to picking that vendor in the
  // Vendor filter dropdown above: it sets the SAME `filters.vendor` state,
  // so Sales Summary/Top Info/Vendor Summary/Export all immediately
  // reflect it while Branch/Auction Number/From/To/Status/BDM stay
  // exactly as they were — no separate "selected vendor" state, no new
  // request beyond the normal single refetch any filter change already
  // causes. Deterministic regardless of which specific Top Info ROW
  // (which may differ by Account Executive/Branch/Auction Number for the
  // same vendor) was clicked — it always selects the vendor as a whole.
  function selectVendorFromTopInfo(vendorName) {
    if (!vendorName) return;
    setFilter("vendor")(vendorName);
  }

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Auction Result: {error}</div>;
  }

  return (
    <div className={loading && !data ? "opacity-50" : ""}>
      <p className="text-[15.5px] text-muted mb-4">Lot payment and approval status summary for the selected date range.</p>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <FilterSelect label="Branch" value={filters.branch} onChange={setFilter("branch")} options={branches} allLabel="All Branches" disabled={filtersLoading} />
        <FilterSelect label="Vendor" value={filters.vendor} onChange={setFilter("vendor")} options={vendors} allLabel="All Vendors" disabled={filtersLoading} />
        <AuctionNumberFilter value={filters.auctionNumber} onChange={setFilter("auctionNumber")} />
        <FromToFilter from={filters.from} to={filters.to} onFromChange={setFilter("from")} onToChange={setFilter("to")} />
        <FilterSelect label="Status" value={filters.status} onChange={setFilter("status")} options={statuses} allLabel="All Statuses" disabled={filtersLoading} />
        <FilterSelect label="BDM" value={filters.bdm} onChange={setFilter("bdm")} options={bdms} allLabel="All BDMs" disabled={filtersLoading} />
        {(activeFilterCount > 0 || isCustomRange) && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-[13.5px] font-semibold text-navy hover:underline shrink-0 px-1"
          >
            Reset Filters
          </button>
        )}
      </div>

      <VendorSummaryTable rows={vendorSummaryRows} totals={vendorSummaryTotals} />

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

      <h3 className="text-[13px] uppercase tracking-wide text-muted font-semibold mb-2">Top Info</h3>
      <div className="overflow-x-auto bg-surface1 border border-gridline rounded-lg shadow-card mb-8 max-h-[420px] overflow-y-auto">
        <table className="w-full text-[14px] min-w-[760px]">
          <thead>
            <tr className="text-white text-[12px] uppercase tracking-wide bg-navy sticky top-0 z-10">
              <th className="text-left font-medium py-2 px-3">Vendor</th>
              <th className="text-left font-medium py-2 px-3">Account Executive</th>
              <th className="text-left font-medium py-2 px-3">Branch</th>
              <th className="text-left font-medium py-2 px-3">Auction Number</th>
              <th className="text-left font-medium py-2 px-3">End Date</th>
            </tr>
          </thead>
          <tbody>
            {topInfo.map((row, i) => (
              <tr key={`${row.vendor}-${row.auction_number}-${i}`} className="border-t border-gridline hover:bg-plane">
                <td
                  className={`py-2 px-3 max-w-[260px] break-words ${row.vendor ? "cursor-pointer" : ""}`}
                  title={row.vendor || undefined}
                  onClick={() => selectVendorFromTopInfo(row.vendor)}
                >
                  <span className="text-ink font-medium">{dash(row.vendor)}</span>
                  {row.vendor && <span className="block text-[11px] text-series1 font-medium">Click to filter Sales Summary</span>}
                </td>
                <td className="py-2 px-3 text-ink max-w-[200px] break-words" title={row.account_executive || undefined}>
                  {dash(row.account_executive)}
                </td>
                <td className="py-2 px-3 text-ink max-w-[200px] break-words" title={row.branch || undefined}>
                  {dash(row.branch)}
                </td>
                <td className="py-2 px-3 text-ink tabular">{dash(row.auction_number)}</td>
                <td className="py-2 px-3 text-ink tabular">{endDateOnly(row.end_date)}</td>
              </tr>
            ))}
            {topInfo.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted text-[14px]">
                  No auctions for {filters.from} – {filters.to} with the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h3 className="text-[13px] uppercase tracking-wide text-muted font-semibold">Sales Summary</h3>
        <ExportMenu onExportExcel={handleExportExcel} onExportPdf={handleExportPdf} />
      </div>

      {filters.vendor && (
        <div className="flex items-center gap-3 mb-2 text-[13.5px]">
          <span className="text-ink">
            Vendor: <span className="font-semibold">{filters.vendor}</span>
          </span>
          <button type="button" onClick={() => setFilter("vendor")("")} className="text-navy font-semibold hover:underline">
            Clear Vendor Selection
          </button>
        </div>
      )}

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
                  No auction result activity for {filters.from} – {filters.to} with the selected filters.
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
        Reflects every lot/status/approval combination for the selected date range and filters — not limited to Paid/Released lots. The Total row is its own distinct-lot count, not a sum of the rows above (a lot can appear under more than one status/approval combination).
      </div>
    </div>
  );
}
