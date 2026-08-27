import { useMemo, useState } from "react";
import { formatPeso, formatCompactPeso } from "../utils/format";
import Modal from "./primitives/Modal";
import AuctionLotDetailTable from "./AuctionLotDetailTable";

const SETTLED_STATUSES = ["Paid", "Released"];

// Compact "N Participating · M Winning" label for the Total Bidders column.
// Deliberately NOT a single combined count — see BidderBreakdownModal's
// header comment for why a true union isn't safely computable from the
// aggregate-only data this app has. "—" for a population means genuinely
// no data (e.g. Negotiated auctions never have participating bid events),
// never a fabricated zero.
function totalBiddersLabel(activity) {
  const p = activity?.participating;
  const w = activity?.winning;
  const pText = p ? `${p.total} Participating` : "— Participating";
  const wText = w ? `${w.total} Winning` : "— Winning";
  return `${pText} · ${wText}`;
}

// One bidder population (Participating or Winning) — collapsed by default
// showing just the total and its amount; click to reveal the New/Returning
// split. Progressive disclosure, not everything at once — see the parent
// modal's requested UX.
function BidderSummaryCard({ title, amountLabel, stats, expanded, onToggle }) {
  if (!stats) {
    return (
      <div className="border border-gridline rounded-lg p-4 bg-plane">
        <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
        <div className="text-[14px] text-muted">No data for this population.</div>
      </div>
    );
  }

  const total = Number(stats.total) || 0;
  const totalAmount = Number(stats.totalAmount) || 0;
  const newCount = Number(stats.new) || 0;
  const returningCount = Number(stats.returning) || 0;
  const newAmount = Number(stats.newAmount) || 0;
  const returningAmount = Number(stats.returningAmount) || 0;
  const unresolvedAmount = Number(stats.unresolvedAmount) || 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left border border-gridline rounded-lg p-4 bg-plane hover:border-navy/40 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
        <span className="text-[12.5px] text-muted">{expanded ? "Hide ▲" : "Show breakdown ▾"}</span>
      </div>
      <div className="font-display text-[26px] leading-none text-ink mb-1">{total}</div>
      <div className="text-[14px] tabular text-series1">{formatCompactPeso(totalAmount)} {amountLabel}</div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gridline space-y-2">
          <div className="flex items-center justify-between text-[14.5px]">
            <span className="text-ink">New</span>
            <span className="tabular text-ink">
              {newCount} · {formatPeso(newAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[14.5px]">
            <span className="text-ink">Returning</span>
            <span className="tabular text-ink">
              {returningCount} · {formatPeso(returningAmount)}
            </span>
          </div>
          {unresolvedAmount > 0 && (
            <div className="text-[12px] text-muted pt-1">
              + {formatCompactPeso(unresolvedAmount)} unresolved identity (not counted above)
            </div>
          )}
        </div>
      )}
    </button>
  );
}

