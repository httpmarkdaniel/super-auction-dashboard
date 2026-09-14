import { hrh } from "../theme";

// In-page sub-tab strip — the same underline-tab pattern Orders &
// Fulfillment introduced (Fulfillment/Cancellation/Returns/Methodology),
// now shared so any HRH Online page can split its content the same way
// without duplicating the markup. `tabs`: [{ key, label }].
export default function SubTabNav({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1.5 mb-4 border-b overflow-x-auto" style={{ borderColor: hrh.border }}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="text-[12.5px] font-semibold px-3.5 py-2 -mb-px whitespace-nowrap shrink-0"
            style={
              active
                ? { color: hrh.accentText, borderBottom: `2px solid ${hrh.accent}` }
                : { color: hrh.ink2, borderBottom: "2px solid transparent" }
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
