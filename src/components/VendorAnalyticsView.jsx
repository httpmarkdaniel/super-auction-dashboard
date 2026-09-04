import { useState } from "react";
import { useVendorAnalytics } from "../useVendorAnalytics";
import StorySection from "./primitives/StorySection";
import RankedMetricBar from "./primitives/RankedMetricBar";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import { formatPeso, formatCompactPeso } from "../utils/format";

// Compact hover profile for a Top 10 Vendor row (PART REORG task) — zero
// network requests, every field already present on the enriched
// vendor_analytics.all_lots row (see api/leaderboards.js's vendorAllLotsQuery
// comment). "Date Registered" has no genuine source field on any vendor
// mart this dashboard queries — only `first_seen` (min date_created, an
// activity proxy) exists, so it's labeled "First Seen" rather than
// misrepresented as a real registration date. Account Executive comes
// straight off xv3.mart_auction_vendor_analysis.account_executive, keyed
// by the exact `vendor` this row is already grouped by (see
// vendorAccountExecutiveResult) — never inferred/derived. A vendor with
// more than one distinct AE on file shows "(N assigned)" rather than
// silently picking one.
function VendorHoverCard({ v }) {
  const sellThroughPct = v.lots_listed > 0 ? (v.lots_sold / v.lots_listed) * 100 : null;
  const branchNames = v.branch_names || [];
  const allAEs = v.all_account_executives || [];
  return (
    <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg text-left min-w-[300px] max-h-[70vh] overflow-y-auto">
      <div className="font-semibold text-[14px] mb-2 uppercase tracking-wide break-words">{v.vendor}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5 pb-2.5 border-b border-gridline">
        <div>
          <div className="text-muted text-[12px]">First Seen</div>
          <div className="tabular font-medium">{v.first_seen ? String(v.first_seen).slice(0, 10) : "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Assigned Account Executive</div>
          <div className="tabular font-medium">
            {v.account_executive || "Not Available"}
            {allAEs.length > 1 && <span className="text-muted font-normal"> ({allAEs.length} assigned)</span>}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-muted text-[12px]">Branches Supplied <span className="font-normal">(this period)</span></div>
          <div className="tabular font-medium">
            {branchNames.length > 0 ? branchNames.slice(0, 4).join(" · ") : "—"}
            {branchNames.length > 4 && <span className="text-muted"> +{branchNames.length - 4} more</span>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <div className="text-muted text-[12px]">Lots Listed</div>
          <div className="tabular font-medium">{v.lots_listed}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Lots Sold</div>
          <div className="tabular font-medium">{v.lots_sold}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Sell-Through</div>
          <div className="tabular font-medium">{sellThroughPct != null ? `${sellThroughPct.toFixed(1)}%` : "—"}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Sold Bid Value</div>
          <div className="tabular font-medium">{formatPeso(v.settled_bid_amount)}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Buyer's Premium</div>
          <div className="tabular font-medium">{formatPeso(v.buyers_premium_income || 0)}</div>
        </div>
        <div>
          <div className="text-muted text-[12px]">Service Fee</div>
          <div className="tabular font-medium">{formatPeso(v.commission_income || 0)}</div>
        </div>
        <div className="col-span-2">
          <div className="text-muted text-[12px]">Service Income</div>
          <div className="tabular font-medium text-series1">{formatPeso((v.buyers_premium_income || 0) + (v.commission_income || 0))}</div>
        </div>
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
        insight="Hover a vendor for their profile. Switch ranking mode to see the same 10-row limit ranked a different way."
        last
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
              {topVendors.map((v, i) => {
                const sellThroughPct = v.lots_listed > 0 ? (v.lots_sold / v.lots_listed) * 100 : null;
                const serviceIncome = (v.buyers_premium_income || 0) + (v.commission_income || 0);
                return (
                  <tr key={v.vendor} className="border-t border-gridline hover:bg-plane/60 transition-colors">
                    <td className="relative py-2 px-3 text-ink group/tip max-w-[220px]">
                      <span className="block truncate" title={v.vendor}>{v.vendor}</span>
                      <div className={`pointer-events-none absolute left-0 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60] ${i >= topVendors.length - 3 ? "bottom-full mb-1" : "top-full mt-1"}`}>
                        <VendorHoverCard v={v} />
                      </div>
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
    </div>
  );
}
