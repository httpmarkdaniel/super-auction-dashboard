import { retail } from "../theme";
import { SEGMENT_OPTIONS } from "../segments";

// All / Retail / Wholesale — the uniform format's .pill-btn group (white,
// thin border; selected = darker border + soft fill).
export default function SegmentToggle({ value, onChange }) {
  return (
    <div className="inline-flex gap-2">
      {SEGMENT_OPTIONS.map((seg) => {
        const active = seg.key === value;
        return (
          <button
            key={seg.key}
            type="button"
            onClick={() => onChange(seg.key)}
            className="text-[14px] px-3 py-[9px] rounded-lg whitespace-nowrap"
            style={
              active
                ? { background: "#f2f5fa", color: retail.ink, border: "1px solid #51617e", fontWeight: 650 }
                : { background: retail.surface, color: retail.ink, border: `1px solid ${retail.border}` }
            }
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
