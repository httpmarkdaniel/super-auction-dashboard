import { useMemo, useState } from "react";
import { formatPeso } from "../utils/format";

// Real warehouse lifecycle status — see api/auction-detail.js's
// STATUS_PRIORITY_SQL (same validated definition as OperationsTable.jsx's
// identical style constant, kept as its own copy since this table is
// specific to Full Auction Detail and must not touch OperationsTable.jsx,
// which several Overview drilldowns depend on).
const statusStyle = {
  Released: "text-toneGreenText bg-good/10",
  Paid: "text-toneGreenText bg-good/10",
  Outstanding: "text-toneAmberText bg-warning/10",
  Unpaid: "text-toneAmberText bg-warning/10",
  Unsold: "text-toneRedText bg-critical/10",
  Refunded: "text-toneRedText bg-critical/10",
  Returned: "text-toneRedText bg-critical/10",
};

const SORTERS = {
  lotNumber: (r) => r.lotNumber,
  item: (r) => r.item ?? "",
  vendor: (r) => r.vendor ?? "",
  category: (r) => r.category ?? "",
  bidAmount: (r) => r.bidAmount,
  reservedPrice: (r) => r.reservedPrice,
  buyersPremium: (r) => r.buyersPremium,
  commission: (r) => r.commission,
  winningBidder: (r) => r.winningBidder ?? "",
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

// Per-lot detail for one auction — real resolved lifecycle Status (never
// replaced with a derived Sold/Unsold label), and a Winning Bidder column
// resolved via the same canonical BIDDER_IDENTITY_CTES bridge Bidder
// Composition uses (see api/auction-detail.js). "—" means the lot isn't
// settled yet (no winner to show); "Unavailable" means it IS settled but
// neither identity bridge could resolve a bidder — never fabricated.
export default function AuctionLotDetailTable({ data }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "lotNumber", dir: "asc" });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = data.filter((r) => {
      if (!q) return true;
      return (
        (r.lotNumber || "").toLowerCase().includes(q) ||
        (r.vendor || "").toLowerCase().includes(q) ||
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
  }, [data, query, sort]);

  function handleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div>
      <div className="flex items-center gap-2 bg-plane border border-gridline rounded-lg px-3 h-8 w-full sm:w-[260px] mb-4">
        <span className="text-muted text-[14.5px]">⌕</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter lot #, item, or vendor…"
          className="flex-1 min-w-0 text-[15px] text-ink bg-transparent outline-none placeholder:text-muted"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="text-ink text-[13px] uppercase tracking-wide">
              <SortHeader label="Lot #" sortKey="lotNumber" sort={sort} onSort={handleSort} />
              <SortHeader label="Item" sortKey="item" sort={sort} onSort={handleSort} />
              <SortHeader label="Vendor" sortKey="vendor" sort={sort} onSort={handleSort} />
              <SortHeader label="Category" sortKey="category" sort={sort} onSort={handleSort} />
              <th className="text-left font-medium pb-2 pr-4">Status</th>
              <th className="text-left font-medium pb-2 pr-4">Approval</th>
              <SortHeader label="Bid Amount" sortKey="bidAmount" sort={sort} onSort={handleSort} align="right" />
              <SortHeader label="Reserve Price" sortKey="reservedPrice" sort={sort} onSort={handleSort} align="right" />
              <SortHeader label="Buyer's Premium" sortKey="buyersPremium" sort={sort} onSort={handleSort} align="right" />
              <SortHeader label="Commission" sortKey="commission" sort={sort} onSort={handleSort} align="right" />
              <SortHeader label="Winning Bidder" sortKey="winningBidder" sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lotNumber} className="border-t border-gridline hover:bg-plane/60 transition-colors">
                <td className="py-2.5 pr-4 tabular text-ink">{r.lotNumber}</td>
                <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.item}>
                  {r.item || "—"}
                </td>
                <td className="py-2.5 pr-4 text-ink">{r.vendor || "—"}</td>
                <td className="py-2.5 pr-4 text-ink">{r.category || "—"}</td>
                <td className="py-2.5 pr-4">
                  <span className={`px-2 py-0.5 rounded text-[14.5px] font-medium ${statusStyle[r.status] || "text-ink bg-gridline"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-ink">{r.approval || "—"}</td>
                <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.bidAmount)}</td>
                <td className="py-2.5 pr-4 text-right tabular text-ink">
                  {r.reservedPrice > 0 ? formatPeso(r.reservedPrice) : <span className="text-muted">No Reserve</span>}
                </td>
                <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.buyersPremium)}</td>
                <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.commission)}</td>
                <td className="py-2.5 text-ink">{r.winningBidder || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-muted text-[15.5px]">
                  No lots match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
