import { useMemo, useState } from "react";

const STATUS_DOT = {
  Sold: "bg-good",
  Active: "bg-good",
  "For Approval": "bg-warning",
  "Closing Soon": "bg-warning",
  Unsold: "bg-critical",
};

export default function SearchBar({ pool }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pool
      .filter(
        (r) =>
          r.lotNumber.toLowerCase().includes(q) ||
          r.primary.toLowerCase().includes(q) ||
          r.secondary.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query, pool]);

  const showPanel = focused && query.trim().length > 0;

  return (
    <div className="relative w-full max-w-[360px]">
      <div className="flex items-center gap-2 bg-surface1 border border-gridline rounded-lg px-3 h-9 focus-within:border-navy">
        <span className="text-muted text-[13px]">⌕</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Search orders, lots, vendors…"
          className="flex-1 min-w-0 text-[13px] text-ink bg-transparent outline-none placeholder:text-muted"
        />
        <span className="hidden sm:inline-flex items-center text-[10px] text-muted border border-gridline rounded px-1.5 py-0.5 shrink-0">
          Ctrl K
        </span>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 mt-1.5 floating py-1.5 z-20 max-h-[320px] overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-3.5 py-2.5 text-[13px] text-muted">No lots or auctions match "{query}"</div>
          ) : (
            matches.map((r) => (
              <div key={r.lotNumber + r.primary} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-gridline/50">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[r.status] || "bg-muted"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] tabular text-ink truncate">{r.lotNumber}</div>
                  <div className="text-[11.5px] text-ink truncate">
                    {r.primary} · {r.secondary}
                  </div>
                </div>
                <span className="text-[11px] text-muted shrink-0">{r.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
