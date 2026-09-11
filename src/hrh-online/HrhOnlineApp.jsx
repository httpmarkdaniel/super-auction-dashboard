import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ExecutiveOverview from "./pages/ExecutiveOverview";
import SalesAnalytics from "./pages/SalesAnalytics";
import TrafficConversion from "./pages/TrafficConversion";
import CustomerAnalytics from "./pages/CustomerAnalytics";
import ProductAnalytics from "./pages/ProductAnalytics";
import ProductMerchandising from "./pages/ProductMerchandising";
import InventoryAging from "./pages/InventoryAging";
import MarkdownAnalytics from "./pages/MarkdownAnalytics";
import OrdersFulfillment from "./pages/OrdersFulfillment";
import PickupAtStore from "./pages/PickupAtStore";
import OperationalFlags from "./pages/OperationalFlags";
import { OPERATIONAL_FLAGS_KEY } from "./nav";
import { hrh } from "./theme";
import { defaultDateRange } from "../utils/dateRange";

const PAGES = {
  overview: ExecutiveOverview,
  sales: SalesAnalytics,
  traffic: TrafficConversion,
  customers: CustomerAnalytics,
  productAnalytics: ProductAnalytics,
  merchandising: ProductMerchandising,
  inventoryAging: InventoryAging,
  markdown: MarkdownAnalytics,
  fulfillment: OrdersFulfillment,
  pickup: PickupAtStore,
  [OPERATIONAL_FLAGS_KEY]: OperationalFlags,
};

// A separate module tree from Auction's App.jsx, own sidebar/header/page
// state — same state-based "tab" pattern Auction already uses internally
// (see main.jsx's comment), just not sharing any of Auction's components
// or business logic.
//
// Date Range + Channel are now a single dashboard-wide filter (originally
// Product Analytics-only) — every page reads the same `filters.dateRange`/
// `filters.channel` from here via Header, rather than each page owning its
// own copy. Pages with a real API (Product Analytics) refetch on change;
// mock pages that have a channel dimension (e.g. Sales Analytics) filter
// their existing rows by it, same as before.
export default function HrhOnlineApp() {
  const [page, setPage] = useState("overview");
  const [channel, setChannel] = useState("All Channels");
  const [dateRange, setDateRange] = useState(defaultDateRange());

  useEffect(() => {
    document.title = "HRH Online · HMR Analytics";
  }, []);

  const Page = PAGES[page] || ExecutiveOverview;
  const filters = { channel, dateRange };

  return (
    <div className="min-h-screen flex" style={{ background: hrh.bg }}>
      <Sidebar active={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          channel={channel}
          onChannelChange={setChannel}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          hideChannelFilter={page === "traffic"}
        />
        <main className="flex-1 min-w-0 px-5 md:px-6 py-5">
          <Page filters={filters} />
        </main>
      </div>
    </div>
  );
}
