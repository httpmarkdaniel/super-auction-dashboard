import { retail } from "../theme";

// Small "Weekly / MTD" inline toggle next to a section heading —
// light-gray pill, solid blue when active, matching the new modern-
// dashboard palette (see theme.js).
export default function ToggleSm({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg p-[3px]" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="text-[11.5px] font-semibold px-3 py-1 rounded-md whitespace-nowrap transition-colors"
            style={active ? { background: retail.blue, color: "#ffffff" } : { background: "transparent", color: retail.ink2 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
