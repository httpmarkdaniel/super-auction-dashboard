import { retail } from "../theme";

// In-page sub-tab strip — the same underline-tab pattern Orders &
// Fulfillment introduced (Fulfillment/Cancellation/Returns/Methodology),
// now shared so any Retail page can split its content the same way
// without duplicating the markup. `tabs`: [{ key, label }].
export default function SubTabNav({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1.5 mb-4 border-b overflow-x-auto" style={{ borderColor: retail.border }}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="text-[14px] px-3.5 py-3 -mb-px whitespace-nowrap shrink-0"
            style={
              active
                ? { color: retail.ink, fontWeight: 750, borderBottom: "2px solid #0e1b39" }
                : { color: "#8994a7", fontWeight: 750, borderBottom: "2px solid transparent" }
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
