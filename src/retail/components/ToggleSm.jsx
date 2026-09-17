import { retail } from "../theme";

// Small "Weekly / MTD" (or similar 2-3 option) inline toggle — every tab
// in the reference report has one of these next to its own section
// heading (e.g. "Weekly (WoW)" / "MTD"), independent of a global date
// filter. `options`: [{ key, label }].
export default function ToggleSm({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-md p-0.5" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded whitespace-nowrap transition-colors"
            style={active ? { background: retail.surface, color: retail.accentText, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { background: "transparent", color: retail.ink2 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
