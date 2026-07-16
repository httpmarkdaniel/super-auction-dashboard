import logo from "../assets/auctions-logo.png";

const CATEGORY_TABS = [
  "General Merchandise",
  "Bulk Auction",
  "Equipment & Industrial",
  "Vehicles & Automotive",
];

function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left pl-3 pr-3 py-2 rounded-lg text-[13.5px] transition-colors border-l-2 ${
        active
          ? "bg-white/10 text-brandOrangeSoft font-medium border-l-brandOrange"
          : "text-white/65 border-l-transparent hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function NavGroup({ label, children }) {
  return (
    <div className="mb-1">
      <div className="px-3 pt-4 pb-1.5 text-[11px] tracking-[0.08em] uppercase text-white/35 font-semibold">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="w-[220px] shrink-0 h-screen sticky top-0 bg-brandNavyDeep px-3 py-5 flex flex-col">
      <div className="px-3 mb-4">
        <div className="bg-white rounded-xl px-3 py-3.5 w-full flex items-center justify-center">
          <img src={logo} alt="HMR Auctions" className="w-full h-auto max-w-[160px] object-contain" />
        </div>
      </div>

      <NavGroup label="Dashboard">
        <NavItem label="Overview" active={active === "Overview"} onClick={() => onChange("Overview")} />
        <NavItem label="Online Bidding" active={active === "Online Bidding"} onClick={() => onChange("Online Bidding")} />
      </NavGroup>

      <NavGroup label="Categories">
        {CATEGORY_TABS.map((c) => (
          <NavItem key={c} label={c} active={active === c} onClick={() => onChange(c)} />
        ))}
      </NavGroup>

      <NavGroup label="Insights">
        <NavItem label="Trends" active={active === "Trends"} onClick={() => onChange("Trends")} />
        <NavItem label="Auction Types" active={active === "Auction Types"} onClick={() => onChange("Auction Types")} />
        <NavItem label="Stores" active={active === "Stores"} onClick={() => onChange("Stores")} />
      </NavGroup>

      <NavGroup label="Reports">
        <NavItem label="Export" active={active === "Export"} onClick={() => onChange("Export")} />
      </NavGroup>

      <div className="mt-4 px-3 pt-4 border-t border-white/10 flex items-center gap-2 text-[11.5px] text-white/50">
        <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot" />
        Connected
      </div>
    </aside>
  );
}

export { CATEGORY_TABS };
