import { retail } from "../../retail/theme";
import { NAV_ITEMS } from "../nav";

// Same gradient-navy sidebar as Retail's (src/retail/components/
// Sidebar.jsx), with this module's own title and pages.
export default function Sidebar({ active, onNavigate }) {
  return (
    <aside
      className="hidden md:block w-[230px] shrink-0 sticky top-0 h-screen overflow-y-auto px-[18px] py-[22px] relative"
      style={{ background: `linear-gradient(180deg, ${retail.navy} 0%, ${retail.navy2} 100%)`, color: "#ffffff", boxShadow: "6px 0 20px rgba(10,40,80,.12)" }}
    >
      <a href="/" className="text-[11px] inline-flex items-center gap-1 mb-4" style={{ color: "#d4e2f7" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Analytics Home
      </a>
      <div className="mb-6">
        <h1 className="m-0 text-[22px] font-extrabold tracking-[0.2px]">Customers</h1>
        <span className="block mt-1 text-[11px] uppercase tracking-[2px]" style={{ color: "#d4e2f7" }}>
          Customer Analytics
        </span>
      </div>
      <nav className="grid gap-2.5">
        {NAV_ITEMS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              className="text-left px-3.5 py-3 rounded-xl flex items-center gap-2.5 font-semibold text-[13.5px] transition-colors"
              style={{ background: isActive ? "rgba(255,255,255,0.12)" : "transparent", color: isActive ? "#ffffff" : "#dbe8f8" }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// Phones get a horizontal tab strip instead of the sidebar.
export function MobileNav({ active, onNavigate }) {
  return (
    <div className="md:hidden flex gap-1.5 overflow-x-auto px-4 pt-3">
      {NAV_ITEMS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onNavigate(tab.key)}
          className="shrink-0 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg"
          style={active === tab.key ? { background: retail.navy, color: "#fff" } : { background: retail.surface, color: retail.ink2, border: `1px solid ${retail.border}` }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
