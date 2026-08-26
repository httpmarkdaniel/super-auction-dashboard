export default function StoryHeader({ eyebrow, headline, amount, amountLabel, deltaPct, deltaLabel = "vs. yesterday", methodology, onAmountClick, extraDeltas }) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const up = hasDelta && deltaPct >= 0;
  const hasTip = Boolean(methodology);
  const Wrapper = onAmountClick ? "button" : "div";

  return (
    <Wrapper
      type={onAmountClick ? "button" : undefined}
      onClick={onAmountClick}
      className={`card px-7 py-6 relative text-left w-full ${hasTip ? "group/tip" : ""} ${
        onAmountClick ? "cursor-pointer hover:border-navy/40 transition-colors" : ""
      }`}
    >
      <div className="text-[13.5px] tracking-[0.1em] uppercase text-navy font-bold font-display mb-2.5">{eyebrow}</div>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <p className="text-[20.5px] leading-relaxed text-ink font-medium max-w-[680px]">{headline}</p>
        {amount && (
          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1.5">
              <div className="font-display text-[51px] leading-none text-ink">{amount}</div>
              {hasTip && (
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-muted text-[10.5px] font-bold shrink-0 leading-none translate-y-[-14px]">
                  i
                </span>
              )}
            </div>
            {amountLabel && (
              <div className="text-[13.5px] text-muted mt-1">{amountLabel}</div>
            )}
            {hasDelta && (
              <div className={`text-[15.5px] font-medium mt-1.5 ${up ? "text-toneGreenText" : "text-toneRedText"}`}>
                {up ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% {deltaLabel}
              </div>
            )}
            {extraDeltas && extraDeltas.length > 0 && (
              <div className="flex flex-col items-end gap-0.5 mt-1.5">
                {extraDeltas.map((d) => {
                  const rising = d.pct >= 0;
                  return (
                    <span key={d.label} className={`text-[13.5px] font-medium ${rising ? "text-toneGreenText" : "text-toneRedText"}`}>
                      {rising ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}% {d.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {hasTip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute right-4 left-4 sm:left-auto sm:w-80 sm:max-w-[calc(100vw-2rem)] top-full mt-2 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[60]"
        >
          <div className="floating px-3 py-2 text-[14px] leading-snug text-ink shadow-lg text-left">{methodology}</div>
        </div>
      )}
    </Wrapper>
  );
}
