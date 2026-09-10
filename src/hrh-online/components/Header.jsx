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
      <div className="relative px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold" style={{ color: hrh.ink }}>
            HRH Online
          </h1>
          <p className="text-[12.5px]" style={{ color: hrh.ink2 }}>
            Executive Commerce Dashboard
          </p>
        </div>
        {/* True horizontal center of the header, on one row, regardless of
            how wide the title/date-range siblings are — a grid column would
            constrain this to a third of the header's width and force the
            4 pills to wrap (Shopee falling to its own line); absolute
            positioning lets it size to its own content instead. Falls back
            to a normal centered block (own row, below title/date) on
            narrow screens where there's no room to float it independently. */}
        <div className="order-3 w-full flex justify-center md:order-none md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">
          <ChannelPills value={channel} onChange={onChannelChange} />
        </div>
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      </div>
    </div>
  );
}
