import { hrh } from "../theme";
import { CHANNEL_OPTIONS } from "../mock/filterOptions";

// Shared channel selector — pill buttons for All Channels/HMRPH Online/
// TikTok/Shopee. Originally page-local to Product Analytics; now the
// dashboard-wide channel filter shown in Header, so every HRH Online page
// (real or mock) reads/sets the same value. Sticks to HMR's white/orange/
// blue triad: white for the inactive/neutral state, blue for "selected" —
// orange is reserved for the Date Range control next to it, so the two
// filters read as visually distinct at a glance.
export default function ChannelPills({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHANNEL_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="text-[13.5px] font-semibold px-4 h-10 rounded-md whitespace-nowrap transition-all duration-150 hover:scale-[1.04]"
            style={
              active
                ? { background: hrh.blue, color: "#ffffff", border: `1px solid ${hrh.blue}`, boxShadow: "0 2px 10px rgba(63,121,209,0.4)" }
                : { background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
