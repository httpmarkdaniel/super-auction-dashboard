import Sparkline from "./Sparkline";

function Delta({ pct, invert = false }) {
  if (pct === undefined || pct === null) return null;
  const rising = pct >= 0;
  const good = invert ? !rising : rising;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[13px] font-medium ${
        good ? "text-toneGreenText" : "text-toneRedText"
      }`}
    >
      <span>{rising ? "▲" : "▼"}</span>
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const PILL_TONE = {
  good: "bg-toneGreenBg text-toneGreenText",
  warning: "bg-toneAmberBg text-toneAmberText",
  critical: "bg-toneRedBg text-toneRedText",
};

export default function StatTile({ eyebrow, value, delta, invert, sub, live, icon, pill, sparkline }) {
  return (
    <div className="bg-surface1 border border-gridline rounded-lg shadow-card px-4 py-3.5 flex-1 min-w-[180px]">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-navySoft text-navy shrink-0">
              {icon}
            </span>
          )}
          <span className="eyebrow truncate">{eyebrow}</span>
        </div>
        {pill && (
          <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PILL_TONE[pill.tone] || PILL_TONE.warning}`}>
            {pill.label}
          </span>
        )}
      </div>
      <div className="font-bold text-[30px] leading-none mb-2 text-ink">
        {value}
        {live && (
          <span className="inline-flex items-center gap-1.5 ml-3 align-middle text-[11px] font-semibold text-toneRedText tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-critical pulse-dot" />
            LIVE
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {delta !== undefined && <Delta pct={delta} invert={invert} />}
          {sub && <span className="text-[12px] text-ink truncate">{sub}</span>}
        </div>
        {sparkline && <Sparkline data={sparkline} width={56} height={22} colorClass="text-series1" />}
      </div>
    </div>
  );
}
