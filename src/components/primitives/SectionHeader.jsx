// A section header that leads with the "so what", not just a chart-type label —
// the narrative beat this group of visuals exists to support.
export default function SectionHeader({ title, insight }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-5 rounded-sm bg-navy shrink-0" />
        <h2 className="font-bold text-[22px] leading-none uppercase tracking-wide text-series1">{title}</h2>
      </div>
      {insight && <p className="text-[13px] text-ink mt-1 ml-4">{insight}</p>}
    </div>
  );
}
