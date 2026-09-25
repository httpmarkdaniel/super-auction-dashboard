import logo from "../assets/auctions-logo.png";

// Auction sidebar — "LIVE DASHBOARD UNIFORM FORMAT" layout (see
// src/uniform.css): brand block, uppercase group titles, glyph + label nav
// items with the reference's outlined active state, count badge, and the
// branch/connection status pinned to the bottom. Same destinations and tab
// keys as before; only the chrome changed.

function NavItem({ label, icon, active, onClick, badge, badgeDark }) {
  return (
    <button type="button" onClick={onClick} className={active ? "active" : ""}>
      <span className="uf-nav-ico">{icon}</span>
      <span className="truncate">{label}</span>
      {badge !== undefined && badge !== null && <span className={`uf-badge${badgeDark ? " dark" : ""}`}>{badge}</span>}
    </button>
  );
}

// Nav groups — tab keys are the App's `tab` values (some differ from the
// visible label, e.g. "Online Bidding" = Active Auctions, "Vendor Summary"
// = Vendor Analysis in Reports). Bidding Pace, Revenue Breakdown and
// Export stay reachable only from inside other views, as before.
const GROUPS = [
  {
    title: "Dashboard",
    items: [
      { key: "Overview", label: "Overview", icon: "▦" },
      { key: "Online Bidding", label: "Active Auctions", icon: "◉", badgeKey: "activeAuctions" },
      { key: "Upcoming Auctions", label: "Upcoming Auctions", icon: "◷" },
      { key: "Full Auction Detail", label: "Full Auction Detail", icon: "▤" },
      { key: "Bidder Analytics", label: "Bidder Analytics", icon: "⌁" },
      { key: "Vendor Analytics", label: "Vendor Analytics", icon: "◈" },
      { key: "Vendor Payables", label: "Vendor Payables", icon: "▱" },
    ],
  },
  {
    title: "Reports",
    items: [
      { key: "Vendor Summary", label: "Vendor Analysis", icon: "▥" },
      { key: "Auction Result", label: "Auction Result", icon: "⬡" },
    ],
  },
  {
    title: "Monitoring",
    items: [{ key: "Operational Flags", label: "Operational Flags", icon: "⚠" }],
  },
];

export default function Sidebar({ active, onChange, onLogoClick, open, onClose, badges = {}, store }) {
  const go = (value) => {
    onChange(value);
    onClose();
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      <aside
        className={`uf-sidebar shrink-0 fixed md:sticky top-0 left-0 overflow-y-auto transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          className="uf-brand text-left w-full"
          title="Return to Overview"
          onClick={() => {
            onLogoClick();
            onClose();
          }}
        >
          <img src={logo} alt="HMR Auctions" className="uf-brand-logo" />
        </button>

        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="uf-nav-title">{g.title}</div>
            <nav className="uf-nav">
              {g.items.map((it) => (
                <NavItem
                  key={it.key}
                  label={it.label}
                  icon={it.icon}
                  active={active === it.key}
                  onClick={() => go(it.key)}
                  badge={it.badgeKey ? badges[it.badgeKey] : undefined}
                  badgeDark={it.badgeKey === "activeAuctions"}
                />
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
            <div className="truncate text-[14px]">{store || "All Stores"}</div>
            <div className="uf-sub uf-mono">Synced - Online</div>
          </div>
        </div>
      </aside>
    </>
  );
}
