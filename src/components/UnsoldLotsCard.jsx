import { formatPeso } from "../utils/format";

function AgingBar({ fresh, aging, stale }) {
  const total = fresh + aging + stale || 1;
  const seg = (n) => `${(n / total) * 100}%`;
  return (
    <div className="mt-3 pt-3 border-t border-gridline">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gridline">
        <div className="bg-good" style={{ width: seg(fresh) }} title={`${fresh} lots ≤30 days`} />
        <div className="bg-warning" style={{ width: seg(aging) }} title={`${aging} lots 31–90 days`} />
        <div className="bg-critical" style={{ width: seg(stale) }} title={`${stale} lots 90+ days`} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[13.5px] text-muted">
        <span>≤30d: {fresh}</span>
        <span>31–90d: {aging}</span>
        <span>90+d: {stale}</span>
      </div>
    </div>
  );
}

export default function UnsoldLotsCard({ data: unsoldLots }) {
  const hasDelta = unsoldLots.deltaPct !== undefined && unsoldLots.deltaPct !== null;
  const improving = unsoldLots.deltaPct < 0;
  const hasAging = unsoldLots.avgAgeDays !== undefined;
  return (
    <div className="card px-6 py-5 h-full">
      <div className="eyebrow mb-3">Unsold Inventory · Value at Stake</div>
      <div className="font-bold text-[38.5px] leading-none text-series1 mb-2">
        {formatPeso(unsoldLots.value)}
      </div>
      {hasDelta && (
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-flex items-center gap-1 text-[15.5px] font-medium ${
              improving ? "text-toneGreenText" : "text-toneRedText"
            }`}
          >
            {improving ? "▼" : "▲"} {Math.abs(unsoldLots.deltaPct)}%
          </span>
          <span className="text-[15.5px] text-ink">vs last week</span>
        </div>
      )}
      <div className="text-[15px] text-muted">
        {unsoldLots.count} lots sitting unsold
        {hasAging && unsoldLots.avgAgeDays > 0 && ` · avg ${unsoldLots.avgAgeDays.toLocaleString()} days old`}
      </div>
      {hasAging && <AgingBar fresh={unsoldLots.fresh} aging={unsoldLots.aging} stale={unsoldLots.stale} />}
    </div>
  );
}
