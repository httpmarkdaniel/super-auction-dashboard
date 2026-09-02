import { formatPeso } from "../../utils/format";

// PART 18-26: hover preview for a Top Vendor/Bidder row — anchored to the
// row, compact, full entity name, ZERO network requests (every field here
// is already present on the already-fetched row object — see App.jsx's
// topVendors/topBidders mapping and api/leaderboards.js's own comments for
// which fields are cheap vs. intentionally deferred).
function HoverPreview({ kind, row }) {
  if (kind === "vendor") {
    return (
      <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg text-left min-w-[300px]">
        <div className="font-semibold text-[14px] mb-2 uppercase tracking-wide break-words">{row.vendor}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div>
            <div className="text-muted text-[12px]">Auction Events</div>
            <div className="tabular font-medium">{row.auctionEvents}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Lots Sold</div>
            <div className="tabular font-medium">{row.lots}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Total Bid Amount</div>
            <div className="tabular font-medium">{formatPeso(row.bidAmount)}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Service Income</div>
            <div className="tabular font-medium text-series1">{formatPeso(row.serviceIncome)}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Avg Bid / Auction</div>
            <div className="tabular font-medium">{row.avgBidPerAuction != null ? formatPeso(row.avgBidPerAuction) : "—"}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Avg Bid / Sold Lot</div>
            <div className="tabular font-medium">{row.avgBidPerSoldLot != null ? formatPeso(row.avgBidPerSoldLot) : "—"}</div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "bidder") {
    return (
      <div className="floating px-3.5 py-3 text-[13.5px] leading-snug text-ink shadow-lg text-left min-w-[300px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-[14px] uppercase tracking-wide break-words">{row.bidder}</span>
          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${row.new_or_returning === "new" ? "bg-navySoft text-navy" : "bg-gridline text-muted"}`}>
            {row.new_or_returning === "new" ? "New" : "Returning"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 pb-3 border-b border-gridline">
          <div>
            <div className="text-muted text-[12px]">Auctions Participated</div>
            <div className="tabular font-medium">{row.auctionsParticipated}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Distinct Lots Bid On</div>
            <div className="tabular font-medium">{row.distinctLotsBidOn}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Total Bids</div>
            <div className="tabular font-medium">{row.totalBids}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Avg Bids / Lot</div>
            <div className="tabular font-medium text-series1">{row.avgBidsPerLot != null ? row.avgBidsPerLot.toFixed(2) : "—"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 pb-3 border-b border-gridline">
          <div>
            <div className="text-muted text-[12px]">Winning Auctions</div>
            <div className="tabular font-medium">{row.winningAuctions}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Winning Lots</div>
            <div className="tabular font-medium">{row.wins}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted text-[12px]">Winning Value</div>
            <div className="tabular font-medium">{formatPeso(row.bidAmount)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div>
            <div className="text-muted text-[12px]">Max Bid Usage Rate</div>
            <div className="tabular font-medium">{row.maxBidUsagePct != null ? `${row.maxBidUsagePct.toFixed(1)}%` : "—"}</div>
          </div>
          <div>
            <div className="text-muted text-[12px]">Winning via Max Bid</div>
            <div className="tabular font-medium">{row.winningViaMaxBid}</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Horizontal ranked bar list — one hue (magnitude comparison, not identity),
// direct-labeled so the bar and the number never disagree.
// badgeKey: optional field name (e.g. "new_or_returning") whose value —
// already resolved server-side, never inferred here — renders as a
// compact chip beside the name. shrink-0 so it keeps its own size and
// wraps onto its own line rather than ever being the reason a name gets
// squeezed or clipped.
function Badge({ value }) {
  if (!value) return null;
  const isNew = value === "new";
  return (
    <span
      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
        isNew ? "bg-navySoft text-navy" : "bg-gridline text-muted"
      }`}
    >
      {isNew ? "New" : "Returning"}
    </span>
  );
}

// Row layout deliberately puts the full name first: name+badge share the
// top line with the value (never fixed-width/truncated — a long name wraps
// to 2+ lines instead), the progress bar moves to its own line below where
// it can use the row's full width without competing with the name for
// space. Rank stays a fixed-width leading column since it's always short.
export default function RankedBar({ rows, labelKey, valueKey, metaKey, metaLabel, badgeKey, hoverKind, showRank = true, showAvg = false, emptyMessage = "No data for this period." }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);

  if (rows.length === 0) {
    return <div className="text-center text-muted text-[15px] py-6">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r, i) => (
        <div key={r[labelKey]} className={`relative flex items-start gap-3 ${hoverKind ? "group/tip" : ""}`}>
          {showRank && (
            <div className={`w-4 text-center text-[14.5px] shrink-0 tabular font-bold pt-0.5 ${i === 0 ? "text-navy" : "text-muted"}`}>
              {i + 1}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-[15.5px] text-ink break-words">{r[labelKey]}</span>
                {badgeKey && <Badge value={r[badgeKey]} />}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[15.5px] tabular text-series1">{formatPeso(r[valueKey])}</div>
                {showAvg && metaKey && r[metaKey] > 0 && (
                  <div className="text-[13.5px] tabular text-series1">{formatPeso(Math.round(r[valueKey] / r[metaKey]))} avg</div>
                )}
              </div>
            </div>
            {metaKey && (
              <div className="text-[13.5px] text-muted mt-0.5">
                {r[metaKey]} {metaLabel}
              </div>
            )}
            <div className="h-2 rounded-full bg-gridline overflow-hidden mt-1.5">
              <div
                className="h-full rounded-full bg-series1"
                style={{ width: `${(r[valueKey] / max) * 100}%` }}
              />
            </div>
          </div>

          {hoverKind && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-0 right-0 top-full mt-1.5 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
            >
              <HoverPreview kind={hoverKind} row={r} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
