import { useEffect, useRef, useState } from "react";
import { useVendorAnalytics } from "../useVendorAnalytics";
import { useVendorTop5Year } from "../useVendorTop5Year";
import { CATEGORY_NAMES } from "../../api/_category.js";
import { VEHICLE_SUBCATEGORY_NAMES } from "../../api/_category.js";
import StorySection from "./primitives/StorySection";
import RankedMetricBar from "./primitives/RankedMetricBar";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import VendorDetailModal from "./primitives/VendorDetailModal";
import { formatPeso, formatCompactPeso } from "../utils/format";
import { exportVendorTop5YearExcel } from "../utils/vendorTop5YearExport";

// Vendor Summary (the Paid/Released-only financial rollup by calendar
// year) has MOVED to its own dedicated sidebar tab — see
// src/components/VendorSummaryView.jsx and api/leaderboards.js's
// type=vendor-financial-summary comment. Not duplicated here.

// Bid Value on this table, per explicit request: absolute value (a
// settled bid amount is never genuinely negative in this data, but this
// guarantees no stray "-" ever renders) with exactly 2 decimal places, NO
// currency symbol (removed per explicit follow-up request) — distinct
// from the shared formatPeso (0 decimals, no abs, has ₱) and
// formatCompactPeso (1 decimal, compact notation, has ₱) used elsewhere
// in this file, which stay untouched.
function formatAbs2dp(n) {
  if (n === null || n === undefined) return "—";
  return Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Category/subcategory multi-select — lets multiple categories AND
// Vehicles-and-Automotive subcategories (Motorcycles/Cars — Trucks is now
// its own top-level category, see api/_category.js's 2026-09-22 rewrite,
// so it's selectable directly from CATEGORY_NAMES instead of appearing
// here) be combined freely in one filter (e.g. Trucks + Equipment and
// Industrial + General Merchandise), per explicit request. Checking
// "Vehicles and Automotive" itself means all NON-truck road vehicles,
// independent of which (if any) subcategory boxes are also checked —
// the two aren't mutually exclusive, just redundant if both are on.
function CategoryMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle(value) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const summary = selected.length === 0 ? "All Categories" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 text-[14px] font-semibold text-ink cursor-pointer max-w-[220px]"
      >
        <span className="truncate">{summary}</span>
        <span className="text-muted text-[10px] shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 top-9 left-0 w-64 rounded-lg border border-gridline bg-surface1 shadow-lg py-1.5 max-h-[340px] overflow-y-auto">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1 text-[12px] font-semibold text-series1 hover:bg-plane"
            >
              Clear all
            </button>
          )}
          {CATEGORY_NAMES.map((c) => (
            <div key={c}>
              <label className="flex items-center gap-2 px-3 py-1.5 text-[13.5px] text-ink cursor-pointer hover:bg-plane">
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} className="cursor-pointer" />
                {c}
              </label>
              {c === "Vehicles and Automotive" &&
                VEHICLE_SUBCATEGORY_NAMES.map((sub) => (
                  <label key={sub} className="flex items-center gap-2 pl-8 pr-3 py-1 text-[13px] text-ink2 cursor-pointer hover:bg-plane">
                    <input type="checkbox" checked={selected.includes(sub)} onChange={() => toggle(sub)} className="cursor-pointer" />
                    {sub}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// TOP VENDORS — 5-YEAR BID VALUE — one row per distinct vendor, one
// column per calendar year (2022-2026 as of 2026, see
// api/leaderboards.js's type=vendor-top-5-year for the exact rolling-
// window rule), Total DESC. Sticky Vendor column + header, horizontal
// scroll for the year columns. Per explicit request: no longer capped at
// 100 rows (the table scrolls instead), Account Executive column added
// (Phone/Email were also added, then removed per a follow-up request —
// the backend still returns them, just unused here), Bid Value shown as
// absolute-value-2dp with no currency symbol, an Excel export button, and
// its own multi-select Category filter (General Merchandise/Vehicles and
// Automotive [+ its own Motorcycles/Cars subcategories, added 2026-09-22]/
// Trucks/Equipment and Industrial/Bulk Auction — Trucks split into its
// own top-level category 2026-09-22, see api/_category.js) — any
// combination can be checked at once (e.g. Trucks + Equipment and
// Industrial), per explicit request. Kept as LOCAL state here,
// deliberately NOT the page-wide category filter used by Overview/Bidder
// Analytics/the rest of this tab, since this table is explicitly a
// standing reference view independent of the dashboard's other filters;
// sharing that state would silently change Overview's category too. The
// Motorcycles/Cars subcategories are a separate classification
// (api/_category.js's VEHICLE_SUBCATEGORY_CLASSIFICATION_SQL), only
// meaningful within lots already classified as "Vehicles and Automotive"
// by the shared top-level classification.
function VendorTop5YearTable() {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const { data, loading, error } = useVendorTop5Year(categories);

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load 5-Year Top Vendors: {error}</div>;
  }
  if (!data) {
    return <div className="text-center text-ink text-[15.5px] py-8">Loading 5-Year Top Vendors…</div>;
  }

  const years = [];
  for (let y = data.startYear; y <= data.endYear; y++) years.push(y);
  const allRows = data.rows || [];
  // Client-side, case-insensitive substring match on vendor name — every
  // row is already loaded (no server cap), so no extra request needed.
  const searchTerm = search.trim().toLowerCase();
  const rows = searchTerm ? allRows.filter((r) => r.vendor?.toLowerCase().includes(searchTerm)) : allRows;

  return (
    <div className={loading ? "opacity-60" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] tracking-[0.06em] uppercase text-muted font-semibold mr-1">Category</span>
          <CategoryMultiSelect selected={categories} onChange={setCategories} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor…"
            className="bg-surface1 border border-gridline rounded-lg px-3 h-8 text-[14px] text-ink outline-none focus:border-navy/40 w-[200px]"
          />
        </div>
        <button
          type="button"
          onClick={() => exportVendorTop5YearExcel({ years, categories, rows })}
          className="text-[13.5px] font-semibold px-3 py-1.5 rounded-lg border border-gridline bg-surface1 text-ink hover:border-navy/40 transition-colors"
        >
          Export to Excel
        </button>
      </div>

      <div className="overflow-x-auto max-h-[560px] overflow-y-auto border border-gridline rounded-lg">
        <table className="w-full text-[14px] min-w-[760px]">
          <thead>
            <tr className="text-white text-[12px] uppercase tracking-wide bg-navy sticky top-0 z-20">
              <th className="text-left font-medium py-2 px-3 sticky left-0 bg-navy z-30">Vendor</th>
              <th className="text-left font-medium py-2 px-3">Account Executive</th>
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
                <td className="py-2 px-3 text-ink max-w-[160px] truncate" title={r.account_executive || ""}>{r.account_executive || "—"}</td>
                {years.map((y) => (
                  <td key={y} className="py-2 px-3 text-right tabular text-ink">{formatAbs2dp(r.years[y] || 0)}</td>
                ))}
                <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatAbs2dp(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={years.length + 3} className="py-6 text-center text-muted text-[14px]">
                  {searchTerm ? `No vendor matching "${search}".` : "No vendor activity in this 5-year window."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11.5px] text-muted mt-2">
        Settled Bid Value (status Paid/Released, same definition as the rest of Vendor Analytics), grouped by the calendar year each auction ended, {rows.length} of {allRows.length} vendor(s) shown — not filtered by the Store/date controls above, only by the Category selector and Search here. Export reflects what's currently shown (search/category applied).
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

      <StorySection
        title="Vendor Analytics"
        insight={`Vendor consignment activity for auctions ending in the selected period (${rangeLabel}).`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr] gap-4">
          <div className="relative text-left bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
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
          <div className="bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">Active Vendors</div>
            <div className="font-display text-[36.5px] leading-none text-ink">{va.active_vendors ?? 0}</div>
            <div className="text-[12.5px] text-muted mt-2">Distinct vendors with lot activity, {rangeLabel}</div>
          </div>
          <div className="bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5">
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
