import { hrh } from "../theme";
import { NAV_GROUPS, OPERATIONAL_FLAGS_KEY } from "../nav";

// White sidebar (bg-surface1-equivalent) + plain body font, matching the
// Auction dashboard's own Sidebar.jsx exactly — the dark-navy-chrome
// treatment this used to have was HRH Online's own original design, but
// per explicit request this one chrome element now follows Auction's
// sidebar look instead of the rest of HRH Online's fixed dark/light-canvas
// identity (see theme.js's top comment).
function NavItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left pl-3 pr-3 py-1.5 rounded-md text-[13.5px] leading-tight transition-colors border-l-2 font-sans"
      style={{
        color: active ? hrh.navy : hrh.ink2,
        background: active ? hrh.accentSoft : "transparent",
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
    <div
      className="px-3 pt-3 pb-1 text-[10.5px] tracking-[0.08em] uppercase font-semibold font-sans"
      style={{ color: hrh.muted }}
    >
      {children}
    </div>
  );
}

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside
      className="w-[228px] shrink-0 h-screen sticky top-0 flex flex-col overflow-y-auto font-sans"
      style={{ background: hrh.surface, borderRight: `1px solid ${hrh.border}` }}
    >
      <div className="px-3 pt-3 pb-2">
        <a
          href="/"
          className="text-[11.5px] inline-flex items-center gap-1 hover:text-[#111827] transition-colors"
          style={{ color: hrh.muted }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Analytics Home
        </a>
      </div>

      <div className="px-3 pb-2.5" style={{ borderBottom: `1px solid ${hrh.border}` }}>
        <div className="text-[15px] font-bold" style={{ color: hrh.ink }}>
          HRH Online
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

      <div className="px-2 pb-3 pt-2" style={{ borderTop: `1px solid ${hrh.border}` }}>
        <NavItem
          label="Operational Flags"
          active={active === OPERATIONAL_FLAGS_KEY}
          onClick={() => onNavigate(OPERATIONAL_FLAGS_KEY)}
        />
      </div>
    </aside>
  );
}
