import { hrh } from "../theme";
import { DATE_PRESETS, CHANNEL_OPTIONS, STORE_OPTIONS } from "../mock/filterOptions";

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[13px] font-medium bg-white rounded-md px-2.5 h-8 outline-none cursor-pointer"
      style={{ border: `1px solid ${hrh.border}`, color: hrh.ink }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// Global filter bar — UI-only. Channel is wired to filter mock rows where a
// page's table/breakdown already has a channel dimension (see each page's
// own comment); Date Range/Store are visual-only placeholders until real
// APIs land, deliberately not faking a date-driven recompute of mock data.
export default function Header({ filters, onFilterChange }) {
  return (
    <div style={{ background: hrh.surface, borderBottom: `1px solid ${hrh.border}` }}>
      <div className="px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold" style={{ color: hrh.ink }}>
            HRH Online
          </h1>
          <p className="text-[12.5px]" style={{ color: hrh.ink2 }}>
            Executive Commerce Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterSelect value={filters.dateRange} onChange={(v) => onFilterChange("dateRange", v)} options={DATE_PRESETS} />
          <FilterSelect value={filters.channel} onChange={(v) => onFilterChange("channel", v)} options={CHANNEL_OPTIONS} />
          <FilterSelect value={filters.store} onChange={(v) => onFilterChange("store", v)} options={STORE_OPTIONS} />
        </div>
      </div>
    </div>
  );
}
