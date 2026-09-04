import logo from "../assets/auctions-logo.png";

function NavItem({ label, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left pl-3 pr-3 py-2 rounded-lg text-[15.5px] leading-tight transition-colors border-l-2 flex items-center gap-2 ${
        active
          ? "bg-navySoft text-navy font-medium border-l-navy"
          : "text-ink border-l-transparent hover:bg-plane hover:text-ink"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// Warning-triangle glyph, hand-drawn inline (same stroke-based SVG
// convention Topbar's own icon buttons already use — no icon library
// added) — reserved for Operational Flags only, so it visually reads as
// the sidebar's one monitoring/attention destination rather than another
// analytics report.
function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
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
            className="bg-white border border-gridline rounded-lg px-3 py-3.5 w-full flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            <img src={logo} alt="HMR Auctions" className="w-full h-auto max-w-[160px] object-contain" />
          </button>
        </div>

        <NavGroup label="Dashboard">
          <NavItem label="Overview" active={active === "Overview"} onClick={() => go("Overview")} />
          <NavItem label="Active Auctions" active={active === "Online Bidding"} onClick={() => go("Online Bidding")} />
          <NavItem
            label="Upcoming Auctions"
            active={active === "Upcoming Auctions"}
            onClick={() => go("Upcoming Auctions")}
          />
          <NavItem label="Full Auction Detail" active={active === "Full Auction Detail"} onClick={() => go("Full Auction Detail")} />
          <NavItem label="Bidder Analytics" active={active === "Bidder Analytics"} onClick={() => go("Bidder Analytics")} />
          <NavItem label="Vendor Analytics" active={active === "Vendor Analytics"} onClick={() => go("Vendor Analytics")} />
          {/* Bidding Pace — removed as a standalone destination; its content
              now lives at the top of Bidder Analytics (see
              BidderAnalyticsView.jsx). The route/component itself is
              untouched, just no longer reachable via this nav item. */}
          {/* Revenue Breakdown — hidden from navigation only (not deleted);
              its route, component, and data logic below are fully intact
              for an easy restore, they're just unreachable without this
              nav item. */}
          <NavItem label="Vendor Payables" active={active === "Vendor Payables"} onClick={() => go("Vendor Payables")} />
        </NavGroup>

        <NavGroup label="Reports">
          {/* Export — removed as a standalone destination; exporting now
              lives contextually inside Auction Result (Export Excel/PDF,
              including the detailed dataset). The route/component/Topbar
              quick-export button are untouched below, just no longer
              reachable via any nav item — same pattern as Bidding
              Pace/Revenue Breakdown above. */}
          <NavItem label="Auction Result" active={active === "Auction Result"} onClick={() => go("Auction Result")} />
        </NavGroup>

        {/* Deliberately separated from the analytics/reports groups above —
            Operational Flags is a monitoring/attention destination, not
            another report, so it gets its own visually distinct area at
            the very bottom of the nav list rather than sitting inside
            "Dashboard" or "Reports". */}
        <div className="mt-3 pt-3.5 border-t border-gridline">
          <NavItem
            label="Operational Flags"
            icon={<WarningIcon />}
            active={active === "Operational Flags"}
            onClick={() => go("Operational Flags")}
          />
        </div>

        <div className="mt-3 px-3 pt-3.5 border-t border-gridline flex items-center gap-2 text-[14px] text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-good pulse-dot" />
          Connected
        </div>
      </aside>
    </>
  );
}
