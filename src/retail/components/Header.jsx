import { retail } from "../theme";
import SegmentToggle from "./SegmentToggle";

// Dark navy header banner — matches the reference report's own .header
// exactly (navy bg, white title, light-blue subtitle), rather than HRH
// Online's white header bar. All/Retail/Wholesale segment toggle lives
// here as a translucent pill (reference's .toggle-group), gold when
// active. No global Date Range control — every tab has its own Weekly/MTD
// toggle instead.
export default function Header({ segment, onSegmentChange }) {
  return (
    <div style={{ background: retail.navy, color: "#ffffff" }}>
      <div className="px-5 md:px-6 pt-2.5">
        <a href="/" className="text-[11px] inline-flex items-center gap-1 transition-colors" style={{ color: "#c9d6e8" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Analytics Home
        </a>
      </div>
      <div className="px-5 md:px-6 pb-4 pt-1.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold m-0">📊 Retail Sales Report</h1>
          <p className="text-[12.5px] mt-1" style={{ color: "#c9d6e8" }}>
            Net of Returns · Retail includes HRH Online
          </p>
        </div>
        <SegmentToggle value={segment} onChange={onSegmentChange} />
      </div>
    </div>
  );
}
