import { useEffect, useMemo, useRef, useState } from "react";
import { retail } from "../../retail/theme";
import { formatMonth } from "../api";

// Multi-store picker with search. `stores` is the caStores list
// ([{ store, customers, lastSale }]); stores with no sale in the last 60
// days are tagged "closed" with their last sale month, since closed
// branches (Fairview, Novaliches, ...) are exactly what all-time customer
// questions tend to be about.
export default function StoreMultiSelect({ stores, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().slice(0, 10);
  }, []);

  const filtered = stores.filter((s) => s.store.toLowerCase().includes(q.toLowerCase()));
  const selected = new Set(value);

  function toggle(store) {
    onChange(selected.has(store) ? value.filter((s) => s !== store) : [...value, store]);
  }

  const label = value.length === 0 ? "All Stores" : value.length <= 2 ? value.join(" + ") : `${value.length} stores selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-[13px] font-semibold px-3.5 h-10 rounded-xl max-w-[320px]"
        style={open ? { background: retail.blue, color: "#fff", border: `1px solid ${retail.blue}` } : { background: retail.bg, color: retail.ink2, border: `1px solid ${retail.border}` }}
      >
        <span className="truncate">{label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-[320px] max-w-[calc(100vw-32px)] rounded-xl p-2 shadow-lg" style={{ background: retail.surface, border: `1px solid ${retail.border}` }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stores…"
            className="w-full text-[13px] px-3 h-9 rounded-lg outline-none mb-2"
            style={{ background: retail.bg, border: `1px solid ${retail.border}`, color: retail.ink }}
          />
          <div className="max-h-[300px] overflow-y-auto">
            {filtered.map((s) => {
              const closed = s.lastSale < cutoff;
              return (
                <label key={s.store} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-black/[0.03] text-[12.5px]" style={{ color: retail.ink }}>
                  <input type="checkbox" checked={selected.has(s.store)} onChange={() => toggle(s.store)} />
                  <span className="truncate">{s.store}</span>
                  <span className="ml-auto shrink-0 text-[11px]" style={{ color: retail.muted }}>
                    {closed ? `closed · ${formatMonth(s.lastSale)}` : `${s.customers.toLocaleString("en-PH")}`}
                  </span>
                </label>
              );
            })}
          </div>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full mt-2 text-[12px] font-semibold py-1.5 rounded-md" style={{ color: retail.blueDark, background: retail.bg }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
