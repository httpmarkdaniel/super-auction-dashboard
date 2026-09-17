import { retail } from "../theme";

// Small "Weekly / MTD" inline toggle next to a section heading — matches
// the reference report's own .toggle-group-sm exactly (light gray pill,
// solid navy when active), independent of a global date filter.
export default function ToggleSm({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-md p-[3px]" style={{ background: retail.border }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="text-[11.5px] font-semibold px-3 py-1 rounded whitespace-nowrap transition-colors"
            style={active ? { background: retail.navy, color: "#ffffff" } : { background: "transparent", color: retail.ink2 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
