import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ExecutiveOverview from "./pages/ExecutiveOverview";
import { retail } from "./theme";
import { defaultDateRange } from "./dateRange";
import { ALL_STORES_OPTION } from "./stores";

const PAGES = {
  overview: ExecutiveOverview,
};

// A separate module tree from Auction's App.jsx and HRH Online's
// HrhOnlineApp.jsx — own sidebar/header/page state, same state-based "tab"
// pattern both of those already use. Date Range + Store are a single
// dashboard-wide filter, same convention as HRH Online's Header (see that
// module's own comment for why).
export default function RetailApp() {
  const [page, setPage] = useState("overview");
  const [store, setStore] = useState(ALL_STORES_OPTION);
  const [dateRange, setDateRange] = useState(defaultDateRange());

  useEffect(() => {
    document.title = "Retail · HMR Analytics";
  }, []);

  const Page = PAGES[page] || ExecutiveOverview;
  const filters = { store, dateRange };

  return (
    <div className="min-h-screen flex" style={{ background: retail.bg }}>
      <Sidebar active={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header store={store} onStoreChange={setStore} dateRange={dateRange} onDateRangeChange={setDateRange} />
        <main className="flex-1 min-w-0 px-5 md:px-6 py-5">
          <Page filters={filters} />
        </main>
      </div>
    </div>
  );
}
