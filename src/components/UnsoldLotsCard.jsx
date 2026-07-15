import { formatPeso } from "../utils/format";

export default function UnsoldLotsCard({ data: unsoldLots }) {
  const improving = unsoldLots.deltaPct < 0;
  return (
    <div className="card px-6 py-5 h-full">
      <div className="eyebrow mb-3">Unsold Inventory · Value at Stake</div>
      <div className="font-head text-[32px] leading-none text-ink mb-2">
        {formatPeso(unsoldLots.value)}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`inline-flex items-center gap-1 text-[13px] font-medium ${
            improving ? "text-good" : "text-critical"
          }`}
        >
          {improving ? "▼" : "▲"} {Math.abs(unsoldLots.deltaPct)}%
        </span>
        <span className="text-[13px] text-ink2">vs last week</span>
      </div>
      <div className="text-[12.5px] text-muted">{unsoldLots.count} lots sitting unsold</div>
    </div>
  );
}
