import { useEffect, useState } from "react";
import Sidebar, { MobileNav } from "./components/Sidebar";
import Overview from "./pages/Overview";
import CustomerExplorer from "./pages/CustomerExplorer";
import StoreOverlap from "./pages/StoreOverlap";
import Methodology from "./pages/Methodology";
import { retail } from "../retail/theme";
import { fetchCa } from "./api";
import { NAV_ITEMS } from "./nav";

// Customer Analytics module — own tree like src/retail/ and
// src/hrh-online/, reusing Retail's theme and shared components. Unlike
// Retail there's no dashboard-wide filter bar: Overview is date-ranged,
// while Customer Explorer and Store Overlap are all-time by design (they
// answer "who has ever shopped at X" questions), so each page owns its
// own controls. The store list is loaded once here and shared.
//
// `explorerPreset` (below) lets other pages open the Explorer pre-filtered
// (e.g. clicking a Store Overlap cell opens "bought at both A and B");
// bumping its `id` remounts the Explorer with those filters.

// ?tab=explorer|overlap|methodology opens that page directly (shareable
// links); in-app navigation itself stays in memory like the other modules.
function initialPage() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return NAV_ITEMS.some((n) => n.key === tab) ? tab : "overview";
}

export default function CustomerAnalyticsApp() {
  const [page, setPage] = useState(initialPage);
  const [stores, setStores] = useState([]);
  const [storesError, setStoresError] = useState(null);
  const [explorerPreset, setExplorerPreset] = useState({ id: 0 });

  useEffect(() => {
    document.title = "Customer Analytics · HMR Analytics";
    const controller = new AbortController();
    fetchCa("caStores", {}, controller.signal)
      .then((j) => setStores(j.stores))
      .catch((err) => err.name !== "AbortError" && setStoresError(err.message));
    return () => controller.abort();
  }, []);

  function openExplorer(preset) {
    setExplorerPreset((p) => ({ ...preset, id: p.id + 1 }));
    setPage("explorer");
    window.scrollTo({ top: 0 });
  }

  const pageProps = { stores, storesError, openExplorer };
  let content;
  if (page === "explorer") content = <CustomerExplorer key={explorerPreset.id} preset={explorerPreset} {...pageProps} />;
  else if (page === "overlap") content = <StoreOverlap {...pageProps} />;
  else if (page === "methodology") content = <Methodology />;
  else content = <Overview {...pageProps} />;

  return (
    <div className="min-h-screen flex" style={{ background: retail.bg }}>
      <Sidebar active={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0">
        <div className="sticky top-0 z-20 px-4 md:px-6 py-3.5 flex items-center justify-between gap-3" style={{ background: retail.surface, borderBottom: `1px solid ${retail.border}` }}>
          <div className="flex items-center gap-3 min-w-0">
            <a href="/" className="md:hidden text-[12px] shrink-0" style={{ color: retail.muted }}>
              ‹ Home
            </a>
            <h2 className="m-0 text-[20px] md:text-[22px] font-bold truncate" style={{ color: retail.ink }}>
              Customer Analytics
            </h2>
          </div>
          <div className="flex items-center gap-2 font-bold text-[13px] shrink-0" style={{ color: retail.ink }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: retail.good, boxShadow: "0 0 0 6px rgba(22,163,74,.12)" }} />
            Live Data
          </div>
        </div>
        <MobileNav active={page} onNavigate={setPage} />
        <main className="px-4 md:px-[18px] pb-7 pt-[18px]">{content}</main>
      </div>
    </div>
  );
}
