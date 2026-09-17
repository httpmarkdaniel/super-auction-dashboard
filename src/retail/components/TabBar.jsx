import { retail } from "../theme";
import { NAV_GROUPS } from "../nav";

// Horizontal sticky tab bar — replaces the left Sidebar every other module
// (HRH Online, Auction) uses, per explicit "make Retail feel different"
// request (2026-09-17). Matches the reference report's own .tabbar exactly
// (dark navy, gold underline on the active tab) rather than reusing the
// white-sidebar-with-accent-pill pattern.
const TABS = NAV_GROUPS.flatMap((g) => g.items);

export default function TabBar({ active, onNavigate }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap" style={{ background: retail.navyDark, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onNavigate(tab.key)}
            className="flex-1 min-w-[105px] text-center px-2 py-3 text-[12px] font-semibold transition-colors"
            style={{
              color: isActive ? "#ffffff" : "#c9d6e8",
              background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
              borderBottom: `3px solid ${isActive ? retail.gold : "transparent"}`,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
