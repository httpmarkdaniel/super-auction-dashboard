import { hrh } from "../theme";
import { NAV_GROUPS, OPERATIONAL_FLAGS_KEY } from "../nav";

function NavItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left pl-3 pr-3 py-1.5 rounded-md text-[13.5px] leading-tight transition-colors border-l-2"
      style={{
        color: active ? "#ffffff" : "#a3adba",
        background: active ? hrh.navyAccentRow : "transparent",
        borderLeftColor: active ? hrh.accent : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ children }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10.5px] tracking-[0.08em] uppercase font-semibold" style={{ color: "#5f7093" }}>
      {children}
    </div>
  );
}

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside
      className="w-[228px] shrink-0 h-screen sticky top-0 flex flex-col overflow-y-auto"
      style={{ background: hrh.navy, borderRight: `1px solid ${hrh.navyBorder}` }}
    >
      <div className="px-3 pt-3 pb-2">
        <a
          href="/"
          className="text-[11.5px] inline-flex items-center gap-1 hover:text-white transition-colors"
          style={{ color: "#7e93c2" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Analytics Home
        </a>
      </div>

      <div className="px-3 pb-2.5" style={{ borderBottom: `1px solid ${hrh.navyBorder}` }}>
        <div className="text-[15px] font-bold text-white">HRH Online</div>
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

      <div className="px-2 pb-3 pt-2" style={{ borderTop: `1px solid ${hrh.navyBorder}` }}>
        <NavItem
          label="Operational Flags"
          active={active === OPERATIONAL_FLAGS_KEY}
          onClick={() => onNavigate(OPERATIONAL_FLAGS_KEY)}
        />
      </div>
    </aside>
  );
}
