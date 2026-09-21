import { useEffect, useRef, useState } from "react";
import { RANGE_PRESETS, resolveDateRange } from "../dateRange";
import { retail } from "../theme";

// Same button+popover interaction as HRH Online's own DateRangePicker
// (../hrh-online/components/DateRangePicker.jsx), restyled with Retail's
// own light/blue "modern SaaS dashboard" chrome instead of HRH's fixed
// dark-navy palette — this module has its own chrome, independent of any
// other dashboard's theme. `value` is either a preset key ("wtd"/"mtd"/
// "ytd"/"prevWeek"/"prevMonth"/"prevYear") or { key: "custom", from, to }.
export default function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const current = resolveDateRange(value);
  const isCustom = Boolean(value && typeof value === "object" && value.key === "custom");

  const [draftFrom, setDraftFrom] = useState(current.from ?? "");
  const [draftTo, setDraftTo] = useState(current.to ?? "");

  useEffect(() => {
    const r = resolveDateRange(value);
    setDraftFrom(r.from ?? "");
    setDraftTo(r.to ?? "");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function applyCustom() {
    if (!draftFrom || !draftTo) return;
    const from = draftFrom <= draftTo ? draftFrom : draftTo;
    const to = draftFrom <= draftTo ? draftTo : draftFrom;
    onChange({ key: "custom", from, to });
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-[13px] font-semibold px-3.5 h-10 rounded-xl whitespace-nowrap transition-colors"
        style={
          open
            ? { background: retail.blue, color: "#ffffff", border: `1px solid ${retail.blue}` }
            : { background: retail.bg, color: retail.ink2, border: `1px solid ${retail.border}` }
        }
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {current.label}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-64 rounded-xl py-2 z-30"
          style={{ background: retail.surface, border: `1px solid ${retail.border}`, boxShadow: retail.shadow }}
        >
          {RANGE_PRESETS.map((p) => {
            const selected = !isCustom && p.key === value;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange(p.key);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-[13px] font-medium transition-colors"
                style={{
                  color: selected ? "#ffffff" : retail.ink,
                  background: selected ? retail.blue : "transparent",
                }}
              >
                {p.label}
              </button>
            );
          })}

          <div className="mt-1.5 pt-2.5 px-3.5 pb-1" style={{ borderTop: `1px solid ${retail.border}` }}>
            <div className="text-[11px] tracking-[0.06em] uppercase font-semibold mb-2" style={{ color: retail.muted }}>
              Custom Range
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="flex-1 min-w-0 text-[13px] rounded-md px-1.5 py-1"
                style={{ background: retail.bg, border: `1px solid ${retail.border}`, color: retail.ink }}
              />
              <span className="text-[12.5px] shrink-0" style={{ color: retail.muted }}>
                to
              </span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                className="flex-1 min-w-0 text-[13px] rounded-md px-1.5 py-1"
                style={{ background: retail.bg, border: `1px solid ${retail.border}`, color: retail.ink }}
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo}
              className="w-full text-center text-[13px] font-semibold rounded-md px-2 py-2 disabled:opacity-40 transition-colors"
              style={{ background: retail.blue, color: "#ffffff" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
