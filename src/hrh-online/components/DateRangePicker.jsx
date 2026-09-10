import { useEffect, useRef, useState } from "react";
import { RANGE_PRESETS, resolveDateRange } from "../../utils/dateRange";
import { hrh } from "../theme";

const FILTER_FONT = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" };

// Same button+popover interaction as the Auction Dashboard's DateRangePicker
// (src/components/Topbar.jsx) and the SAME shared ../../utils/dateRange.js
// preset/comparison logic — not a parallel date-range implementation,
// just restyled with HRH Online's own fixed dark-navy palette (this module
// has its own chrome, independent of Auction's light/dark theme toggle;
// see theme.js). `value` is either a preset key ("wtd"/"mtd"/"ytd") or
// { key: "custom", from, to } — identical shape to Auction's own usage.
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
        className="flex items-center gap-2 text-[17px] px-5 h-11 rounded-md whitespace-nowrap transition-all duration-150 hover:scale-[1.03]"
        style={
          open
            ? { ...FILTER_FONT, background: hrh.accentSoft, color: hrh.accentText, border: `1px solid ${hrh.accent}`, boxShadow: "0 2px 10px rgba(235,104,52,0.25)" }
            : { ...FILTER_FONT, background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {current.label}
        <svg
          width="12"
          height="12"
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
          className="absolute left-0 mt-1.5 w-64 rounded-md py-2 z-30"
          style={{ background: hrh.surface, border: `1px solid ${hrh.border}`, boxShadow: "0 4px 16px rgba(15,22,34,.12)" }}
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
                className="w-full text-left px-4 py-2 text-[16px] transition-colors duration-150"
                style={{
                  ...FILTER_FONT,
                  color: selected ? hrh.accentText : hrh.ink,
                  background: selected ? hrh.accentSoft : "transparent",
                }}
              >
                {p.label}
              </button>
            );
          })}

          <div className="mt-1.5 pt-2.5 px-3.5 pb-1" style={{ borderTop: `1px solid ${hrh.border}` }}>
            <div className="text-[11px] tracking-[0.06em] uppercase font-semibold mb-2" style={{ color: hrh.muted }}>
              Custom Range
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="flex-1 min-w-0 text-[13px] rounded-md px-1.5 py-1"
                style={{ background: hrh.bg, border: `1px solid ${hrh.border}`, color: hrh.ink }}
              />
              <span className="text-[12.5px] shrink-0" style={{ color: hrh.muted }}>
                to
              </span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                className="flex-1 min-w-0 text-[13px] rounded-md px-1.5 py-1"
                style={{ background: hrh.bg, border: `1px solid ${hrh.border}`, color: hrh.ink }}
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo}
              className="w-full text-center text-[16px] rounded-md px-2 py-2 disabled:opacity-40 transition-transform duration-150 hover:scale-[1.02]"
              style={{ ...FILTER_FONT, background: hrh.accent, color: "#ffffff" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
