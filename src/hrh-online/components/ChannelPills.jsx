import { hrh } from "../theme";
import { CHANNEL_OPTIONS } from "../mock/filterOptions";

// Shared channel selector — pill buttons for All Channels/HMRPH Online/
// TikTok/Shopee. Originally page-local to Product Analytics; now the
// dashboard-wide channel filter shown in Header, so every HRH Online page
// (real or mock) reads/sets the same value.
export default function ChannelPills({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHANNEL_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="text-[13px] font-semibold px-3.5 h-9 rounded-md whitespace-nowrap transition-all duration-150 hover:scale-[1.04]"
            style={
              active
                ? { background: hrh.accent, color: "#ffffff", border: `1px solid ${hrh.accent}`, boxShadow: "0 2px 10px rgba(217,154,61,0.4)" }
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
