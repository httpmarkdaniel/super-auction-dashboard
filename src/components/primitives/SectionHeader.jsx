// A section header that leads with the "so what", not just a chart-type label —
// the narrative beat this group of visuals exists to support. Styled as the
// "LIVE DASHBOARD UNIFORM FORMAT" section heading (bold title, muted one-line
// description underneath).
export default function SectionHeader({ title, insight }) {
  return (
    <div className="mb-3.5">
      <h2 className="text-[18px] leading-tight font-extrabold text-ink tracking-[-0.2px]">{title}</h2>
      {insight && <p className="text-[12.5px] mt-1" style={{ color: "#8692a6" }}>{insight}</p>}
    </div>
  );
}
