import { retail } from "../theme";
import { NAV_GROUPS } from "../nav";

// Gradient navy sidebar — matches
// public/HRH_Retail_Dashboard_Modern_Layout.html's own .sidebar exactly
// (gradient navy, rounded-pill nav items, footer tagline), replacing the
// horizontal TabBar from the previous pass. The mockup's sidebar carries
// generic multi-app nav (Dashboard/Products/Inventory/Promotions/...) —
// this one carries our REAL 8 tabs instead, since those other "sections"
// don't exist as separate modules here.
const TABS = NAV_GROUPS.flatMap((g) => g.items);
const TAB_ICONS = {
  salesOverview: "🏠",
  trend: "📈",
  storePerformance: "🏬",
  salesChannel: "🛍️",
  footTraffic: "🚶",
  customerSegments: "👥",
  topProducts: "🏷️",
  stocks: "📦",
  methodology: "📝",
};

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside
      className="w-[230px] shrink-0 sticky top-0 h-screen overflow-y-auto px-[18px] py-[22px] relative"
      style={{ background: `linear-gradient(180deg, ${retail.navy} 0%, ${retail.navy2} 100%)`, color: "#ffffff", boxShadow: "6px 0 20px rgba(10,40,80,.12)" }}
    >
      <a href="/" className="text-[11px] inline-flex items-center gap-1 mb-4" style={{ color: "#d4e2f7" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Analytics Home
      </a>
      <div className="mb-6">
        <h1 className="m-0 text-[22px] font-extrabold tracking-[0.2px]">HRH Online</h1>
        <span className="block mt-1 text-[11px] uppercase tracking-[2px]" style={{ color: "#d4e2f7" }}>
          Retail Analytics
        </span>
      </div>
      <nav className="grid gap-2.5">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              className="text-left px-3.5 py-3 rounded-xl flex items-center gap-2.5 font-semibold text-[13.5px] transition-colors"
              style={{ background: isActive ? "rgba(255,255,255,0.12)" : "transparent", color: isActive ? "#ffffff" : "#dbe8f8" }}
            >
              <span>{TAB_ICONS[tab.key]}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>
      <div className="absolute bottom-[18px] left-[18px] right-[18px] text-[12px] leading-[1.6] uppercase tracking-[3px]" style={{ color: "#d4e2f7" }}>
        Sell smarter
        <br />
        Move faster
      </div>
    </aside>
  );
}
