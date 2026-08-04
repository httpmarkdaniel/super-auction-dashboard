import { useEffect, useState } from "react";
import { ALL_STORES } from "../mockData";
import SearchBar from "./SearchBar";
import { formatCompactPeso } from "../utils/format";
import { RANGE_PRESETS, resolveDateRange } from "../utils/dateRange";

function StoreChip({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 shrink-0">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0">
        <path d="M3 9.5 12 3l9 6.5V21H3z" strokeLinejoin="round" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[12.5px] font-semibold text-ink bg-transparent outline-none cursor-pointer max-w-[120px]"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = RANGE_PRESETS.find((p) => p.key === value) ?? RANGE_PRESETS[2];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="hidden xl:flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 text-[12.5px] font-medium text-ink"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {current.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted shrink-0">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 floating py-1.5 z-30">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange(p.key);
                setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-1.5 text-[12.5px] hover:bg-gridline/50 ${
                p.key === value ? "text-navy font-semibold" : "text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveDataBadge() {
  return (
    <div className="hidden md:flex items-center gap-1.5 bg-toneGreenBg text-toneGreenText rounded-md px-2 h-6 text-[10.5px] font-bold tracking-wide shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-toneGreenText pulse-dot" />
      LIVE DATA
    </div>
  );
}

function IconButton({ title, onClick, children, spinning }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center w-8 h-8 rounded-lg border border-gridline text-ink hover:bg-plane transition-colors shrink-0"
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
      </svg>
    </IconButton>
  );
}

function getSystemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function DarkModeToggle() {
  const [isDark, setIsDark] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    return saved ? saved === "dark" : getSystemPrefersDark();
  });

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.dataset.theme = saved;
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <IconButton title={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </IconButton>
  );
}

function ExportButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden sm:flex items-center gap-1.5 border border-gridline rounded-lg px-3 h-8 text-[12.5px] font-semibold text-ink hover:bg-plane transition-colors shrink-0"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
      </svg>
      Export
    </button>
  );
}

function UserBadge() {
  return (
    <div className="hidden sm:flex items-center gap-1.5 bg-plane rounded-full pl-1 pr-2.5 h-8 shrink-0">
      <div className="w-6 h-6 rounded-full bg-brandNavyDeep text-white text-[10px] font-bold flex items-center justify-center shrink-0">
        A
      </div>
      <span className="text-[12px] font-semibold text-ink whitespace-nowrap">admin</span>
    </div>
  );
}

const TONE_DOT = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  info: "bg-navy",
};

function TickerItem({ tone = "good", children }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink whitespace-nowrap shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
      {children}
    </span>
  );
}

function AlertTicker({ items }) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="flex items-stretch bg-surface1 border-b border-gridline">
      <div className="flex items-center gap-1.5 pl-4 pr-3 py-1.5 shrink-0 bg-critical">
        <span className="w-1.5 h-1.5 rounded-full bg-white pulse-dot" />
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-white whitespace-nowrap">Live Alerts</span>
      </div>
      <div className="marquee-viewport flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-8 px-4 py-1.5 w-max marquee-track">
          {doubled.map((item, i) => (
            <TickerItem key={i} tone={item.tone}>
              {item.node}
            </TickerItem>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildActivityItems({
  store,
  recentSold,
  topVendor,
  unsoldCount,
  unsoldValue,
  unsoldDeltaPct,
  aboveReserve,
  belowReserve,
}) {
  const storeLabel = store === ALL_STORES ? "ALL STORES" : store;
  const items = [];

  if (topVendor) {
    items.push({
      tone: "good",
      node: (
        <>
          {storeLabel}: {topVendor.vendor} leads today's consignors with {formatCompactPeso(topVendor.bidAmount)} in sales
        </>
      ),
    });
  }

  if (aboveReserve) {
    items.push({
      tone: "good",
      node: (
        <>
          {aboveReserve.count} lots sold above reserve ({aboveReserve.pct}%), fetching {formatCompactPeso(aboveReserve.value)}
        </>
      ),
    });
  }

  if (belowReserve) {
    items.push({
      tone: "warning",
      node: (
        <>
          {belowReserve.count} lots went below reserve ({belowReserve.pct}%), totaling {formatCompactPeso(belowReserve.value)}
        </>
      ),
    });
  }

  recentSold.forEach((lot) => {
    items.push({
      tone: "info",
      node: (
        <>
          Lot {lot.lotNumber} just sold for {formatCompactPeso(lot.soldPrice)} {lot.store ? `· ${lot.store}` : ""}
        </>
      ),
    });
  });

  items.push({
    tone: "critical",
    node: (
      <>
        {unsoldCount} lots remain unsold, worth {formatCompactPeso(unsoldValue)}
        {unsoldDeltaPct !== undefined ? ` (${unsoldDeltaPct >= 0 ? "+" : ""}${unsoldDeltaPct}%)` : ""}
      </>
    ),
  });

  return items;
}

export default function Topbar({
  store,
  onStoreChange,
  onExportClick,
  onMenuClick,
  unsoldCount,
  unsoldValue,
  unsoldDeltaPct,
  recentSold,
  topVendor,
  aboveReserve,
  belowReserve,
  searchPool,
  dateRange,
  onDateRangeChange,
  storeOptions,
  updatedAt,
  onRefresh,
}) {
  const activityItems = buildActivityItems({
    store,
    recentSold,
    topVendor,
    unsoldCount,
    unsoldValue,
    unsoldDeltaPct,
    aboveReserve,
    belowReserve,
  });

  return (
    <div className="flex flex-col w-full bg-surface1 border-b border-gridline">
      <div className="flex items-center gap-3 px-4 md:px-6 h-16">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-gridline text-ink shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>

        <div className="hidden md:block shrink-0 leading-tight">
          <div className="text-[13px] font-bold text-ink">HMR Auctions</div>
          <div className="text-[11px] text-muted mt-0.5 whitespace-nowrap">Updated {updatedAt}</div>
        </div>

        <SearchBar pool={searchPool} />

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          <StoreChip value={store} onChange={onStoreChange} options={storeOptions} />
          <LiveDataBadge />
          <ExportButton onClick={onExportClick} />
          <RefreshButton onRefresh={onRefresh} />
          <DarkModeToggle />
          <UserBadge />
          <IconButton title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </IconButton>
        </div>
      </div>

      <AlertTicker items={activityItems} />
    </div>
  );
}
