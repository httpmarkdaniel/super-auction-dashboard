import Sparkline from "./Sparkline";

function Delta({ pct, invert = false }) {
  if (pct === undefined || pct === null) return null;
  const rising = pct >= 0;
  const good = invert ? !rising : rising;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[15.5px] font-medium ${
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

export default function StatTile({ eyebrow, value, delta, invert, sub, live, icon, pill, sparkline, methodology, onClick, extraDeltas }) {
  const Wrapper = onClick ? "button" : "div";
  const hasTip = Boolean(methodology);
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative bg-surface1 border border-gridline rounded-lg shadow-card px-4 pt-3 pb-3.5 flex-1 min-w-[180px] text-left w-full ${
        hasTip ? "group/tip" : ""
      } ${onClick ? "cursor-pointer hover:border-navy/40 transition-colors" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && (
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-navySoft text-navy shrink-0">
              {icon}
            </span>
          )}
          <span className="kpi-label truncate">{eyebrow}</span>
          {hasTip && (
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10.5px] font-bold shrink-0 leading-none">
              i
            </span>
          )}
        </div>
        {pill && (
          <span className={`text-[13px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PILL_TONE[pill.tone] || PILL_TONE.warning}`}>
            {pill.label}
          </span>
        )}
      </div>
      <div className="font-display text-[36.5px] leading-none mb-2 text-ink">
        {value}
        {live && (
          <span className="inline-flex items-center gap-1.5 ml-3 align-middle text-[13.5px] font-semibold text-toneRedText tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-critical pulse-dot" />
            LIVE
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {delta !== undefined && <Delta pct={delta} invert={invert} />}
          {sub && <span className="text-[14.5px] text-ink truncate">{sub}</span>}
        </div>
        {sparkline && <Sparkline data={sparkline} width={56} height={22} colorClass="text-series1" />}
      </div>

      {extraDeltas && extraDeltas.length > 0 && (
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {extraDeltas.map((d) => (
            <span key={d.label} className="inline-flex items-center gap-1 text-[13px] text-muted">
              <Delta pct={d.pct} invert={invert} />
              {d.label}
            </span>
          ))}
        </div>
      )}

      {hasTip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-3 right-3 top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        >
          <div className="methodology px-3 py-2 text-[14px] leading-snug shadow-lg text-left">{methodology}</div>
        </div>
      )}
    </Wrapper>
  );
}
