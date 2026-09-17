import { retail } from "../theme";
import { SEGMENT_OPTIONS } from "../segments";

const FILTER_FONT = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" };

// All / Retail / Wholesale — the dashboard-wide segment filter (replaces
// the earlier per-store dropdown), same pill-button pattern as
// src/hrh-online/components/ChannelPills.jsx. See segments.js for what
// each segment actually includes.
export default function SegmentToggle({ value, onChange }) {
  return (
    <div className="flex flex-nowrap gap-2.5">
      {SEGMENT_OPTIONS.map((seg) => {
        const active = seg.key === value;
        return (
          <button
            key={seg.key}
            type="button"
            onClick={() => onChange(seg.key)}
            className="text-[17px] px-5 h-11 rounded-md whitespace-nowrap transition-all duration-150 hover:scale-[1.04]"
            style={
              active
                ? { ...FILTER_FONT, background: retail.accent, color: "#ffffff", border: `1px solid ${retail.accent}`, boxShadow: "0 2px 10px rgba(235,104,52,0.4)" }
                : { ...FILTER_FONT, background: retail.surface, color: retail.ink2, border: `1px solid ${retail.border}` }
            }
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
