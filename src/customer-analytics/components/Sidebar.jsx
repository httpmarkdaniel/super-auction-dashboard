import { retail } from "../../retail/theme";

// Same gradient-navy sidebar as Retail's (src/retail/components/
// Sidebar.jsx), with this module's own title. No pages yet.
export default function Sidebar() {
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
      <h1 className="m-0 text-[22px] font-extrabold tracking-[0.2px]">Customer Analytics</h1>
    </aside>
  );
}
