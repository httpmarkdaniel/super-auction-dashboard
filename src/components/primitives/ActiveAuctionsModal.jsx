import Modal from "./Modal";

const MANILA_TZ = "Asia/Manila";

function formatManila(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeRemainingLabel(endingIso) {
  if (!endingIso) return "—";
  const end = new Date(endingIso.replace(" ", "T") + (endingIso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(end.getTime())) return "—";
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return "Ending now";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// Auction-level drilldown for the Active Auctions KPI — deliberately
// separate from OperationsTable (lot-level), since "active" here means
// auction EVENTS currently in progress, not individual lots. Row count is
// expected to equal the Active Auctions KPI exactly (same
// starting_time <= now() <= ending_time predicate on both sides).
export default function ActiveAuctionsModal({ open, onClose, rows }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Active Auctions"
      subtitle={`${rows.length} auction${rows.length === 1 ? "" : "s"} currently in progress · store filter applies, date range does not`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[15.5px]">
          <thead>
            <tr className="text-ink text-[13.5px] uppercase tracking-wide">
              <th className="text-left font-medium pb-2 pr-4">Auction #</th>
              <th className="text-left font-medium pb-2 pr-4">Name</th>
              <th className="text-left font-medium pb-2 pr-4">Branch</th>
              <th className="text-left font-medium pb-2 pr-4">Starting</th>
              <th className="text-left font-medium pb-2 pr-4">Ending</th>
              <th className="text-right font-medium pb-2 pr-4">Lots</th>
              <th className="text-left font-medium pb-2">Time Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.auctionNumber} className="border-t border-gridline">
                <td className="py-2.5 pr-4 tabular text-ink">{r.auctionNumber}</td>
                <td className="py-2.5 pr-4 text-ink max-w-[220px] truncate" title={r.name}>
                  {r.name || "—"}
                </td>
                <td className="py-2.5 pr-4 text-ink">{r.branch || "—"}</td>
                <td className="py-2.5 pr-4 tabular text-ink">{formatManila(r.startingTime)}</td>
                <td className="py-2.5 pr-4 tabular text-ink">{formatManila(r.endingTime)}</td>
                <td className="py-2.5 pr-4 text-right tabular text-ink">{r.lotCount}</td>
                <td className="py-2.5 text-ink">{timeRemainingLabel(r.endingTime)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted text-[15.5px]">
                  No auctions currently in progress.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
