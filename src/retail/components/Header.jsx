import { retail } from "../theme";
import SegmentToggle from "./SegmentToggle";

// Dashboard-wide filter bar — just the All/Retail/Wholesale segment
// toggle (see segments.js). No global Date Range control: every tab below
// has its own Weekly/MTD toggle instead (matching the reference report's
// own per-section toggle pattern), since "This Week vs Last Week" and
// "MTD vs Last Month" are fixed, well-defined comparisons here, not a
// free-form range picker.
export default function Header({ segment, onSegmentChange }) {
  return (
    <div style={{ background: retail.surface, borderBottom: `1px solid ${retail.border}` }}>
      <div className="px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold" style={{ color: retail.ink }}>
            Retail
          </h1>
          <p className="text-[12.5px]" style={{ color: retail.ink2 }}>
            Store Performance Dashboard
          </p>
        </div>
        <SegmentToggle value={segment} onChange={onSegmentChange} />
      </div>
    </div>
  );
}
