import { useEffect, useRef, useState } from "react";
import SearchBar from "./SearchBar";
import { RANGE_PRESETS, resolveDateRange } from "../utils/dateRange";

function StoreChip({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="uf-control uf-hide-sm" title="Store">
      {options.map((s) => (
        <option key={s} value={s}>
          ⌂ {s}
        </option>
      ))}
    </select>
  );
}

export function DateRangePicker({ value, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const current = resolveDateRange(value);
  const isCustom = Boolean(value && typeof value === "object" && value.key === "custom");

  const [draftFrom, setDraftFrom] = useState(current.from ?? "");
  const [draftTo, setDraftTo] = useState(current.to ?? "");

  // Keep the draft inputs in sync whenever the selection changes from
  // outside this popover (e.g. a preset button click resets the range).
  useEffect(() => {
    const r = resolveDateRange(value);
    setDraftFrom(r.from ?? "");
    setDraftTo(r.to ?? "");
  }, [value]);

  // Click-outside rather than onBlur+timeout — the native <input type="date">
  // popup calendar steals focus from the toggle button, which would trip a
  // blur-based close before the user finishes picking a date.
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
    <div className={`relative shrink-0 ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="uf-control"
      >
        ▣ {current.label}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-64 floating py-2 z-30">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange(p.key);
                setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-1.5 text-[15px] hover:bg-gridline/50 ${
                !isCustom && p.key === value ? "text-navy font-semibold" : "text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}

          <div className="border-t border-gridline mt-1.5 pt-2.5 px-3.5 pb-1">
            <div className="text-[13px] tracking-[0.06em] uppercase text-muted font-semibold mb-2">Custom Range</div>
            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="flex-1 min-w-0 text-[14.5px] bg-surface1 border border-gridline rounded-md px-1.5 py-1 text-ink"
              />
              <span className="text-muted text-[13.5px] shrink-0">to</span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                className="flex-1 min-w-0 text-[14.5px] bg-surface1 border border-gridline rounded-md px-1.5 py-1 text-ink"
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo}
              className="w-full text-center bg-navy text-white text-[14.5px] font-semibold rounded-md px-2 py-1.5 disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveDataBadge() {
  return <span className="uf-live">LIVE DATA</span>;
}

function IconButton({ title, onClick, children, spinning }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="uf-icon-btn"
    >
      <span className={spinning ? "animate-spin" : ""}>{children}</span>
    </button>
  );
}

function RefreshButton({ onRefresh }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <IconButton
      title="Refresh"
      spinning={spinning}
      onClick={() => {
        onRefresh?.();
        setSpinning(true);
        setTimeout(() => setSpinning(false), 600);
      }}
    >
      ↻
    </IconButton>
  );
}

function ExportButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uf-control"
    >
      ⇩ Export
    </button>
  );
}

function UserBadge() {
  return <span className="uf-userpill uf-mono">admin - admin</span>;
}

export default function Topbar({
  store,
  onStoreChange,
  onExportClick,
  onMenuClick,
  searchPool,
  dateRange,
  onDateRangeChange,
  hideFilters = false,
  storeOptions,
  updatedAt,
  onRefresh,
}) {
  return (
    <header className="uf-topbar">
      <button type="button" onClick={onMenuClick} aria-label="Open menu" className="uf-icon-btn md:hidden">
        ☰
      </button>

      <div className="uf-top-title">
        <strong>HMR Auctions</strong>
        <small className="uf-mono">Updated {updatedAt}</small>
      </div>

      <SearchBar pool={searchPool} />

      {/* Auction Result / Vendor Analysis own their own filter bars and
          don't read the dashboard's global Store/Date-range state, so these
          two controls are hidden there rather than shown but disconnected. */}
      {!hideFilters && <DateRangePicker value={dateRange} onChange={onDateRangeChange} className="uf-hide-sm" />}
      {!hideFilters && <StoreChip value={store} onChange={onStoreChange} options={storeOptions} />}
      <LiveDataBadge />
      <ExportButton onClick={onExportClick} />
      <RefreshButton onRefresh={onRefresh} />
      <UserBadge />
      <IconButton title="Sign out">↪</IconButton>
    </header>
  );
}
