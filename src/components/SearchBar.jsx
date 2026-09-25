import { useEffect, useMemo, useRef, useState } from "react";

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
  const inputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
    <div className="uf-search-wrap relative">
      {/* Reference .search pill (src/uniform.css); Ctrl/⌘ K focuses it. */}
      <label className="uf-search">
        ⌕
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Search orders, lots, vendors"
        />
        <span className="uf-key hidden sm:inline">Ctrl K</span>
      </label>

      {showPanel && (
        <div className="absolute left-0 right-0 mt-1.5 floating py-1.5 z-20 max-h-[320px] overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-3.5 py-2.5 text-[15.5px] text-muted">No lots or auctions match "{query}"</div>
          ) : (
            matches.map((r) => (
              <div key={r.lotNumber + r.primary} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-gridline/50">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[r.status] || "bg-muted"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15.5px] tabular text-ink truncate">{r.lotNumber}</div>
                  <div className="text-[14px] text-ink truncate">
                    {r.primary} · {r.secondary}
                  </div>
                </div>
                <span className="text-[13.5px] text-muted shrink-0">{r.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
