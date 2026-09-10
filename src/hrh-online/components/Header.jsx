import { hrh } from "../theme";
import DateRangePicker from "./DateRangePicker";
import ChannelPills from "./ChannelPills";

// Dashboard-wide filter bar — Date Range (WTD/MTD/YTD/Custom) + Channel,
// shown identically on every HRH Online page (originally Product
// Analytics-only; lifted here so the whole dashboard shares one filter).
// Product Analytics refetches its real API on change; other (still mock)
// pages that have a channel dimension filter their existing rows by it —
// see each page's own comment.
export default function Header({ channel, onChannelChange, dateRange, onDateRangeChange }) {
  return (
    <div style={{ background: hrh.surface, borderBottom: `1px solid ${hrh.border}` }}>
      <div className="px-5 md:px-6 py-3.5 grid grid-cols-1 md:grid-cols-3 items-center gap-3">
        <div>
          <h1 className="text-[19px] font-bold" style={{ color: hrh.ink }}>
            HRH Online
          </h1>
          <p className="text-[12.5px]" style={{ color: hrh.ink2 }}>
            Executive Commerce Dashboard
          </p>
        </div>
        <div className="flex justify-center">
          <ChannelPills value={channel} onChange={onChannelChange} />
        </div>
        <div className="flex justify-end">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </div>
      </div>
    </div>
  );
}
