import { hrh } from "../theme";
import { CHANNEL_OPTIONS } from "../mock/filterOptions";

// Shared channel selector — pill buttons for All Channels/HMRPH Online/
// TikTok/Shopee. Originally page-local to Product Analytics; now the
// dashboard-wide channel filter shown in Header, so every HRH Online page
// (real or mock) reads/sets the same value. White for the inactive/neutral
// state, orange for "selected" — same accent as the Date Range control.
const FILTER_FONT = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" };

export default function ChannelPills({ value, onChange }) {
  return (
    <div className="flex flex-nowrap gap-2.5">
      {CHANNEL_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="text-[17px] px-5 h-11 rounded-md whitespace-nowrap transition-all duration-150 hover:scale-[1.04]"
            style={
              active
                ? { ...FILTER_FONT, background: hrh.accent, color: "#ffffff", border: `1px solid ${hrh.accent}`, boxShadow: "0 2px 10px rgba(235,104,52,0.4)" }
                : { ...FILTER_FONT, background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
