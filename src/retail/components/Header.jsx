import { retail } from "../theme";
import DateRangePicker from "./DateRangePicker";
import StoreSelect from "./StoreSelect";
import { STORE_FILTER_OPTIONS } from "../stores";

// Dashboard-wide filter bar — Date Range + Store, shown on every Retail
// page. Same layout convention as src/hrh-online/components/Header.jsx,
// with a Store dropdown (11 real stores) in place of Channel pills (see
// StoreSelect.jsx for why a dropdown instead of pills here).
export default function Header({ store, onStoreChange, dateRange, onDateRangeChange }) {
  return (
    <div style={{ background: retail.surface, borderBottom: `1px solid ${retail.border}` }}>
      <div className="relative px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold" style={{ color: retail.ink }}>
            Retail
          </h1>
          <p className="text-[12.5px]" style={{ color: retail.ink2 }}>
            Store Performance Dashboard
          </p>
        </div>
        <div className="order-3 w-full flex justify-center md:order-none md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">
          <StoreSelect value={store} onChange={onStoreChange} options={STORE_FILTER_OPTIONS} />
        </div>
        <div className="mr-0 md:mr-10 lg:mr-20">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </div>
      </div>
    </div>
  );
}
