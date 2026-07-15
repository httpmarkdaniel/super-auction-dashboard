// A section header that leads with the "so what", not just a chart-type label —
// the narrative beat this group of visuals exists to support.
export default function SectionHeader({ title, insight }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-4 rounded-sm bg-brandOrange shrink-0" />
        <h2 className="text-[15px] font-semibold text-series1 tracking-tight">{title}</h2>
      </div>
      {insight && <p className="text-[13px] text-ink2 mt-1 ml-4">{insight}</p>}
    </div>
  );
}
