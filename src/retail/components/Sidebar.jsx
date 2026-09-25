import { NAV_GROUPS } from "../nav";

// Retail sidebar — "LIVE DASHBOARD UNIFORM FORMAT" layout (see
// src/uniform.css), same as the Auction and HRH Online sidebars: brand
// block, group title, glyph + label nav items with the outlined active
// state, and the status footer. Same pages and keys as before.
const TAB_ICONS = {
  salesOverview: "▦",
  trend: "⌁",
  storePerformance: "▤",
  salesChannel: "◈",
  footTraffic: "◉",
  customerSegments: "▥",
  topProducts: "⬡",
  stocks: "▱",
  methodology: "◷",
};

export default function Sidebar({ active, onNavigate, store, segmentLabel }) {
  return (
    <aside className="uf-sidebar shrink-0 sticky top-0 overflow-y-auto">
      <div className="uf-brand">
        <div className="uf-brandmark">🏬</div>
        <div>
          <strong>HRH Online</strong>
          <small>Retail Analytics</small>
        </div>
      </div>

      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="uf-nav-title">{g.label}</div>
          <nav className="uf-nav">
            {g.items.map((tab) => (
              <button key={tab.key} type="button" onClick={() => onNavigate(tab.key)} className={active === tab.key ? "active" : ""}>
                <span className="uf-nav-ico">{TAB_ICONS[tab.key] || "•"}</span>
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      ))}

      <div className="uf-nav-title">HMR Analytics</div>
      <nav className="uf-nav">
        <a href="/">
          <span className="uf-nav-ico">⌂</span>Analytics Home
        </a>
      </nav>

      <div className="uf-branch-status">
        <span className="uf-dot pulse-dot" />
        <div className="min-w-0">
          <div className="truncate text-[14px]">{store || `${segmentLabel || "All"} · All Stores`}</div>
          <div className="uf-sub">Synced - Online</div>
        </div>
      </div>
    </aside>
  );
}
