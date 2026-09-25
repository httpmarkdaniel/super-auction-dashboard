import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import DateRangePicker from "./components/DateRangePicker";
import ExecutiveOverview from "./pages/ExecutiveOverview";
import SalesAnalytics from "./pages/SalesAnalytics";
import TrafficConversion from "./pages/TrafficConversion";
import CustomerAnalytics from "./pages/CustomerAnalytics";
import ProductAnalytics from "./pages/ProductAnalytics";
import MarkdownAnalytics from "./pages/MarkdownAnalytics";
import OrdersFulfillment from "./pages/OrdersFulfillment";
import BarcodeAnalytics from "./pages/BarcodeAnalytics";
import ReturnsAndCancellation from "./pages/ReturnsAndCancellation";
import CustomerSuccess from "./pages/CustomerSuccess";
import WeeklyBusinessReview from "./pages/WeeklyBusinessReview";
import CampaignCalendar from "./pages/CampaignCalendar";
import OperationalFlags from "./pages/OperationalFlags";
import { NAV_GROUPS, OPERATIONAL_FLAGS_KEY } from "./nav";
import { defaultDateRange } from "./dateRange";
import "../uniform.css";

const PAGES = {
  overview: ExecutiveOverview,
  sales: SalesAnalytics,
  traffic: TrafficConversion,
  customers: CustomerAnalytics,
  productAnalytics: ProductAnalytics,
  markdown: MarkdownAnalytics,
  fulfillment: OrdersFulfillment,
  barcodeAnalytics: BarcodeAnalytics,
  returnsCancellation: ReturnsAndCancellation,
  customerSuccess: CustomerSuccess,
  weeklyBusinessReview: WeeklyBusinessReview,
  campaignCalendar: CampaignCalendar,
  [OPERATIONAL_FLAGS_KEY]: OperationalFlags,
};

// Page header copy for the "LIVE DASHBOARD UNIFORM FORMAT" shell (same as
// the Auction dashboard): title = the page's own title, lead = the page's
// own description where it had one (moved here, wording unchanged), a
// short one-liner otherwise. Eyebrow = the page's sidebar group.
const PAGE_META = {
  overview: { title: "Sales Overview", lead: "Key performance metrics and trends for HRH Online" },
  sales: { title: "Voucher", lead: "Voucher usage and the sales it drives." },
  traffic: { title: "Traffic & Conversion", lead: "Website traffic and how much of it turns into orders." },
  customers: { title: "Customer Analytics", lead: "Who's buying — new vs returning customers, where they are and how much they spend." },
  productAnalytics: { title: "Product Analytics", lead: "Product performance — best sellers, categories and repeat sellers." },
  barcodeAnalytics: { title: "Stocks", lead: "Stock on hand and how it moves." },
  fulfillment: { title: "Orders & Fulfillment", lead: "How orders move from placed to fulfilled." },
  returnsCancellation: { title: "Returns and Cancellation", lead: "Returned and cancelled orders, and why." },
  weeklyBusinessReview: { title: "Weekly Business Review", lead: "Platform and SKU performance summary for the selected period." },
  campaignCalendar: { title: "Interactive Calendar", lead: "HRH Online campaign schedule across HMR Online, Shopee and TikTok." },
  markdown: { title: "Markdown Analytics", lead: "Marked-down products and how they sell." },
  customerSuccess: { title: "Customer Success", lead: "Customer service and satisfaction." },
  [OPERATIONAL_FLAGS_KEY]: { title: "Operational Flags", lead: "Live checks on orders, fulfillment, cancellations, returns, inventory, publishing and customer inquiries.", eyebrow: "Monitoring" },
};
const GROUP_BY_KEY = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items.map((it) => [it.key, g.label])));

// A separate module tree from Auction's App.jsx, own sidebar/header/page
// state — same state-based "tab" pattern Auction already uses internally
// (see main.jsx's comment), just not sharing any of Auction's components
// or business logic.
//
// Date Range + Channel are a single dashboard-wide filter — every page
// reads the same `filters.dateRange`/`filters.channel` from here via
// Header, rather than each page owning its own copy.
export default function HrhOnlineApp() {
  const [page, setPage] = useState("overview");
  const [channel, setChannel] = useState("All Channels");
  const [dateRange, setDateRange] = useState(defaultDateRange());

  useEffect(() => {
    document.title = "HRH Online · HMR Analytics";
  }, []);

  const Page = PAGES[page] || ExecutiveOverview;
  const filters = { channel, dateRange };
  const meta = PAGE_META[page] || { title: page, lead: "" };
  const eyebrow = meta.eyebrow || GROUP_BY_KEY[page] || "HRH Online";
  const hideChannelFilter = page === "traffic" || page === "customerSuccess" || page === "barcodeAnalytics" || page === "weeklyBusinessReview" || page === "campaignCalendar" || page === OPERATIONAL_FLAGS_KEY;
  const hideDateRange = page === "campaignCalendar";

  return (
    <div className="uf-root min-h-screen flex">
      <Sidebar active={page} onNavigate={setPage} channel={channel} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          channel={channel}
          onChannelChange={setChannel}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          hideChannelFilter={hideChannelFilter}
          hideDateRange={hideDateRange}
        />

        <main className="flex-1 min-w-0 uf-workspace relative">
          <div className="uf-eyebrow">{eyebrow}</div>
          <h1 className="uf-page-title">{meta.title}</h1>
          {meta.lead && <p className="uf-lead">{meta.lead}</p>}
          {!(hideDateRange && hideChannelFilter) && (
            <div className="uf-toolbar-inline print:hidden">
              {!hideDateRange && <DateRangePicker value={dateRange} onChange={setDateRange} />}
              {!hideChannelFilter && <span className="uf-control">◈ {channel}</span>}
            </div>
          )}
          <Page filters={filters} onNavigate={setPage} />
        </main>
      </div>
    </div>
  );
}
