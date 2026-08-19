import { useState } from "react";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import Card from "./primitives/Card";
import RankedBar from "./primitives/RankedBar";
import StatusBar from "./primitives/StatusBar";
import { formatPeso } from "../utils/format";

const STATUS_BY_BUCKET = ["good", "warning", "critical"];

const SORTERS = {
  vendor: (r) => r.vendor ?? "",
  storeName: (r) => r.storeName ?? "",
  auctionNumber: (r) => r.auctionNumber ?? "",
  item: (r) => r.item ?? "",
  amount: (r) => r.amount,
  status: (r) => r.status ?? "",
  daysOutstanding: (r) => r.daysOutstanding,
};

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

// The full vendor-payables breakdown (KPI row, aging, top vendors owed,
// backlog by branch, by payment status, searchable detail table) — shared
// between the standalone Vendor Payables page (company-wide) and each
// category page (category-scoped), so both stay at parity instead of the
// category pages carrying a stripped-down copy.
export default function VendorPayablesBreakdown({ data, scopeLabel, isLastSection = true }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "daysOutstanding", dir: "desc" });

  const totalBacklog = Number(data.total_backlog) || 0;
  const pendingCount = Number(data.pending_count) || 0;
  const avgAgeDays = Math.round(Number(data.avg_age_days) || 0);
  const aging = [
    { bucket: "0–30 days", value: Number(data.aged_0_30) || 0 },
    { bucket: "31–60 days", value: Number(data.aged_31_60) || 0 },
    { bucket: "60+ days", value: Number(data.aged_60_plus) || 0 },
  ];
  const agingRows = aging.map((a, i) => ({ label: a.bucket, value: a.value, status: STATUS_BY_BUCKET[i] }));

  const byVendor = (data.byVendor || []).map((v) => ({
    vendor: v.vendor,
    amount: Number(v.amount) || 0,
    lots: Number(v.lots) || 0,
  }));
  const byBranch = (data.byBranch || []).map((b) => ({
    branch: b.store_name,
    amount: Number(b.amount) || 0,
    lots: Number(b.lots) || 0,
  }));
  const byStatus = (data.byStatus || []).map((s) => ({
    status: s.payment_status,
    amount: Number(s.amount) || 0,
    lots: Number(s.lots) || 0,
  }));

  const detailRows = (data.detail || []).map((d) => ({
    vendor: d.vendor,
    storeName: d.store_name,
    auctionNumber: d.auction_number,
    lotNumber: d.lot_number,
    item: d.item_master_name,
    amount: Number(d.payable_amount) || 0,
    status: d.payment_status,
    generateDate: d.generate_date,
    daysOutstanding: Number(d.days_outstanding) || 0,
  }));

  const rows = (() => {
    const q = query.trim().toLowerCase();
    let filtered = detailRows.filter((r) => {
      if (!q) return true;
      return (
        (r.vendor || "").toLowerCase().includes(q) ||
        (r.storeName || "").toLowerCase().includes(q) ||
        (r.auctionNumber || "").toLowerCase().includes(q)
      );
    });
    const getter = SORTERS[sort.key];
    filtered = [...filtered].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return filtered;
  })();

  function handleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile eyebrow="Total Backlog" value={formatPeso(totalBacklog)} />
        <StatTile eyebrow="Pending Payables" value={pendingCount} />
        <StatTile eyebrow="Avg Days Outstanding" value={`${avgAgeDays} days`} />
        <StatTile
          eyebrow="Aged 60+ Days"
          value={formatPeso(aging[2].value)}
          pill={aging[2].value > 0 ? { label: "Critical", tone: "critical" } : null}
        />
      </div>

      <StorySection title="Aging Breakdown" insight="How long each peso of backlog has been outstanding, bucketed by age.">
        <Card>
          <StatusBar rows={agingRows} />
        </Card>
      </StorySection>

      <StorySection title="Top Vendors Owed" insight="The vendors HMR owes the most to right now.">
        <Card title={`By Vendor · ${scopeLabel}`}>
          <RankedBar rows={byVendor} labelKey="vendor" valueKey="amount" metaKey="lots" metaLabel="lots" showRank={false} />
        </Card>
      </StorySection>

      <StorySection title="Backlog by Branch" insight="Which branches are carrying the largest unremitted balance.">
        <Card title="By Branch">
          <RankedBar rows={byBranch} labelKey="branch" valueKey="amount" metaKey="lots" metaLabel="lots" showRank={false} />
        </Card>
      </StorySection>

      <StorySection title="By Payment Status" insight="On Process vs. Available — where each payable sits before it's remitted.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {byStatus.map((s) => (
            <StatTile key={s.status} eyebrow={s.status || "Unknown"} value={formatPeso(s.amount)} sub={`${s.lots} lots`} />
          ))}
          {byStatus.length === 0 && <div className="text-center text-muted text-[15px] py-6">No pending payables.</div>}
        </div>
      </StorySection>

      <StorySection
        title="Payables Detail"
        insight="Every individual pending payable, oldest first by default — up to 200 rows."
        last={isLastSection}
      >
        <div className="card overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 bg-plane border border-gridline rounded-lg px-3 h-8 w-full sm:w-[260px] mb-4">
              <span className="text-muted text-[14.5px]">⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter vendor, branch, or auction #…"
                className="flex-1 min-w-0 text-[15px] text-ink bg-transparent outline-none placeholder:text-muted"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[15.5px]">
                <thead>
                  <tr className="text-ink text-[13.5px] uppercase tracking-wide">
                    <SortHeader label="Vendor" sortKey="vendor" sort={sort} onSort={handleSort} />
                    <SortHeader label="Branch" sortKey="storeName" sort={sort} onSort={handleSort} />
                    <SortHeader label="Auction #" sortKey="auctionNumber" sort={sort} onSort={handleSort} />
                    <SortHeader label="Item" sortKey="item" sort={sort} onSort={handleSort} />
                    <SortHeader label="Amount" sortKey="amount" sort={sort} onSort={handleSort} align="right" />
                    <SortHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
                    <SortHeader label="Days Outstanding" sortKey="daysOutstanding" sort={sort} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.auctionNumber}-${r.lotNumber}-${i}`} className="border-t border-gridline">
                      <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
                      <td className="py-2.5 pr-4 text-ink">{r.storeName || "—"}</td>
                      <td className="py-2.5 pr-4 tabular text-ink">{r.auctionNumber || "—"}</td>
                      <td className="py-2.5 pr-4 text-ink max-w-[220px] truncate" title={r.item}>
                        {r.item || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular text-series1">{formatPeso(r.amount)}</td>
                      <td className="py-2.5 pr-4 text-ink">{r.status || "—"}</td>
                      <td className="py-2.5 text-right tabular text-ink">{r.daysOutstanding}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted text-[15.5px]">
                        No pending payables match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </StorySection>
    </>
  );
}
