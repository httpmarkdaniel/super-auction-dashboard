import { NAV_GROUPS, OPERATIONAL_FLAGS_KEY } from "../nav";

// HRH Online sidebar — "LIVE DASHBOARD UNIFORM FORMAT" layout (see
// src/uniform.css), same as the Auction sidebar: brand block, uppercase
// group titles, glyph + label nav items with the outlined active state,
// and the status footer. Same groups, items and page keys as before.
const ICONS = {
  overview: "▦",
  sales: "◈",
  traffic: "⌁",
  customers: "◉",
  productAnalytics: "▤",
  barcodeAnalytics: "⬡",
  fulfillment: "▱",
  returnsCancellation: "⊗",
  weeklyBusinessReview: "▥",
  campaignCalendar: "◷",
  [OPERATIONAL_FLAGS_KEY]: "⚠",
};

function NavItem({ itemKey, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={active ? "active" : ""}>
      <span className="uf-nav-ico">{ICONS[itemKey] || "•"}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function Sidebar({ active, onNavigate, channel }) {
  return (
    <aside className="uf-sidebar shrink-0 sticky top-0 overflow-y-auto print:hidden">
      <div className="uf-brand">
        <div className="uf-brandmark">🛍️</div>
        <div>
          <strong>HRH Online</strong>
          <small>Executive Commerce Dashboard</small>
        </div>
      </div>

      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="uf-nav-title">{g.label}</div>
          <nav className="uf-nav">
            {g.items.map((it) => (
              <NavItem key={it.key} itemKey={it.key} label={it.label} active={active === it.key} onClick={() => onNavigate(it.key)} />
            ))}
          </nav>
        </div>
      ))}

      <div className="uf-nav-title">Monitoring</div>
      <nav className="uf-nav">
        <NavItem
          itemKey={OPERATIONAL_FLAGS_KEY}
          label="Operational Flags"
          active={active === OPERATIONAL_FLAGS_KEY}
          onClick={() => onNavigate(OPERATIONAL_FLAGS_KEY)}
        />
      </nav>

      <div className="uf-nav-title">HMR Analytics</div>
      <nav className="uf-nav">
        <a href="/">
          <span className="uf-nav-ico">⌂</span>Analytics Home
        </a>
      </nav>

      <div className="uf-branch-status">
        <span className="uf-dot pulse-dot" />
        <div className="min-w-0">
          <div className="truncate text-[14px]">{channel || "All Channels"}</div>
          <div className="uf-sub">Synced - Online</div>
        </div>
      </div>
    </aside>
  );
}
