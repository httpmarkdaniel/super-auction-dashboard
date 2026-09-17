import { retail } from "../theme";

const FILTER_FONT = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" };

// Store filter — a dropdown rather than ChannelPills-style buttons (see
// src/hrh-online/components/ChannelPills.jsx) because there are 11 real
// stores plus "All Stores" here, not a small fixed set of channels; a row
// of 12 pills wouldn't fit the header. `options` is the real store list
// from RETAIL_STORES (see nav.js/pages), always led by "All Stores".
export default function StoreSelect({ value, onChange, options }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-[15px] pl-4 pr-9 h-11 rounded-md whitespace-nowrap cursor-pointer"
        style={{ ...FILTER_FONT, background: retail.surface, color: retail.ink2, border: `1px solid ${retail.border}` }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: retail.ink2 }}
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
