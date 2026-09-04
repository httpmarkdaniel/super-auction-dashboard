import { useEffect, useState } from "react";

// Shared compact filter controls used by both Auction Result and Vendor
// Analysis' Vendor Summary section (both scope xv3.mart_auction_vendor_
// analysis by the same Branch/Vendor/Auction Number/From/To/BDM shape).
// Extracted here when Vendor Summary moved into Vendor Analysis so the
// two never drift into two different-looking filter bars.

export function FilterSelect({ label, value, onChange, options, allLabel, disabled }) {
  return (
    <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="text-[14px] font-medium text-ink bg-transparent outline-none cursor-pointer max-w-[150px]"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// Free-text exact-match filter, not a dropdown — auction_number has 10,772
// distinct values on this table (verified against real data), far too
// many for a usable <select>. Commits on blur/Enter only, never per
// keystroke, so typing doesn't trigger a fetch on every character.
export function AuctionNumberFilter({ value, onChange }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== value) onChange(trimmed);
  }

  return (
    <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">Auction #</span>
      <input
        type="text"
        value={draft}
        placeholder="All Auctions"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        className="text-[14px] font-medium text-ink bg-transparent outline-none w-[110px] placeholder:text-muted placeholder:font-normal"
      />
    </div>
  );
}

// From/To — both bound to v.end_date server-side; `to` is inclusive at
// the calendar-day level (see api/overview.js's buildAuctionResultFilter
// / api/leaderboards.js's type=vendor-financial-summary).
export function FromToFilter({ from, to, onFromChange, onToChange }) {
  return (
    <>
      <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">From</span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className="text-[14px] font-medium text-ink bg-transparent outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold shrink-0">To</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className="text-[14px] font-medium text-ink bg-transparent outline-none"
        />
      </div>
    </>
  );
}
