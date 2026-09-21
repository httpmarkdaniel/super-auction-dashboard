import { retail } from "../theme";
import SegmentToggle from "./SegmentToggle";
import DateRangePicker from "./DateRangePicker";
import StoreSelect from "./StoreSelect";

// White topbar — matches the mockup's own .topbar exactly (white bg,
// border-bottom, title left, filter chips + live indicator right),
// replacing the dark navy header banner from the previous pass. All/
// Retail/Wholesale segment toggle + Date Range + Store drill-down all
// live here, dashboard-wide, same pattern as HRH Online's own Header —
// every page reads filters.segment/dateRange/store. "Live Data" is a
// real claim, not decorative — every page here queries ClickHouse fresh
// on load, nothing is cached or pre-computed.
export default function Header({ segment, onSegmentChange, dateRange, onDateRangeChange, store, onStoreChange, storeOptions }) {
  const now = new Date();
  const lastUpdated = now.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 md:px-6 py-3.5 flex-wrap" style={{ background: retail.surface, borderBottom: `1px solid ${retail.border}` }}>
      <div>
        <h2 className="m-0 text-[22px] font-bold" style={{ color: retail.ink }}>
          Retail Dashboard
        </h2>
        <p className="mt-1.5 mb-0" style={{ color: retail.muted }}>
          Sales, foot traffic, and customers — All Stores, Retail, and Wholesale in one view.
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap justify-end">
        <SegmentToggle value={segment} onChange={onSegmentChange} />
        <StoreSelect value={store} onChange={onStoreChange} stores={storeOptions} />
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        <div className="text-right">
          <div className="flex items-center gap-2 font-bold text-[13px]" style={{ color: retail.ink }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: retail.good, boxShadow: "0 0 0 6px rgba(22,163,74,.12)" }} />
            Live Data
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: retail.muted }}>
            Last updated {lastUpdated}
          </div>
        </div>
      </div>
    </div>
  );
}
