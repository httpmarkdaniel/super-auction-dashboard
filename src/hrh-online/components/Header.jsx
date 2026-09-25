import DateRangePicker from "./DateRangePicker";
import ChannelPills from "./ChannelPills";

// Dashboard-wide filter bar — Date Range (WTD/MTD/YTD/Custom) + Channel,
// shown identically on every HRH Online page, now laid out as the
// "LIVE DASHBOARD UNIFORM FORMAT" topbar (src/uniform.css): title block on
// the left, filters to the right.
//
// `hideChannelFilter` (Traffic & Conversion and other non-sales-channel
// pages): the global Channel filter is a SALES-channel concept (HMRPH
// Online/TikTok/Shopee) with no mapping to e.g. GA4's acquisition
// channels, so it's hidden rather than shown but silently ignored.
// `hideDateRange` (Interactive Calendar only): the calendar has its own
// month navigation, so the dashboard date range would do nothing there.
export default function Header({ channel, onChannelChange, dateRange, onDateRangeChange, hideChannelFilter = false, hideDateRange = false }) {
  return (
    <header className="uf-topbar print:hidden">
      <div className="uf-top-title">
        <strong>HRH Online</strong>
        <small>Executive Commerce Dashboard</small>
      </div>
      <div className="flex-1" />
      {!hideChannelFilter && <ChannelPills value={channel} onChange={onChannelChange} />}
      {!hideDateRange && <DateRangePicker value={dateRange} onChange={onDateRangeChange} />}
    </header>
  );
}
