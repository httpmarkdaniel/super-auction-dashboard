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
import DateRangePicker from "./components/DateRangePicker";
import { SEGMENTS } from "./segments";
import { defaultDateRange } from "./dateRange";
import { NAV_GROUPS } from "./nav";
import "../uniform.css";

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
// HrhOnlineApp.jsx — "LIVE DASHBOARD UNIFORM FORMAT" shell (src/uniform.css,
// 2026-09-25): white sidebar, topbar, page header. Segment (All/Retail/Wholesale) + Date
// Range + Store are the 3 dashboard-wide filters (see segments.js/
// dateRange.js) — every page reads filters.segment/dateRange/store, same
// "one shared Header filter bar" pattern as HRH Online's HrhOnlineApp.jsx.
// Store options are scoped to the CURRENT segment (switching segment
// resets `store` to "" — All Stores — rather than risk a store/segment
// combination that contradicts itself, e.g. a Retail-only store while
// segment is Wholesale).
// Page header copy for the "LIVE DASHBOARD UNIFORM FORMAT" shell (same as
// Auction / HRH Online): title = the page's own title, lead = the page's
// own description where it had one (moved here, wording unchanged), a
// short one-liner otherwise. Eyebrow = the page's sidebar group.
const PAGE_META = {
  salesOverview: { title: "Sales Overview", lead: "Sales, transactions and basket size across the stores, HRH Online and wholesale." },
  trend: { title: "Trend", lead: "Fixed trailing windows (this month to date / last 4 weeks) — not affected by the Date Range filter above." },
  storePerformance: { title: "Store Performance", lead: "How each store is doing on sales, transactions and targets." },
  salesChannel: { title: "Sales Channel", lead: "Sales by channel." },
  footTraffic: { title: "Foot Traffic", lead: "Walk-in visitors per branch and how many of them buy." },
  customerSegments: { title: "Customer (3R)", lead: "New, retained and reactivated customers and the sales they bring." },
  topProducts: { title: "Top Products", lead: "Best-selling products for the period." },
  stocks: { title: "Stocks", lead: "Stock on hand across the stores." },
  methodology: { title: "Methodology & Data Notes", lead: "How every number on this dashboard is calculated." },
};
const GROUP_BY_KEY = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items.map((it) => [it.key, g.label])));

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
  const meta = PAGE_META[page] || { title: page, lead: "" };

  return (
    <div className="uf-root min-h-screen flex">
      <Sidebar active={page} onNavigate={setPage} store={store} segmentLabel={SEGMENTS[segment]?.label} />
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
        <main className="uf-workspace relative">
          <div className="uf-eyebrow">{GROUP_BY_KEY[page] || "Retail"}</div>
          <h1 className="uf-page-title">{meta.title}</h1>
          {meta.lead && <p className="uf-lead">{meta.lead}</p>}
          <div className="uf-toolbar-inline">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <span className="uf-control">◈ {SEGMENTS[segment]?.label || "All"}</span>
            <span className="uf-control">⌂ {store || "All Stores"}</span>
            <span className="uf-live">Live data</span>
          </div>
          <Page filters={filters} />
        </main>
      </div>
    </div>
  );
}
