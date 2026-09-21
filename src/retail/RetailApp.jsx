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
import Stocks from "./pages/Stocks";
import Methodology from "./pages/Methodology";
import { retail } from "./theme";
import { SEGMENTS } from "./segments";
import { defaultDateRange } from "./dateRange";

const PAGES = {
  salesOverview: SalesOverview,
  trend: Trend,
  storePerformance: StorePerformance,
  salesChannel: SalesChannel,
  footTraffic: FootTraffic,
  customerSegments: CustomerSegments,
  topProducts: TopProducts,
  stocks: Stocks,
  methodology: Methodology,
};

// A separate module tree from Auction's App.jsx and HRH Online's
// HrhOnlineApp.jsx — gradient-navy Sidebar + white Header, matching
// public/HRH_Retail_Dashboard_Modern_Layout.html's own "modern SaaS
// dashboard" layout (2026-09-18 redesign, replacing the dark-navy top-tab-
// bar look from the previous pass). Segment (All/Retail/Wholesale) + Date
// Range + Store are the 3 dashboard-wide filters (see segments.js/
// dateRange.js) — every page reads filters.segment/dateRange/store, same
// "one shared Header filter bar" pattern as HRH Online's HrhOnlineApp.jsx.
// Store options are scoped to the CURRENT segment (switching segment
// resets `store` to "" — All Stores — rather than risk a store/segment
// combination that contradicts itself, e.g. a Retail-only store while
// segment is Wholesale).
export default function RetailApp() {
  const [page, setPage] = useState("salesOverview");
  const [segment, setSegment] = useState("all");
  const [dateRange, setDateRange] = useState(defaultDateRange());
  const [store, setStore] = useState("");

  useEffect(() => {
    document.title = "Retail · HMR Analytics";
  }, []);

  function handleSegmentChange(next) {
    setSegment(next);
    setStore("");
  }

  const Page = PAGES[page] || SalesOverview;
  const storeOptions = SEGMENTS[segment]?.stores || SEGMENTS.all.stores;
  const filters = { segment, dateRange, store };

  return (
    <div className="min-h-screen flex" style={{ background: retail.bg }}>
      <Sidebar active={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0">
        <Header
          segment={segment}
          onSegmentChange={handleSegmentChange}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          store={store}
          onStoreChange={setStore}
          storeOptions={storeOptions}
        />
        <main className="px-[18px] pb-7 pt-[18px]">
          <Page filters={filters} />
        </main>
      </div>
    </div>
  );
}
