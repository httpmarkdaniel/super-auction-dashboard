import { retail } from "../theme";
import { SEGMENT_OPTIONS } from "../segments";

// All / Retail / Wholesale — styled as a light "chip" group matching the
// mockup's own .chip/.select look (white bg, thin border), now that it
// sits on a white topbar instead of a dark header.
export default function SegmentToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-xl p-1 gap-1" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
      {SEGMENT_OPTIONS.map((seg) => {
        const active = seg.key === value;
        return (
          <button
            key={seg.key}
            type="button"
            onClick={() => onChange(seg.key)}
            className="text-[13px] font-semibold px-3.5 py-2 rounded-lg transition-colors"
            style={active ? { background: retail.blue, color: "#ffffff" } : { background: "transparent", color: retail.ink2 }}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
