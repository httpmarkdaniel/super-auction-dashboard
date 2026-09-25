import { forwardRef, useEffect, useRef, useState } from "react";

const LEVEL_CLASS = { Department: "st-blue", Category: "st-green", Subcategory: "st-amber" };

// Department / category / subcategory search box with a suggestion
// dropdown (api report=caCategorySuggest). Typing = broad text search;
// picking a suggestion (click, or ↑/↓ + Enter) = exact filter on that one
// name at that level. `pick` is the current { level, value } or null.
// `variant` "top" renders inside the reference's .search label (topbar),
// "row" as a plain filter-row input.
const CategorySearch = forwardRef(function CategorySearch({ text, onText, pick, onPick, fetchSuggestions, variant = "row", placeholder }, ref) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Debounced lookup; skipped while a picked value is showing.
  useEffect(() => {
    const t = text.trim();
    if (!t || pick) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetchSuggestions(t, controller.signal)
        .then((s) => {
          setItems(s);
          setActive(-1);
        })
        .catch(() => {})
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, pick, fetchSuggestions]);

  function choose(item) {
    onPick(item);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        choose(items[active]);
      } else setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const input = (
    <input
      ref={ref}
      value={text}
      onChange={(e) => {
        onText(e.target.value);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoComplete="off"
    />
  );

  const showList = open && !pick && text.trim() !== "";

  return (
    <div className={`suggest-box${variant === "top" ? " suggest-top" : ""}`} ref={boxRef}>
      {variant === "top" ? (
        <label className="search">
          ⌕ {input}
          {pick ? <PickTag pick={pick} onClear={() => onText("")} /> : <span className="key">Ctrl K</span>}
        </label>
      ) : (
        <div className="suggest-row">
          {input}
          {pick && <PickTag pick={pick} onClear={() => onText("")} />}
        </div>
      )}
      {showList && (
        <div className="suggest-list">
          {loading && items.length === 0 && <div className="suggest-empty">Searching…</div>}
          {!loading && items.length === 0 && <div className="suggest-empty">No department, category or subcategory matches “{text.trim()}”</div>}
          {items.length > 0 && (
            <div className="suggest-hint">
              Pick one for that exact {""}
              <b>department / category / subcategory</b>, or press Enter to search all three for “{text.trim()}”
            </div>
          )}
          {items.map((it, i) => (
            <button
              key={`${it.level}|${it.value}`}
              type="button"
              className={`suggest-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(it)}
            >
              <span className={`status ${LEVEL_CLASS[it.level]}`}>{it.level}</span>
              <span className="suggest-value">{it.value}</span>
              <span className="sub">~{it.customers.toLocaleString("en-PH")} customers</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function PickTag({ pick, onClear }) {
  return (
    <span className={`status ${LEVEL_CLASS[pick.level]} suggest-pick`} title={`Exact ${pick.level.toLowerCase()} match`}>
      {pick.level}
      <button type="button" aria-label="Clear" onClick={onClear}>
        ✕
      </button>
    </span>
  );
}

export default CategorySearch;
