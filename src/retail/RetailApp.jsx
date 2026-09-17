import { useEffect, useState } from "react";
import Header from "./components/Header";
import TabBar from "./components/TabBar";
import SalesOverview from "./pages/SalesOverview";
import Trend from "./pages/Trend";
import StorePerformance from "./pages/StorePerformance";
import SalesChannel from "./pages/SalesChannel";
import FootTraffic from "./pages/FootTraffic";
import CustomerSegments from "./pages/CustomerSegments";
import TopProducts from "./pages/TopProducts";
import Methodology from "./pages/Methodology";
import { retail } from "./theme";

const PAGES = {
  salesOverview: SalesOverview,
  trend: Trend,
  storePerformance: StorePerformance,
  salesChannel: SalesChannel,
  footTraffic: FootTraffic,
  customerSegments: CustomerSegments,
  topProducts: TopProducts,
  methodology: Methodology,
};

// A separate module tree from Auction's App.jsx and HRH Online's
// HrhOnlineApp.jsx — dark-navy header + sticky horizontal TabBar instead
// of a left Sidebar, per explicit "make Retail feel different from HRH
// Online" request (2026-09-17) — matches the reference report's own
// header/tabbar layout. Segment (All/Retail/Wholesale) is the one
// dashboard-wide filter (see segments.js) — every page reads
// filters.segment; each page manages its own Weekly/MTD toggle internally
// rather than a shared Date Range control.
export default function RetailApp() {
  const [page, setPage] = useState("salesOverview");
  const [segment, setSegment] = useState("all");

  useEffect(() => {
    document.title = "Retail · HMR Analytics";
  }, []);

  const Page = PAGES[page] || SalesOverview;
  const filters = { segment };

  return (
    <div className="min-h-screen" style={{ background: retail.bg }}>
      <Header segment={segment} onSegmentChange={setSegment} />
      <TabBar active={page} onNavigate={setPage} />
      <main className="max-w-[1300px] mx-auto px-5 md:px-6 py-6">
        <Page filters={filters} />
      </main>
    </div>
  );
}
