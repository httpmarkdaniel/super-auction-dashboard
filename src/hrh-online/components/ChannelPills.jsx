import { hrh } from "../theme";
import { CHANNEL_OPTIONS } from "../mock/filterOptions";

// Shared channel selector — pill buttons for All Channels/HMRPH Online/
// TikTok/Shopee. Originally page-local to Product Analytics; now the
// dashboard-wide channel filter shown in Header, so every HRH Online page
// (real or mock) reads/sets the same value. Styled as the uniform format's
// .pill-btn (white, thin border; selected = darker border + soft fill).

export default function ChannelPills({ value, onChange }) {
  return (
    <div className="flex flex-nowrap gap-2">
      {CHANNEL_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="text-[14px] px-3 py-[9px] rounded-lg whitespace-nowrap"
            style={
              active
                ? { background: "#f2f5fa", color: hrh.ink, border: "1px solid #51617e", fontWeight: 650 }
                : { background: hrh.surface, color: hrh.ink, border: `1px solid ${hrh.border}` }
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
