import { useState } from "react";
import { useVendorAnalytics } from "../useVendorAnalytics";
import { useVendorTop5Year } from "../useVendorTop5Year";
import { useVendorFinancialSummary } from "../useVendorFinancialSummary";
import { useAuctionResultFilters } from "../useAuctionResult";
import StorySection from "./primitives/StorySection";
import RankedMetricBar from "./primitives/RankedMetricBar";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import VendorDetailModal from "./primitives/VendorDetailModal";
import { FilterSelect, AuctionNumberFilter, FromToFilter } from "./primitives/AuctionFilterControls";
import { formatPeso, formatCompactPeso } from "../utils/format";
import { manilaYesterdayISODate, manilaFirstDayOfCurrentMonthISODate } from "../utils/manilaTime";

// VENDOR SUMMARY (moved here from Auction Result — see api/leaderboards.js's
// type=vendor-financial-summary comment) — a distinct, hardcoded Paid/
// Released-only financial rollup by calendar year, with its OWN
// independent Branch/Vendor/Auction Number/From/To/BDM filter set,
// completely separate from the main Vendor Analytics Store/Category/
// date-range controls above/below it (own hook, own fetch, own state —
// changing one never refetches the other). Status is deliberately NOT a
// user-facing filter here — the population is always Paid+Released.
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

function VendorSummarySection({ refreshNonce }) {
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
      <div className="text-[12px] text-muted mb-2">Settled results only — Paid &amp; Released.</div>
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

// TOP VENDORS — 5-YEAR BID VALUE (executive cleanup task) — one row per
// distinct vendor, one column per calendar year (2022-2026 as of 2026,
// see api/leaderboards.js's type=vendor-top-5-year for the exact rolling-
// window rule), Total DESC. Sticky Vendor column + header, horizontal
// scroll for the year columns — capped at 100 rows server-side (never
// unbounded).
function VendorTop5YearTable() {
  const { data, loading, error } = useVendorTop5Year();

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load 5-Year Top Vendors: {error}</div>;
  }
  if (!data) {
    return <div className="text-center text-ink text-[15.5px] py-8">Loading 5-Year Top Vendors…</div>;
  }

  const years = [];
  for (let y = data.startYear; y <= data.endYear; y++) years.push(y);
  const rows = data.rows || [];

  return (
    <div className={loading ? "opacity-60" : ""}>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto border border-gridline rounded-lg">
        <table className="w-full text-[14px] min-w-[720px]">
          <thead>
            <tr className="text-white text-[12px] uppercase tracking-wide bg-navy sticky top-0 z-20">
              <th className="text-left font-medium py-2 px-3 sticky left-0 bg-navy z-30">Vendor</th>
              {years.map((y) => (
                <th key={y} className="text-right font-medium py-2 px-3">{y}</th>
              ))}
              <th className="text-right font-medium py-2 px-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vendor} className="border-t border-gridline hover:bg-plane">
                <td className="py-2 px-3 text-ink font-medium sticky left-0 bg-surface1 max-w-[240px] truncate" title={r.vendor}>{r.vendor}</td>
                {years.map((y) => (
                  <td key={y} className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(r.years[y] || 0)}</td>
                ))}
                <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatCompactPeso(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={years.length + 2} className="py-6 text-center text-muted text-[14px]">No vendor activity in this 5-year window.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11.5px] text-muted mt-2">
        Settled Bid Value (status Paid/Released, same definition as the rest of Vendor Analytics), grouped by the calendar year each auction ended, top {rows.length} of all active vendors by 5-year total — not filtered by the Store/Category/date controls above.
      </div>
    </div>
  );
}

