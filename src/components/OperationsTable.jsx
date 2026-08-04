import { useMemo, useState } from "react";
import { formatPeso } from "../utils/format";

const statusStyle = {
  Sold: "text-toneGreenText bg-good/10",
  "For Approval": "text-toneAmberText bg-warning/10",
  Unsold: "text-toneRedText bg-critical/10",
};

const TABS = ["All", "Sold", "For Approval", "Unsold"];

const SORTERS = {
  lotNumber: (r) => r.lotNumber,
  item: (r) => r.item ?? "",
  vendor: (r) => r.vendor,
  category: (r) => r.category,
  soldPrice: (r) => r.soldPrice,
  totalBidAmount: (r) => r.totalBidAmount ?? 0,
  buyersPremium: (r) => r.buyersPremium ?? 0,
  serviceFee: (r) => r.serviceFee ?? 0,
  serviceIncome: (r) => (r.buyersPremium ?? 0) + (r.serviceFee ?? 0),
  branch: (r) => r.branch ?? "",
  auctionNumber: (r) => r.auctionNumber ?? "",
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
        {active && <span className="text-[10px]">{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

export default function OperationsTable({ data: operationsDetail }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "lotNumber", dir: "asc" });

  const counts = useMemo(() => {
    const c = { All: operationsDetail.length, Sold: 0, "For Approval": 0, Unsold: 0 };
    operationsDetail.forEach((r) => {
      c[r.status] = (c[r.status] || 0) + 1;
    });
    return c;
  }, [operationsDetail]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = operationsDetail.filter((r) => {
      if (tab !== "All" && r.status !== tab) return false;
      if (!q) return true;
      return (
        r.lotNumber.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q) ||
        (r.item || "").toLowerCase().includes(q)
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
  }, [operationsDetail, tab, query, sort]);

  function handleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-6 py-4 text-left">
        <div className="eyebrow">Order Workbench · Lot Detail</div>
        <span className="text-ink text-[13px]">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {open && (
        <div className="px-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                    tab === t
                      ? "bg-navySoft text-navy border-navySoft"
                      : "bg-transparent text-ink border-gridline hover:bg-plane"
                  }`}
                >
                  {t}
                  <span className={`text-[10.5px] px-1 rounded ${tab === t ? "bg-navy/15" : "bg-plane"}`}>
                    {counts[t] || 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-plane border border-gridline rounded-lg px-3 h-8 sm:ml-auto sm:w-[220px]">
              <span className="text-muted text-[12px]">⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter lot #, item, or vendor…"
                className="flex-1 min-w-0 text-[12.5px] text-ink bg-transparent outline-none placeholder:text-muted"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink text-[11px] uppercase tracking-wide">
                  <SortHeader label="Lot #" sortKey="lotNumber" sort={sort} onSort={handleSort} />
                  <SortHeader label="Item" sortKey="item" sort={sort} onSort={handleSort} />
                  <SortHeader label="Branch" sortKey="branch" sort={sort} onSort={handleSort} />
                  <SortHeader label="Auction #" sortKey="auctionNumber" sort={sort} onSort={handleSort} />
                  <SortHeader label="Vendor" sortKey="vendor" sort={sort} onSort={handleSort} />
                  <SortHeader label="Category" sortKey="category" sort={sort} onSort={handleSort} />
                  <th className="text-left font-medium pb-2 pr-4">Status</th>
                  <SortHeader label="Total Bid Amount" sortKey="totalBidAmount" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Sold Price" sortKey="soldPrice" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Buyer's Premium" sortKey="buyersPremium" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Service Fee" sortKey="serviceFee" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Service Income (BP+SF)" sortKey="serviceIncome" sort={sort} onSort={handleSort} align="right" />
                  <th className="text-left font-medium pb-2">Approval</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lotNumber} className="border-t border-gridline">
                    <td className="py-2.5 pr-4 tabular text-ink">{r.lotNumber}</td>
                    <td className="py-2.5 pr-4 text-ink max-w-[220px] truncate" title={r.item}>
                      {r.item || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{r.branch}</td>
                    <td className="py-2.5 pr-4 tabular text-ink">{r.auctionNumber}</td>
                    <td className="py-2.5 pr-4 text-ink">{r.vendor}</td>
                    <td className="py-2.5 pr-4 text-ink">{r.category}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[12px] font-medium ${
                          statusStyle[r.status] || "text-ink bg-gridline"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.totalBidAmount)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-series1">{formatPeso(r.soldPrice)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.buyersPremium)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.serviceFee)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">
                      {formatPeso((r.buyersPremium ?? 0) + (r.serviceFee ?? 0))}
                    </td>
                    <td className="py-2.5 text-ink">{r.approval || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-6 text-center text-muted text-[13px]">
                      No lots match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
