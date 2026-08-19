import { useMemo, useState } from "react";
import { formatPeso } from "../utils/format";
import Modal from "./primitives/Modal";
import OperationsTable from "./OperationsTable";

const SORTERS = {
  auctionNumber: (r) => r.auctionNumber,
  branch: (r) => r.branch,
  category: (r) => r.category,
  lotsListed: (r) => r.lotsListed,
  lotsSold: (r) => r.lotsSold,
  sellThroughRate: (r) => r.sellThroughRate,
  totalBidAmount: (r) => r.totalBidAmount,
  totalReservedPrice: (r) => r.totalReservedPrice,
  totalBuyersPremium: (r) => r.totalBuyersPremium,
  totalServiceFee: (r) => r.totalServiceFee,
  totalServiceIncome: (r) => r.totalServiceIncome,
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

// Rolls the per-lot rows this table used to render one-line-per-lot into
// one row per auction — the same underlying (capped-200, most-recent) lot
// list, just aggregated, so an auction's lot count/mix stays consistent
// with whatever the lot-level drilldown modals show elsewhere.
function groupByAuction(lots) {
  const byAuction = new Map();
  for (const l of lots) {
    if (!byAuction.has(l.auctionNumber)) {
      byAuction.set(l.auctionNumber, {
        auctionNumber: l.auctionNumber,
        branch: l.branch,
        categories: new Set(),
        lotsListed: 0,
        lotsSold: 0,
        forApproval: 0,
        unsold: 0,
        totalBidAmount: 0,
        totalReservedPrice: 0,
        totalBuyersPremium: 0,
        totalServiceFee: 0,
      });
    }
    const agg = byAuction.get(l.auctionNumber);
    agg.categories.add(l.category || "—");
    agg.lotsListed += 1;
    if (l.status === "Sold") agg.lotsSold += 1;
    else if (l.status === "For Approval") agg.forApproval += 1;
    else if (l.status === "Unsold") agg.unsold += 1;
    agg.totalBidAmount += l.totalBidAmount || 0;
    agg.totalReservedPrice += l.reservedPrice || 0;
    agg.totalBuyersPremium += l.buyersPremium || 0;
    agg.totalServiceFee += l.serviceFee || 0;
  }
  return [...byAuction.values()].map((a) => ({
    ...a,
    category: [...a.categories].join(", "),
    sellThroughRate: a.lotsListed > 0 ? Math.round((a.lotsSold / a.lotsListed) * 100) : 0,
    totalServiceIncome: a.totalBuyersPremium + a.totalServiceFee,
  }));
}

export default function AuctionSummaryTable({ data: operationsDetail, title = "Order Workbench · Auction Detail" }) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "auctionNumber", dir: "desc" });
  const [selectedAuction, setSelectedAuction] = useState(null);

  const auctions = useMemo(() => groupByAuction(operationsDetail), [operationsDetail]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = auctions.filter((r) => {
      if (!q) return true;
      return (
        r.auctionNumber.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
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
  }, [auctions, query, sort]);

  function handleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-6 py-4 text-left">
        <div className="eyebrow">{title}</div>
        <span className="text-ink text-[15.5px]">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {open && (
        <div className="px-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <div className="flex items-center gap-2 bg-plane border border-gridline rounded-lg px-3 h-8 w-full sm:w-[260px]">
              <span className="text-muted text-[14.5px]">⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter auction #, branch, or category…"
                className="flex-1 min-w-0 text-[15px] text-ink bg-transparent outline-none placeholder:text-muted"
              />
            </div>
            <div className="text-[13.5px] text-muted">Click an auction # to see its individual lots.</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[15.5px]">
              <thead>
                <tr className="text-ink text-[13.5px] uppercase tracking-wide">
                  <SortHeader label="Auction #" sortKey="auctionNumber" sort={sort} onSort={handleSort} />
                  <SortHeader label="Branch" sortKey="branch" sort={sort} onSort={handleSort} />
                  <SortHeader label="Category" sortKey="category" sort={sort} onSort={handleSort} />
                  <SortHeader label="Lots Listed" sortKey="lotsListed" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Lots Sold" sortKey="lotsSold" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Sell-Through" sortKey="sellThroughRate" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Total Bid Amount" sortKey="totalBidAmount" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Reserved Price" sortKey="totalReservedPrice" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Buyer's Premium" sortKey="totalBuyersPremium" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Service Fee" sortKey="totalServiceFee" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Service Income" sortKey="totalServiceIncome" sort={sort} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.auctionNumber} className="border-t border-gridline">
                    <td className="py-2.5 pr-4 tabular">
                      <button
                        type="button"
                        onClick={() => setSelectedAuction(r.auctionNumber)}
                        className="text-orange-600 dark:text-orange-500 hover:underline font-medium"
                      >
                        {r.auctionNumber}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{r.branch}</td>
                    <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.category}>
                      {r.category}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotsListed}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotsSold}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.sellThroughRate}%</td>
                    <td className="py-2.5 pr-4 text-right tabular text-series1">{formatPeso(r.totalBidAmount)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">
                      {r.totalReservedPrice > 0 ? formatPeso(r.totalReservedPrice) : <span className="text-muted">No Reserve</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.totalBuyersPremium)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.totalServiceFee)}</td>
                    <td className="py-2.5 text-right tabular text-ink">{formatPeso(r.totalServiceIncome)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-muted text-[15.5px]">
                      No auctions match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={selectedAuction != null}
        onClose={() => setSelectedAuction(null)}
        title={`Auction ${selectedAuction} · Lot Detail`}
        subtitle="Every individual lot in this auction."
      >
        <OperationsTable
          data={operationsDetail.filter((l) => l.auctionNumber === selectedAuction)}
          embedded
        />
      </Modal>
    </div>
  );
}