// VENDOR ANALYTICS — fully dynamic to the selected Date/Store/Category
// filters (see useVendorAnalytics.js). All figures below derive from the
// SAME bounded all-lots-per-vendor aggregate (api/leaderboards.js's
// vendor_analytics field) — no per-vendor request.
export default function VendorAnalyticsView({ dateRange, store, category, rangeLabel, refreshNonce }) {
  const { data, loading, error } = useVendorAnalytics(dateRange, store, category, refreshNonce);
  const [vendorRankMode, setVendorRankMode] = useState("value");
  // Click-to-view-details (executive cleanup task) — replaces the old
  // hover-only card. No new fetch — holds the already-loaded allLots row.
  const [selectedVendor, setSelectedVendor] = useState(null);

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Vendor Analytics: {error}</div>;
  }
  if (!data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading Vendor Analytics…</div>;
  }

  const { leaderboards, vendorAnalytics } = data;
  const va = leaderboards.vendor_analytics || {};
  const allLots = va.all_lots || [];

  const top10ByBidAmount = [...allLots].sort((a, b) => b.settled_bid_amount - a.settled_bid_amount).slice(0, 10);
  const top5 = top10ByBidAmount.slice(0, 5);

  // TOP 10 VENDORS — two ranking modes (PART REORG task), both derived
  // client-side from the SAME already-loaded, now-enriched allLots array
  // (buyers_premium_income/commission_income were added to
  // vendorAllLotsQuery specifically so Service Income is available
  // regardless of which 10 vendors end up in view) — zero new requests.
  const topVendorsByValue = [...allLots].sort((a, b) => b.settled_bid_amount - a.settled_bid_amount).slice(0, 10);
  const topVendorsByLotsSold = [...allLots].sort((a, b) => b.lots_sold - a.lots_sold).slice(0, 10);
  const topVendors = vendorRankMode === "value" ? topVendorsByValue : topVendorsByLotsSold;

  return (
    <div>
      {loading && (
        <div className="mb-4 text-[13px] text-muted">Updating Vendor Analytics…</div>
      )}

      <StorySection title="Vendor Summary" insight="Paid + Released financial rollup by year — its own Branch/Vendor/Auction Number/From/To/BDM filters, independent of the controls below.">
        <VendorSummarySection refreshNonce={refreshNonce} />
      </StorySection>

      <StorySection
        title="Vendor Analytics"
        insight={`Vendor consignment activity for auctions ending in the selected period (${rangeLabel}).`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr] gap-4">
          <div className="relative text-left bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3 pb-3.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">Top-5 Vendor Concentration</div>
            <div className="font-display text-[40px] leading-none text-ink mb-2">
              {va.top5_vendor_concentration_pct != null ? `${va.top5_vendor_concentration_pct.toFixed(1)}%` : "—"}
            </div>
            <div className="text-[13px] text-ink">
              {formatPeso(va.top5_vendor_bid_amount || 0)} of {formatPeso(va.total_vendor_bid_amount || 0)}
            </div>
            <div className="mt-3 pt-2.5 border-t border-gridline text-[12.5px] text-muted">
              Top 5 of {va.active_vendors ?? 0} active vendors
            </div>
          </div>
          <div className="bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3 pb-3.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">Active Vendors</div>
            <div className="font-display text-[36.5px] leading-none text-ink">{va.active_vendors ?? 0}</div>
            <div className="text-[12.5px] text-muted mt-2">Distinct vendors with lot activity, {rangeLabel}</div>
          </div>
          <div className="bg-surface1 border border-gridline rounded-lg shadow-card border-t-[3px] border-t-series8 px-4 pt-3 pb-3.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">New Vendors</div>
            <div className="font-display text-[36.5px] leading-none text-ink">{va.new_vendors ?? 0}</div>
            <div className="text-[12.5px] text-muted mt-2">First recorded consignment in this period</div>
          </div>
        </div>
      </StorySection>

      <StorySection title="Active & New Vendors by Period" insight={`Bucketed by ${vendorAnalytics.bucket_label}.`}>
        <PeriodStackedBar rows={vendorAnalytics.by_period} bucketLabel={vendorAnalytics.bucket_label} />
      </StorySection>

      <StorySection
        title="Top-5 Vendor Concentration"
        insight={
          va.active_vendors
            ? `These 5 vendors account for ${va.top5_vendor_concentration_pct != null ? va.top5_vendor_concentration_pct.toFixed(1) : "—"}% of ${rangeLabel} Bid Amount across ${va.active_vendors} active vendors.`
            : undefined
        }
      >
        <RankedMetricBar
          rows={top5}
          labelKey="vendor"
          valueKey="settled_bid_amount"
          formatValue={(r) => formatCompactPeso(r.settled_bid_amount)}
          subLabel={(r) => `${((r.settled_bid_amount / (va.total_vendor_bid_amount || 1)) * 100).toFixed(1)}% share`}
          emptyMessage="No settled vendor activity in this scope."
        />
      </StorySection>

      <StorySection
        title={`Top 10 Vendors — ${rangeLabel}`}
        insight="Click a vendor row for their full profile. Switch ranking mode to see the same 10-row limit ranked a different way."
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setVendorRankMode("value")}
            className={`text-[13.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${vendorRankMode === "value" ? "bg-navy text-white border-navy" : "bg-surface1 text-ink border-gridline hover:border-navy/40"}`}
          >
            By Sold Bid Value
          </button>
          <button
            type="button"
            onClick={() => setVendorRankMode("lots")}
            className={`text-[13.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${vendorRankMode === "lots" ? "bg-navy text-white border-navy" : "bg-surface1 text-ink border-gridline hover:border-navy/40"}`}
          >
            By Lots Sold
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[14.5px]">
            <thead>
              {vendorRankMode === "value" ? (
                <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                  <th className="text-left font-medium py-2 px-3">Vendor</th>
                  <th className="text-right font-medium py-2 px-3">Bid Value</th>
                  <th className="text-right font-medium py-2 px-3">Lots Listed</th>
                  <th className="text-right font-medium py-2 px-3">Lots Sold</th>
                  <th className="text-right font-medium py-2 px-3">Sell-Through</th>
                  <th className="text-right font-medium py-2 px-3">Service Income</th>
                  <th className="text-right font-medium py-2 px-3">Branches</th>
                </tr>
              ) : (
                <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                  <th className="text-left font-medium py-2 px-3">Vendor</th>
                  <th className="text-right font-medium py-2 px-3">Lots Sold</th>
                  <th className="text-right font-medium py-2 px-3">Lots Listed</th>
                  <th className="text-right font-medium py-2 px-3">Sell-Through</th>
                  <th className="text-right font-medium py-2 px-3">Bid Value</th>
                  <th className="text-right font-medium py-2 px-3">Service Income</th>
                  <th className="text-right font-medium py-2 px-3">Branches</th>
                </tr>
              )}
            </thead>
            <tbody>
              {topVendors.map((v) => {
                const sellThroughPct = v.lots_listed > 0 ? (v.lots_sold / v.lots_listed) * 100 : null;
                const serviceIncome = (v.buyers_premium_income || 0) + (v.commission_income || 0);
                return (
                  <tr
                    key={v.vendor}
                    onClick={() => setSelectedVendor(v)}
                    className="border-t border-gridline hover:bg-plane/60 transition-colors cursor-pointer"
                  >
                    <td className="py-2 px-3 text-ink max-w-[220px]">
                      <span className="block truncate" title={v.vendor}>{v.vendor}</span>
                      <span className="text-[11px] text-series1 font-medium">Click to view details</span>
                    </td>
                    {vendorRankMode === "value" ? (
                      <>
                        <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(v.settled_bid_amount)}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{v.lots_listed}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{v.lots_sold}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{sellThroughPct != null ? `${sellThroughPct.toFixed(1)}%` : "—"}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(serviceIncome)}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{v.branches}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{v.lots_sold}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{v.lots_listed}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{sellThroughPct != null ? `${sellThroughPct.toFixed(1)}%` : "—"}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{formatPeso(v.settled_bid_amount)}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{formatCompactPeso(serviceIncome)}</td>
                        <td className="py-2 px-3 text-right tabular text-ink">{v.branches}</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {topVendors.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted text-[14.5px]">
                    No settled vendor activity in this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </StorySection>

      <StorySection title="Top Vendors — 5-Year Bid Value" insight="Standing reference table, independent of the Store/Category/date filters above." last>
        <VendorTop5YearTable />
      </StorySection>

      <VendorDetailModal vendor={selectedVendor} onClose={() => setSelectedVendor(null)} />
    </div>
  );
}