// PARTICIPATING vs WINNING are deliberately separate, non-reconciling
// metrics — see api/leaderboards.js's perAuctionBiddingActivity (every
// real bid EVENT from cms.mart_cms_bid_history_report, including bids
// that were later outbid — "activity") vs perAuctionComposition (only the
// settled Paid/Released winning lots, via the canonical identity bridge —
// "winning value"). A bidder who bid 5 times and lost still counts fully
// in Participating but contributes nothing to Winning.
//
// TOTAL BIDDERS UNION: investigated before implementing. Both source
// arrays only carry pre-aggregated COUNTS per auction (participating_bidders,
// new_bidders, etc.) — no per-bidder identity list. A winner is very likely
// already counted once in Participating too (for competitive auctions), so
// naively summing participating.total + winning.total would double-count
// real people. Computing a true deduplicated union would require the raw
// resolved-identity rows behind both aggregates, which neither existing
// endpoint currently returns — adding that is a real backend change, not
// "genuinely necessary" for this feature per the explicit instruction to
// avoid a third bidder query. So Total Bidders is shown as two honest,
// separately-labeled counts ("N Participating · M Winning"), never a
// single fabricated combined number.
function BidderBreakdownModal({ open, onClose, auctionNumber, auctionName, activity }) {
  // Independent toggles — Participating and Winning must be expandable at
  // the same time, neither one collapsing the other.
  const [participatingExpanded, setParticipatingExpanded] = useState(false);
  const [winningExpanded, setWinningExpanded] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Auction ${auctionNumber}${auctionName ? ` · ${auctionName}` : ""}`}
      subtitle="Bidder Breakdown"
    >
      <div className="space-y-4">
        <BidderSummaryCard
          title="Participating Bidders"
          amountLabel="activity"
          stats={activity?.participating}
          expanded={participatingExpanded}
          onToggle={() => setParticipatingExpanded((e) => !e)}
        />
        <BidderSummaryCard
          title="Winning Bidders"
          amountLabel="winning value"
          stats={activity?.winning}
          expanded={winningExpanded}
          onToggle={() => setWinningExpanded((e) => !e)}
        />
      </div>
    </Modal>
  );
}

// Always-expanded variant (no click needed) — used inside the Lot Detail
// modal, where bidder context should be visible immediately alongside the
// lots, not tucked behind another interaction. Same data shape and same
// underlying bidderActivity computation as BidderSummaryCard above — this
// is presentational only, no separate calculation.
function BidderStatCardStatic({ title, amountLabel, stats }) {
  if (!stats) {
    return (
      <div className="border border-gridline rounded-lg p-4 bg-plane">
        <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
        <div className="text-[14px] text-muted">No data for this population.</div>
      </div>
    );
  }

  const total = Number(stats.total) || 0;
  const totalAmount = Number(stats.totalAmount) || 0;
  const newCount = Number(stats.new) || 0;
  const returningCount = Number(stats.returning) || 0;
  const newAmount = Number(stats.newAmount) || 0;
  const returningAmount = Number(stats.returningAmount) || 0;
  const unresolvedAmount = Number(stats.unresolvedAmount) || 0;

  return (
    <div className="border border-gridline rounded-lg p-4 bg-plane">
      <div className="text-[13px] uppercase tracking-wide text-muted font-medium mb-1">{title}</div>
      <div className="font-display text-[26px] leading-none text-ink mb-1">{total}</div>
      <div className="text-[13.5px] text-ink mb-2">
        {newCount} New · {returningCount} Returning
      </div>
      <div className="text-[14px] tabular text-series1">{formatCompactPeso(totalAmount)} {amountLabel}</div>
      <div className="text-[12.5px] tabular text-muted mt-0.5">
        {formatCompactPeso(newAmount)} New · {formatCompactPeso(returningAmount)} Returning
      </div>
      {unresolvedAmount > 0 && (
        <div className="text-[12px] text-muted mt-1">
          + {formatCompactPeso(unresolvedAmount)} unresolved identity (not counted above)
        </div>
      )}
    </div>
  );
}

function BidderActivityCards({ activity }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
      <BidderStatCardStatic title="Participating Bidders" amountLabel="activity" stats={activity?.participating} />
      <BidderStatCardStatic title="Winning Bidders" amountLabel="winning value" stats={activity?.winning} />
    </div>
  );
}

const SORTERS = {
  auctionNumber: (r) => r.auctionNumber,
  auctionName: (r) => r.auctionName ?? "",
  auctionType: (r) => r.auctionType ?? "",
  branch: (r) => r.branch,
  category: (r) => r.category,
  subType: (r) => r.subType ?? "",
  startingTime: (r) => r.startingTime ?? "",
  lotsListed: (r) => r.lotsListed,
  lotsSold: (r) => r.lotsSold,
  lotsUnsold: (r) => r.lotsUnsold,
  lotsSettled: (r) => r.lotsSettled,
  totalBidAmount: (r) => r.totalBidAmount,
  totalBuyersPremium: (r) => r.totalBuyersPremium,
  totalCommission: (r) => r.totalCommission,
  totalServiceIncome: (r) => r.totalServiceIncome,
  forApprovalCount: (r) => r.forApprovalCount,
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

function formatDate(isoLike) {
  if (!isoLike) return "—";
  const d = new Date(String(isoLike).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// Rolls per-lot rows (api/auction-detail.js's real, deduped
// auction_number+lot_number grain) into one row per auction.
//
// Total Bid Amount / Buyer's Premium / Commission / Service Income are
// summed ONLY over settled (Paid/Released) lots — the same approved
// definition used everywhere else in this app, never redefined here.
// Listed = Sold + Unsold always holds exactly, because both use the same
// disposition field the API already resolves (see api/auction-detail.js) —
// Settled is a separate, narrower count and is NOT expected to equal Sold
// (Outstanding/Unpaid lots are "Sold" but not yet "Settled").
function groupByAuction(lots) {
  const byAuction = new Map();

  for (const l of lots) {
    if (!byAuction.has(l.auction_number)) {
      byAuction.set(l.auction_number, {
        auctionNumber: l.auction_number,
        auctionName: l.auction_name,
        auctionType: l.auction_type,
        subType: l.sub_type,
        startingTime: l.starting_time,
        branch: l.store_name,
        categories: new Set(),

        lotsListed: 0,
        lotsSold: 0,
        lotsUnsold: 0,
        lotsSettled: 0,
        forApprovalCount: 0,
        forApprovalValue: 0,

        totalBidAmount: 0,
        totalBuyersPremium: 0,
        totalCommission: 0,
      });
    }

    const agg = byAuction.get(l.auction_number);
    const isSettled = SETTLED_STATUSES.includes(l.status);

    agg.categories.add(l.category || "—");
    agg.lotsListed += 1;

    if (l.disposition === "Sold") agg.lotsSold += 1;
    else agg.lotsUnsold += 1;

    if (isSettled) {
      agg.lotsSettled += 1;
      agg.totalBidAmount += Number(l.bid_amount) || 0;
      agg.totalBuyersPremium += Number(l.buyers_premium_income) || 0;
      agg.totalCommission += Number(l.commission_income) || 0;
    }

    if (l.for_approval_status === "For Approval") {
      agg.forApprovalCount += 1;
      agg.forApprovalValue += Number(l.bid_amount) || 0;
    }
  }

  return [...byAuction.values()].map((a) => ({
    ...a,
    category: [...a.categories].join(" + "),
    totalServiceIncome: a.totalBuyersPremium + a.totalCommission,
  }));
}

function mapLotForDetail(l) {
  return {
    lotNumber: l.lot_number,
    item: l.name,
    vendor: l.vendor,
    category: l.category,
    status: l.status,
    approval: l.for_approval_status,
    bidAmount: Number(l.bid_amount) || 0,
    reservedPrice: Number(l.reserved_price) || 0,
    buyersPremium: Number(l.buyers_premium_income) || 0,
    commission: Number(l.commission_income) || 0,
    winningBidder: l.winning_bidder,
  };
}

export default function AuctionSummaryTable({ data: lots, bidderActivity = {}, title = "Order Workbench · Auction Detail", initialQuery = "" }) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState({ key: "startingTime", dir: "desc" });
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [bidderModalAuction, setBidderModalAuction] = useState(null);

  const auctions = useMemo(() => groupByAuction(lots), [lots]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = auctions.filter((r) => {
      if (!q) return true;
      return (
        r.auctionNumber.toLowerCase().includes(q) ||
        (r.auctionName || "").toLowerCase().includes(q) ||
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

  const selectedAuctionMeta = auctions.find((a) => a.auctionNumber === selectedAuction);
  const selectedLots = useMemo(
    () => (selectedAuction ? lots.filter((l) => l.auction_number === selectedAuction).map(mapLotForDetail) : []),
    [lots, selectedAuction]
  );

  const bidderModalMeta = auctions.find((a) => a.auctionNumber === bidderModalAuction);

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
                placeholder="Filter auction #, name, branch, or category…"
                className="flex-1 min-w-0 text-[15px] text-ink bg-transparent outline-none placeholder:text-muted"
              />
            </div>
            <div className="text-[13.5px] text-muted">
              Click an auction # for lot-level detail, or Total Bidders for bidder detail.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[15.5px]">
              <thead>
                <tr className="text-ink text-[13.5px] uppercase tracking-wide">
                  <SortHeader label="Auction #" sortKey="auctionNumber" sort={sort} onSort={handleSort} />
                  <SortHeader label="Auction Name" sortKey="auctionName" sort={sort} onSort={handleSort} />
                  <SortHeader label="Type" sortKey="auctionType" sort={sort} onSort={handleSort} />
                  <SortHeader label="Category" sortKey="category" sort={sort} onSort={handleSort} />
                  <SortHeader label="Sub Type" sortKey="subType" sort={sort} onSort={handleSort} />
                  <SortHeader label="Branch" sortKey="branch" sort={sort} onSort={handleSort} />
                  <SortHeader label="Start" sortKey="startingTime" sort={sort} onSort={handleSort} />
                  <SortHeader label="Listed" sortKey="lotsListed" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Sold" sortKey="lotsSold" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Unsold" sortKey="lotsUnsold" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Settled" sortKey="lotsSettled" sort={sort} onSort={handleSort} align="right" />
                  <th className="font-medium pb-2 pr-4 text-left">Total Bidders</th>
                  <SortHeader label="Total Bid Amount" sortKey="totalBidAmount" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Buyer's Premium" sortKey="totalBuyersPremium" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Commission" sortKey="totalCommission" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="Service Income" sortKey="totalServiceIncome" sort={sort} onSort={handleSort} align="right" />
                  <SortHeader label="For Approval" sortKey="forApprovalCount" sort={sort} onSort={handleSort} align="right" />
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
                    <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.auctionName}>
                      {r.auctionName || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{r.auctionType || "—"}</td>
                    <td className="py-2.5 pr-4 text-ink max-w-[200px] truncate" title={r.category}>
                      {r.category}
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{r.subType || "—"}</td>
                    <td className="py-2.5 pr-4 text-ink">{r.branch}</td>
                    <td className="py-2.5 pr-4 text-ink whitespace-nowrap">{formatDate(r.startingTime)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotsListed}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotsSold}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotsUnsold}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotsSettled}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setBidderModalAuction(r.auctionNumber)}
                        className="text-orange-600 dark:text-orange-500 hover:underline font-medium text-[14px]"
                      >
                        {totalBiddersLabel(bidderActivity[r.auctionNumber])}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular text-series1">{formatPeso(r.totalBidAmount)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.totalBuyersPremium)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.totalCommission)}</td>
                    <td className="py-2.5 pr-4 text-right tabular text-ink">{formatPeso(r.totalServiceIncome)}</td>
                    <td className="py-2.5 text-right tabular text-ink">
                      {r.forApprovalCount > 0 ? `${r.forApprovalCount} (${formatPeso(r.forApprovalValue)})` : "0"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={16} className="py-6 text-center text-muted text-[15.5px]">
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
        title={`Auction ${selectedAuction}${selectedAuctionMeta?.auctionName ? ` · ${selectedAuctionMeta.auctionName}` : ""} · Lot Detail`}
        subtitle="Every individual lot in this auction."
      >
        <BidderActivityCards activity={selectedAuction ? bidderActivity[selectedAuction] : null} />
        <AuctionLotDetailTable data={selectedLots} />
      </Modal>

      <BidderBreakdownModal
        // Remounts (and so resets each card's expand/collapse state to
        // collapsed) whenever a different auction's Total Bidders cell is
        // clicked — without this, expanding a card for one auction would
        // leak into the next auction's modal still showing expanded.
        key={bidderModalAuction ?? "none"}
        open={bidderModalAuction != null}
        onClose={() => setBidderModalAuction(null)}
        auctionNumber={bidderModalAuction}
        auctionName={bidderModalMeta?.auctionName}
        activity={bidderModalAuction ? bidderActivity[bidderModalAuction] : null}
      />
    </div>
  );
}
