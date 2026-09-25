import SegmentToggle from "./SegmentToggle";
import DateRangePicker from "./DateRangePicker";
import StoreSelect from "./StoreSelect";

// Retail topbar — "LIVE DASHBOARD UNIFORM FORMAT" layout (src/uniform.css):
// title block on the left, then the dashboard-wide filters (All/Retail/
// Wholesale segment, Store, Date Range) and the Live Data badge. Same
// controls and state as before. "Live Data" is a real claim — every page
// queries ClickHouse fresh on load, nothing is cached or pre-computed.
export default function Header({ segment, onSegmentChange, dateRange, onDateRangeChange, store, onStoreChange, storeOptions }) {
  const now = new Date();
  const lastUpdated = now.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <header className="uf-topbar">
      <div className="uf-top-title">
        <strong>Retail Dashboard</strong>
        <small>Last updated {lastUpdated}</small>
      </div>
      <div className="flex-1" />
      <SegmentToggle value={segment} onChange={onSegmentChange} />
      <StoreSelect value={store} onChange={onStoreChange} stores={storeOptions} />
      <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      <span className="uf-live">LIVE DATA</span>
    </header>
  );
}
