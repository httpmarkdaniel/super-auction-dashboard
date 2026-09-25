import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import { retail } from "../retail/theme";

// Customer Analytics module — own tree like src/retail/ and
// src/hrh-online/, reusing Retail's theme. Empty shell for now: sidebar +
// header only, no pages yet.
export default function CustomerAnalyticsApp() {
  useEffect(() => {
    document.title = "Customer Analytics · HMR Analytics";
  }, []);

  return (
    <div className="min-h-screen flex" style={{ background: retail.bg }}>
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="sticky top-0 z-20 px-4 md:px-6 py-3.5 flex items-center gap-3" style={{ background: retail.surface, borderBottom: `1px solid ${retail.border}` }}>
          <a href="/" className="md:hidden text-[12px] shrink-0" style={{ color: retail.muted }}>
            ‹ Home
          </a>
          <h2 className="m-0 text-[20px] md:text-[22px] font-bold truncate" style={{ color: retail.ink }}>
            Customer Analytics
          </h2>
        </div>
        <main className="px-4 md:px-[18px] pb-7 pt-[18px]" />
      </div>
    </div>
  );
}
