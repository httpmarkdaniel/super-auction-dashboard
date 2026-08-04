import logo from "../assets/auctions-logo.png";

// Real top-level item categories from ClickHouse (ranked by all-time bid
// value), replacing what used to be a hardcoded mock list that didn't
// match the real taxonomy at all.
const CATEGORY_TABS = ["AUTOMOTIVE", "GENERAL MERCHANDISE", "VEHICLE", "INDUSTRIAL"];

function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left pl-3 pr-3 py-2 rounded-lg text-[13.5px] transition-colors border-l-2 ${
        active
          ? "bg-navySoft text-navy font-medium border-l-navy"
          : "text-ink border-l-transparent hover:bg-plane hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function NavGroup({ label, children }) {
  return (
    <div className="mb-1">
      <div className="px-3 pt-4 pb-1.5 text-[11px] tracking-[0.08em] uppercase text-muted font-semibold">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function Sidebar({ active, onChange, onLogoClick, open, onClose }) {
  const go = (value) => {
    onChange(value);
    onClose();
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      <aside
        className={`w-[220px] shrink-0 h-screen fixed md:sticky top-0 left-0 z-50 bg-surface1 border-r border-gridline px-3 py-5 flex flex-col transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-3 mb-4">
          <button
            type="button"
            onClick={() => {
              onLogoClick();
              onClose();
            }}
            title="Return to Overview"
            className="bg-white border border-gridline rounded-xl px-3 py-3.5 w-full flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            <img src={logo} alt="HMR Auctions" className="w-full h-auto max-w-[160px] object-contain" />
          </button>
        </div>

        <NavGroup label="Dashboard">
          <NavItem label="Overview" active={active === "Overview"} onClick={() => go("Overview")} />
          <NavItem label="Online Bidding" active={active === "Online Bidding"} onClick={() => go("Online Bidding")} />
          <NavItem
            label="Upcoming Auctions"
            active={active === "Upcoming Auctions"}
            onClick={() => go("Upcoming Auctions")}
          />
        </NavGroup>

        <NavGroup label="Categories">
          {CATEGORY_TABS.map((c) => (
            <NavItem key={c} label={c} active={active === c} onClick={() => go(c)} />
          ))}
        </NavGroup>

        <NavGroup label="Insights">
          <NavItem label="Trends" active={active === "Trends"} onClick={() => go("Trends")} />
          <NavItem label="Auction Types" active={active === "Auction Types"} onClick={() => go("Auction Types")} />
          <NavItem label="Stores" active={active === "Stores"} onClick={() => go("Stores")} />
        </NavGroup>

        <NavGroup label="Reports">
          <NavItem label="Export" active={active === "Export"} onClick={() => go("Export")} />
        </NavGroup>

        <div className="mt-4 px-3 pt-4 border-t border-gridline flex items-center gap-2 text-[11.5px] text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot" />
          Connected
        </div>
      </aside>
    </>
  );
}

export { CATEGORY_TABS };
