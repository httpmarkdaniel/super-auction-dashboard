import { useEffect, useRef, useState } from "react";
import { PRESETS, presetRange, rangeLabel } from "./period";

// Period picker for the Marketing dashboard — the reference's topbar
// "▣ date" .control button, opening a small card with presets + a custom
// from/to. Value shape: see period.js.

export default function DateFilter({ value, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const ref = useRef(null);

  useEffect(() => {
    setFrom(value.from);
    setTo(value.to);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function applyCustom() {
    if (!from || !to) return;
    const a = from <= to ? from : to;
    const b = from <= to ? to : from;
    onChange({ key: "custom", from: a, to: b });
    setOpen(false);
  }

  const short = value.key === "all" ? "All time" : PRESETS.find((p) => p.key === value.key)?.label || `${value.from} to ${value.to}`;

  return (
    <div className={`datefilter ${className}`} ref={ref}>
      <button type="button" className="control" onClick={() => setOpen((o) => !o)} title={rangeLabel(value)}>
        ▣ {short}
      </button>
      {open && (
        <div className="datefilter-card card">
          <div className="datefilter-presets">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`pill-btn${value.key === p.key ? " active" : ""}`}
                onClick={() => {
                  onChange(presetRange(p.key));
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="datefilter-custom">
            <small>Custom range</small>
            <div className="datefilter-inputs">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              <span className="sub">to</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              <button type="button" className="control" disabled={!from || !to} onClick={applyCustom}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
