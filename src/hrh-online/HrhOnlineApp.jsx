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
import ChannelPerformance from "./pages/ChannelPerformance";
import OperationalFlags from "./pages/OperationalFlags";
import { OPERATIONAL_FLAGS_KEY } from "./nav";
import { hrh } from "./theme";

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
  channelPerformance: ChannelPerformance,
  [OPERATIONAL_FLAGS_KEY]: OperationalFlags,
};

// A separate module tree from Auction's App.jsx, own sidebar/header/page
// state — same state-based "tab" pattern Auction already uses internally
// (see main.jsx's comment), just not sharing any of Auction's components
// or business logic.
export default function HrhOnlineApp() {
  const [page, setPage] = useState("overview");
  const [filters, setFilters] = useState({ dateRange: "Last 30 Days", channel: "All Channels", store: "All Stores" });

  useEffect(() => {
    document.title = "HRH Online · HMR Analytics";
  }, []);

  const Page = PAGES[page] || ExecutiveOverview;

  return (
    <div className="min-h-screen flex" style={{ background: hrh.bg }}>
      <Sidebar active={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header filters={filters} onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))} />
        <main className="flex-1 min-w-0 px-5 md:px-6 py-5">
          <Page filters={filters} />
        </main>
      </div>
    </div>
  );
}
