import { retail } from "../theme";

// Single-store drill-down, layered on top of the existing Segment
// (All/Retail/Wholesale) filter rather than replacing it — `stores` is
// whichever store list the CURRENT segment already resolves to (see
// segments.js), so switching segment also updates which individual
// stores are choosable here, and a segment/store combination can never
// contradict itself (e.g. picking a Retail-only store while segment is
// Wholesale). "" means no drill-down — every store in the segment, same
// as before this filter existed.
export default function StoreSelect({ value, onChange, stores }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[13px] font-semibold px-3 h-10 rounded-xl outline-none"
      style={{ background: retail.bg, color: retail.ink2, border: `1px solid ${retail.border}` }}
    >
      <option value="">All Stores</option>
      {stores.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
