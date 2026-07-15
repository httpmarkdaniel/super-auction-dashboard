function Delta({ pct, invert = false }) {
  if (pct === undefined || pct === null) return null;
  const rising = pct >= 0;
  const good = invert ? !rising : rising;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[13px] font-medium ${
        good ? "text-good" : "text-critical"
      }`}
    >
      <span>{rising ? "▲" : "▼"}</span>
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function StatTile({ eyebrow, value, delta, invert, sub, live, accent }) {
  return (
    <div className="card px-5 py-4 flex-1 min-w-[180px]">
      <div className="eyebrow mb-2.5">{eyebrow}</div>
      <div
        className={`font-head text-[34px] leading-none mb-2 ${
          accent ? "text-series1" : "text-ink"
        }`}
      >
        {value}
        {live && (
          <span className="inline-flex items-center gap-1.5 ml-3 align-middle text-[11px] font-semibold text-critical tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-critical pulse-dot" />
            LIVE
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {delta !== undefined && <Delta pct={delta} invert={invert} />}
        {sub && <span className="text-[12.5px] text-ink2">{sub}</span>}
      </div>
    </div>
  );
}
