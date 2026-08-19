import logo from "../assets/auctions-logo.png";

// Real top-level item categories from ClickHouse (ranked by all-time bid
// value), replacing what used to be a hardcoded mock list that didn't
// match the real taxonomy at all.
const CATEGORY_TABS = ["AUTOMOTIVE", "GENERAL MERCHANDISE", "VEHICLE", "INDUSTRIAL"];

function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left pl-3 pr-3 py-2 rounded-lg text-[15.5px] leading-tight transition-colors border-l-2 ${
        active
          ? "bg-navySoft text-navy font-medium border-l-navy"
          : "text-ink border-l-transparent hover:bg-plane hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

// One dropdown instead of one nav row per category — saves 3 rows of
// vertical space in the sidebar, reinvested into a bigger nav font size
// elsewhere rather than every category getting its own full-width button.
function CategoryDropdown({ active, onChange }) {
  const isActive = CATEGORY_TABS.includes(active);
  return (
    <div
      className={`flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg border-l-2 ${
        isActive ? "bg-navySoft border-l-navy" : "border-l-transparent bg-plane"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 ${isActive ? "text-navy" : "text-muted"}`}>
        <path d="M3 8l9-5 9 5-9 5-9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
      </svg>
      <select
        value={isActive ? active : ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={`flex-1 min-w-0 text-[15.5px] bg-transparent outline-none cursor-pointer ${
          isActive ? "text-navy font-medium" : "text-ink"
        }`}
      >
        <option value="" disabled>
          Select category…
        </option>
        {CATEGORY_TABS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function NavGroup({ label, children }) {
  return (
    <div className="mb-1">
      <div className="px-3 pt-3.5 pb-1.5 text-[12.5px] tracking-[0.08em] uppercase text-muted font-semibold">
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
        className={`w-[220px] shrink-0 h-screen fixed md:sticky top-0 left-0 z-50 bg-surface1 border-r border-gridline px-3 py-3 flex flex-col overflow-y-auto transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-3 mb-3">
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
          <CategoryDropdown active={active} onChange={go} />
        </NavGroup>

        <NavGroup label="Insights">
          <NavItem label="Vendor Payables" active={active === "Vendor Payables"} onClick={() => go("Vendor Payables")} />
          <NavItem label="Full Auction Detail" active={active === "Full Auction Detail"} onClick={() => go("Full Auction Detail")} />
          <NavItem label="Bidding Pace" active={active === "Bidding Pace"} onClick={() => go("Bidding Pace")} />
          <NavItem label="Revenue Breakdown" active={active === "Revenue Breakdown"} onClick={() => go("Revenue Breakdown")} />
        </NavGroup>

        <NavGroup label="Reports">
          <NavItem label="Export" active={active === "Export"} onClick={() => go("Export")} />
        </NavGroup>

        <div className="mt-3 px-3 pt-3.5 border-t border-gridline flex items-center gap-2 text-[14px] text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot" />
          Connected
        </div>
      </aside>
    </>
  );
}

export { CATEGORY_TABS };
