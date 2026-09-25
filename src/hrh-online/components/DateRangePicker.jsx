import { useEffect, useRef, useState } from "react";
import { RANGE_PRESETS, resolveDateRange } from "../dateRange";
import { hrh } from "../theme";


// Same button+popover interaction as the Auction Dashboard's DateRangePicker
// (src/components/Topbar.jsx), but its OWN forked ../dateRange.js preset/
// comparison logic (not the shared ../../utils/dateRange.js) — HRH Online
// has 3 extra presets (Previous Week/Month/Year) that Auction's own date
// picker doesn't and shouldn't get, so this is a deliberate fork, not an
// accidental divergence. Button styled as the uniform format's topbar
// .control (src/uniform.css). `value` is either a preset key
// ("wtd"/"mtd"/"ytd"/"prevWeek"/"prevMonth"/"prevYear") or
// { key: "custom", from, to }.
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
      <button type="button" onClick={() => setOpen((o) => !o)} className="uf-control">
        ▣ {current.label}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-64 rounded-md py-2 z-30"
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
                className="w-full text-left px-4 py-2 text-[14px] transition-colors duration-150"
                style={{
                  color: hrh.ink,
                  fontWeight: selected ? 650 : 400,
                  background: selected ? "#edf2fa" : "transparent",
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
              className="w-full text-center text-[14px] rounded-lg px-2 py-2 disabled:opacity-40"
              style={{ background: "#0e1b39", color: "#ffffff", fontWeight: 650 }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
