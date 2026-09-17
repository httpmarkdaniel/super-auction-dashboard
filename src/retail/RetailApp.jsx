import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
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
// HrhOnlineApp.jsx — gradient-navy Sidebar + white Header, matching
// public/HRH_Retail_Dashboard_Modern_Layout.html's own "modern SaaS
// dashboard" layout (2026-09-18 redesign, replacing the dark-navy top-tab-
// bar look from the previous pass). Segment (All/Retail/Wholesale) is the
// one dashboard-wide filter (see segments.js) — every page reads
// filters.segment; each page manages its own Weekly/MTD toggle internally.
export default function RetailApp() {
  const [page, setPage] = useState("salesOverview");
  const [segment, setSegment] = useState("all");

  useEffect(() => {
    document.title = "Retail · HMR Analytics";
  }, []);

  const Page = PAGES[page] || SalesOverview;
  const filters = { segment };

  return (
    <div className="min-h-screen flex" style={{ background: retail.bg }}>
      <Sidebar active={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0">
        <Header segment={segment} onSegmentChange={setSegment} />
        <main className="px-[18px] pb-7 pt-[18px]">
          <Page filters={filters} />
        </main>
      </div>
    </div>
  );
}
