import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

function SortHeader({ label, sortKey, sort, onSort, align = "left" }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`font-medium pb-2 pr-4 cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-ink" : ""}`}>
        {label}
        {active && <span className="text-[12.5px]">{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="floating px-3.5 py-2.5 text-[15.5px]">
      <div className="text-ink mb-0.5">{label}</div>
      <div className="tabular text-series1">{formatPeso(payload[0].value)}</div>
    </div>
  );
}

// What HMR owes vendors, what's already moved, and what still needs
// action — deliberately NOT an auction-performance view, and deliberately
// with no aging anywhere (payment_status is the authoritative signal
// here, not how long a payable has existed).
//
// Business-confirmed status mapping: Paid/Remitted = Remitted + Released,
// Outstanding = On Process + Available (see api/payables.js).
//
// Category and per-auction breakdowns are intentionally absent: the
// warehouse data doesn't support splitting a payable's dollar amount
// across categories or auctions without fabricating numbers (see
// api/payables.js's header comment for the evidence). Full Detail is
// therefore shown per PAYABLE (the one grain that's actually safe to
// sum), with an honest "Multiple (N)" / "Unassigned" auction indicator
// rather than a fabricated split.
export default function VendorPayablesBreakdown({
  data,
  scopeLabel,
  detailQuery,
  onDetailQueryChange,
  detailSort,
  onDetailSortChange,
  detailPage,
  onDetailPageChange,
  detailPageSize,
}) {
  const palette = usePalette();
  const [showDetail, setShowDetail] = useState(false);

  // Local, immediately-responsive text box; the actual server request
  // (via onDetailQueryChange, owned by PayablesView) is debounced so
  // typing doesn't fire a request per keystroke — search now runs
  // server-side over the full payables set instead of an in-memory array
  // (Architecture Phase 2A: Full Detail used to ship every one of ~9,229
  // rows, ~3.25MB, on every load; it's paginated now, so client-side
  // search/sort over "the rows we happen to have in memory" no longer
  // means "search/sort over everything").
  const [queryInput, setQueryInput] = useState(detailQuery);
  useEffect(() => {
    setQueryInput(detailQuery);
  }, [detailQuery]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (queryInput !== detailQuery) onDetailQueryChange(queryInput);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  const totalPayables = Number(data.total_payables) || 0;
  const paidAmount = Number(data.paid_amount) || 0;
  const paymentRatePct = Number(data.payment_rate_pct) || 0;
  const pendingCount = Number(data.pending_count) || 0;
  const vendorsWithOutstanding = Number(data.vendors_with_outstanding) || 0;
  const paidStatuses = data.paid_statuses || [];

  const byStatus = (data.by_status || []).map((s) => ({
    status: s.payment_status,
    amount: Number(s.amount) || 0,
    count: Number(s.count) || 0,
  }));

  const outstandingByVendor = (data.outstanding_by_vendor || []).map((v) => ({
    vendor: v.vendor,
    amount: Number(v.amount) || 0,
    payable_count: Number(v.payable_count) || 0,
  }));

  const trend = (data.trend_by_month || []).map((t) => ({ month: t.month, amount: Number(t.amount) || 0 }));

  // Already the current page, already searched/sorted server-side (see
  // api/payables.js's DETAIL_SORTERS) — no client-side filtering/sorting
  // left to do here.
  const rows = (data.detail || []).map((d) => ({
    payableId: d.payable_id,
    vendor: d.vendor,
    storeName: d.store_name,
    auctionLabel:
      d.auction_count > 1 ? `Multiple (${d.auction_count})` : d.auction_number || "Unassigned",
    auctionName: d.auction_count === 1 ? d.auction_name : null,
    salesPeriod: d.sales_period,
    status: d.payment_status,
    bidAmount: Number(d.total_bid_amount) || 0,
    commission: Number(d.total_commission) || 0,
    amount: Number(d.total_payable_amount) || 0,
    generateDate: d.generate_date,
    remittedDate: d.remitted_date,
  }));

  const detailTotalCount = Number(data.detail_total_count) || 0;
  const pageCount = Math.max(1, Math.ceil(detailTotalCount / detailPageSize));
  const clampedPage = Math.min(detailPage, pageCount - 1);

  return (
    <>
      {/* SECONDARY KPIs — Outstanding Payables itself is the PRIMARY hero,
          shown above this component in PayablesView's StoryHeader. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatTile
          eyebrow="Paid / Remitted"
          value={formatPeso(paidAmount)}
          sub={paidStatuses.join(" + ")}
          methodology="Payables whose payment_status is Remitted or Released — the confirmed business rule for money already paid to the vendor."
        />
        <StatTile
          eyebrow="Total Payables"
          value={formatPeso(totalPayables)}
          methodology="Sum of total_payable_amount across every distinct payable (deduped from the item-level warehouse table, which fans out one row per item). Paid/Remitted + Outstanding."
        />
        <StatTile
          eyebrow="Payment Rate"
          value={`${paymentRatePct.toFixed(1)}%`}
          sub="Paid ÷ Total Payables"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatTile eyebrow="Vendors with Outstanding" value={vendorsWithOutstanding} />
        <StatTile eyebrow="Pending Payables" value={pendingCount} />
      </div>

      <div className="text-[13.5px] text-muted mb-8 -mt-4">
        No category breakdown is shown: over 57% of recent payable dollar value spans multiple categories, and no
        "For Approval" KPI is shown: no vendor-payable-specific approval status exists distinct from Payment Status.
      </div>

      <StorySection title="Payables by Payment Status" insight="Every payable dollar, grouped by its actual warehouse payment_status — the authoritative status field. Sums to Total Payables.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {byStatus.map((s) => (
            <StatTile
              key={s.status}
              eyebrow={s.status || "Unknown"}
              value={formatPeso(s.amount)}
              sub={`${s.count} payable${s.count === 1 ? "" : "s"}`}
              pill={paidStatuses.includes(s.status) ? { label: "Paid", tone: "good" } : null}
            />
          ))}
          {byStatus.length === 0 && <div className="text-center text-muted text-[15px] py-6">No payables.</div>}
        </div>

        <div className="mt-4 pt-4 border-t border-gridline">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="text-[14px] font-semibold text-series1 hover:underline"
          >
            {showDetail ? "Hide" : "See"} Full Detail ▾
          </button>

          {showDetail && (
            <div className="mt-4">
              <div className="text-[13px] text-muted mb-3">
                One row per payable (not per auction) — over 40% of payables with an auction number span multiple
                auctions, so a literal per-auction split would duplicate or fabricate amounts. "Multiple (N)" means
                this payable covers N distinct auctions.
              </div>
              <div className="flex items-center gap-2 bg-plane border border-gridline rounded-lg px-3 h-8 w-full sm:w-[260px] mb-4">
                <span className="text-muted text-[14.5px]">⌕</span>
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Filter vendor, store, or auction…"
                  className="flex-1 min-w-0 text-[15px] text-ink bg-transparent outline-none placeholder:text-muted"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="text-ink text-[13px] uppercase tracking-wide">
                      <SortHeader label="Payable ID" sortKey="payableId" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Auction(s)" sortKey="auction" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Vendor" sortKey="vendor" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Store" sortKey="storeName" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Sales Period" sortKey="salesPeriod" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Payment Status" sortKey="status" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Bid Amount" sortKey="bidAmount" sort={detailSort} onSort={onDetailSortChange} align="right" />
                      <SortHeader label="Commission" sortKey="commission" sort={detailSort} onSort={onDetailSortChange} align="right" />
                      <SortHeader label="Payable Amount" sortKey="amount" sort={detailSort} onSort={onDetailSortChange} align="right" />
                      <SortHeader label="Generate Date" sortKey="generateDate" sort={detailSort} onSort={onDetailSortChange} />
                      <SortHeader label="Remitted Date" sortKey="remittedDate" sort={detailSort} onSort={onDetailSortChange} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.payableId} className="border-t border-gridline">
                        <td className="py-2.5 pr-4 tabular text-ink">{r.payableId}</td>
                        <td className="py-2.5 pr-4 text-ink" title={r.auctionName || undefined}>
                          {r.auctionLabel}
                        </td>
                        <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
                        <td className="py-2.5 pr-4 text-ink">{r.storeName || "—"}</td>
                        <td className="py-2.5 pr-4 text-ink max-w-[160px] truncate" title={r.salesPeriod}>
                          {r.salesPeriod || "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-ink">{r.status || "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
                        <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.commission)}</td>
                        <td className="py-2.5 pr-4 text-right tabular text-series1">{formatPeso(r.amount)}</td>
                        <td className="py-2.5 pr-4 text-ink">{r.generateDate || "—"}</td>
                        <td className="py-2.5 text-ink">{r.remittedDate || "—"}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-6 text-center text-muted text-[15.5px]">
                          No payables match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {detailTotalCount > 0 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gridline text-[14px]">
                  <button
                    type="button"
                    onClick={() => onDetailPageChange(Math.max(0, clampedPage - 1))}
                    disabled={clampedPage === 0}
                    className="font-semibold text-series1 hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-muted">
                    Page {clampedPage + 1} of {pageCount} · {detailTotalCount} payable{detailTotalCount === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDetailPageChange(Math.min(pageCount - 1, clampedPage + 1))}
                    disabled={clampedPage >= pageCount - 1}
                    className="font-semibold text-series1 hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </StorySection>

      <StorySection title="Outstanding by Vendor" insight="The vendors HMR still owes the most to (On Process + Available payables only), ranked by outstanding amount — top 10.">
        <Card title={`By Vendor · ${scopeLabel}`}>
          <RankedBar
            rows={outstandingByVendor}
            labelKey="vendor"
            valueKey="amount"
            metaKey="payable_count"
            metaLabel="payables"
            showRank={false}
          />
        </Card>
      </StorySection>

      <StorySection
        title="Payables Generated Over Time"
        insight="Monthly volume of payables generated (by generate_date) — not a remittance/payment timeline. remitted_date is too sparsely and unevenly populated across statuses to be shown as a trustworthy 'paid over time' series."
        last
      >
        <Card title="By Month · Generated">
          {trend.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-center text-muted text-[15px]">
              No payables in range.
            </div>
          ) : (
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="payablesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.series1} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={palette.series1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fill: palette.muted, fontSize: 11.5 }} axisLine={{ stroke: palette.gridline }} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: palette.gridline }} />
                  <Area type="monotone" dataKey="amount" stroke={palette.series1} strokeWidth={2} fill="url(#payablesFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </StorySection>
    </>
  );
}
