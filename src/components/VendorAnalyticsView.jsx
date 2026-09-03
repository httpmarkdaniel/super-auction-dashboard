import { useVendorAnalytics } from "../useVendorAnalytics";
import StorySection from "./primitives/StorySection";
import RankedMetricBar from "./primitives/RankedMetricBar";
import PeriodStackedBar from "./primitives/PeriodStackedBar";
import { formatPeso, formatCompactPeso } from "../utils/format";

const STUCK_INVENTORY_MIN_LOTS = 20;

// VENDOR ANALYTICS — fully dynamic to the selected Date/Store/Category
// filters (see useVendorAnalytics.js). All figures below derive from the
// SAME bounded all-lots-per-vendor aggregate (api/leaderboards.js's
// vendor_analytics field) — no per-vendor request.
export default function VendorAnalyticsView({ dateRange, store, category, rangeLabel, refreshNonce }) {
  const { data, loading, error } = useVendorAnalytics(dateRange, store, category, refreshNonce);

  if (error) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Vendor Analytics: {error}</div>;
  }
  if (loading || !data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading Vendor Analytics…</div>;
  }

  const { leaderboards, vendorAnalytics } = data;
  const va = leaderboards.vendor_analytics || {};
  const allLots = va.all_lots || [];

  const top10ByBidAmount = [...allLots].sort((a, b) => b.settled_bid_amount - a.settled_bid_amount).slice(0, 10);
  const top5 = top10ByBidAmount.slice(0, 5);

  // Stuck Inventory — meaningful inventory volume only (>= 20 lots
  // listed), lowest sell-through first, so a vendor with 1-2 lots and a
  // 0% sell-through doesn't dominate the ranking.
  const stuckInventory = allLots
    .filter((v) => v.lots_listed >= STUCK_INVENTORY_MIN_LOTS)
    .map((v) => ({ ...v, sellThroughPct: v.lots_listed > 0 ? (v.lots_sold / v.lots_listed) * 100 : 0 }))
    .sort((a, b) => a.sellThroughPct - b.sellThroughPct)
    .slice(0, 10);

  return (
    <div>
      <StorySection
        title="Vendor Analytics"
        insight={`Vendor consignment activity for auctions ending in the selected period (${rangeLabel}).`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr] gap-4">
          <div className="relative text-left bg-surface1 border border-gridline rounded-md px-4 pt-3.5 pb-4 border-t-[3px] border-t-series8">
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
          <div className="bg-surface1 border border-gridline rounded-md px-4 pt-3.5 pb-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">Active Vendors</div>
            <div className="font-display text-[30px] leading-none text-ink">{va.active_vendors ?? 0}</div>
            <div className="text-[12.5px] text-muted mt-2">Distinct vendors with lot activity, {rangeLabel}</div>
          </div>
          <div className="bg-surface1 border border-gridline rounded-md px-4 pt-3.5 pb-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-2">New Vendors</div>
            <div className="font-display text-[30px] leading-none text-ink">{va.new_vendors ?? 0}</div>
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

      <StorySection title="Stuck Inventory — Lowest Sell-Through" insight={`Vendors with ${STUCK_INVENTORY_MIN_LOTS}+ lots listed, worst sell-through first.`}>
        <RankedMetricBar
          rows={stuckInventory.map((v) => ({ ...v, sellThroughPctRounded: Number(v.sellThroughPct.toFixed(1)) }))}
          labelKey="vendor"
          valueKey="sellThroughPctRounded"
          max={100}
          formatValue={(r) => `${r.sellThroughPctRounded}%`}
          subLabel={(r) => `${r.lots_sold} / ${r.lots_listed} lots`}
          emptyMessage={`No vendor with ${STUCK_INVENTORY_MIN_LOTS}+ lots listed in this scope.`}
        />
      </StorySection>

      <StorySection title={`Top 10 Vendors — ${rangeLabel}, by Bid Amount`} last>
        <div className="overflow-x-auto">
          <table className="w-full text-[14.5px]">
            <thead>
              <tr className="text-white text-[12.5px] uppercase tracking-wide bg-navy">
                <th className="text-left font-medium py-2 px-3">Vendor</th>
                <th className="text-right font-medium py-2 px-3">Lots Listed</th>
                <th className="text-right font-medium py-2 px-3">Lots Sold</th>
                <th className="text-right font-medium py-2 px-3">Sell-Through</th>
                <th className="text-right font-medium py-2 px-3">Bid Amount</th>
                <th className="text-right font-medium py-2 px-3">Branches</th>
              </tr>
            </thead>
            <tbody>
              {top10ByBidAmount.map((v) => (
                <tr key={v.vendor} className="border-t border-gridline hover:bg-plane/60 transition-colors">
                  <td className="py-2 px-3 text-ink">{v.vendor}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{v.lots_listed}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{v.lots_sold}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{v.lots_listed > 0 ? `${((v.lots_sold / v.lots_listed) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="py-2 px-3 text-right tabular text-series1 font-semibold">{formatPeso(v.settled_bid_amount)}</td>
                  <td className="py-2 px-3 text-right tabular text-ink">{v.branches}</td>
                </tr>
              ))}
              {top10ByBidAmount.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted text-[14.5px]">
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
