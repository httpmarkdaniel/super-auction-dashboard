import { retail } from "../theme";
import { NAV_GROUPS } from "../nav";

// White sidebar, same look as src/hrh-online/components/Sidebar.jsx and
// the Auction dashboard's own Sidebar.jsx.
function NavItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left pl-3 pr-3 py-1.5 rounded-md text-[13.5px] leading-tight transition-colors border-l-2 font-sans"
      style={{
        color: active ? retail.navy : retail.ink2,
        background: active ? retail.accentSoft : "transparent",
        borderLeftColor: active ? retail.accent : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ children }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10.5px] tracking-[0.08em] uppercase font-semibold font-sans" style={{ color: retail.muted }}>
      {children}
    </div>
  );
}

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside
      className="w-[228px] shrink-0 h-screen sticky top-0 flex flex-col overflow-y-auto font-sans"
      style={{ background: retail.surface, borderRight: `1px solid ${retail.border}` }}
    >
      <div className="px-3 pt-3 pb-2">
        <a href="/" className="text-[11.5px] inline-flex items-center gap-1 hover:text-[#111827] transition-colors" style={{ color: retail.muted }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Analytics Home
        </a>
      </div>

      <div className="px-3 pb-2.5" style={{ borderBottom: `1px solid ${retail.border}` }}>
        <div className="text-[15px] font-bold" style={{ color: retail.ink }}>
          Retail
        </div>
      </div>

      <div className="flex-1 px-2 pb-2">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-1">
            <GroupLabel>{g.label}</GroupLabel>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavItem key={it.key} label={it.label} active={active === it.key} onClick={() => onNavigate(it.key)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
