export default function StoryHeader({ eyebrow, headline, amount, deltaPct, deltaLabel = "vs. yesterday" }) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const up = hasDelta && deltaPct >= 0;

  return (
    <div className="relative rounded-xl bg-brandNavyDeep px-7 py-6 overflow-hidden">
      <div className="absolute top-0 right-0 w-2 h-full bg-brandOrange" />
      <div className="text-[11px] tracking-[0.1em] uppercase text-brandOrangeSoft font-bold mb-2.5">{eyebrow}</div>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <p className="text-[17px] leading-relaxed text-white/95 font-medium max-w-[680px]">{headline}</p>
        {amount && (
          <div className="text-right shrink-0">
            <div className="font-head text-[42px] leading-none text-white">{amount}</div>
            {hasDelta && (
              <div className={`text-[13px] font-medium mt-1.5 ${up ? "text-good" : "text-critical"}`}>
                {up ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% {deltaLabel}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
