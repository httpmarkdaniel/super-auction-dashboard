import { retail } from "../theme";
import { SEGMENT_OPTIONS } from "../segments";

// All / Retail / Wholesale — matches the reference report's own
// .toggle-group exactly: a translucent-white pill on the dark navy
// header, gold when active (not HRH Online's white-surface/orange-solid
// ChannelPills look).
export default function SegmentToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-md p-[3px]" style={{ background: "rgba(255,255,255,0.12)" }}>
      {SEGMENT_OPTIONS.map((seg) => {
        const active = seg.key === value;
        return (
          <button
            key={seg.key}
            type="button"
            onClick={() => onChange(seg.key)}
            className="text-[12px] font-semibold px-3.5 py-1.5 rounded transition-colors"
            style={active ? { background: retail.gold, color: retail.navy } : { background: "transparent", color: "#c9d6e8" }}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
