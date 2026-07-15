import { useMemo, useState } from "react";
import Sidebar, { CATEGORY_TABS } from "./components/Sidebar";
import Topbar from "./components/Topbar";
import StoryHeader from "./components/StoryHeader";
import StorySection from "./components/primitives/StorySection";
import HeroKPIs from "./components/HeroKPIs";
import CategoryStrip from "./components/CategoryStrip";
import BranchStrip from "./components/BranchStrip";
import Leaderboard from "./components/Leaderboard";
import ReservePerformance from "./components/ReservePerformance";
import UnsoldLotsCard from "./components/UnsoldLotsCard";
import BidderComposition from "./components/BidderComposition";
import MoneyFlowWaterfall from "./components/MoneyFlowWaterfall";
import VendorPayablesBacklog from "./components/VendorPayablesBacklog";
import HourlyTrend from "./components/HourlyTrend";
import OperationsTable from "./components/OperationsTable";
import CategoryView from "./components/CategoryView";
import LiveAuctionView from "./components/LiveAuctionView";
import ExportView from "./components/ExportView";
import TrendsView from "./components/TrendsView";
import AuctionTypeView from "./components/AuctionTypeView";
import StoreView from "./components/StoreView";
import { ALL_STORES, getOverviewForStore, getLiveLotsForStore } from "./mockData";
import { buildStoryline } from "./insights";
import { formatPeso } from "./utils/format";

function OverviewTab({ store, overview }) {
  const story = buildStoryline(overview, store);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · Today's Story`}
          headline={story.headline}
          amount={formatPeso(overview.heroKPIs.totalBidAmount)}
          deltaPct={overview.heroKPIs.totalBidAmountDeltaPct}
        />
        <div className="mt-4">
          <HeroKPIs data={overview.heroKPIs} />
        </div>
      </div>

      <StorySection title="Where the money is coming from" insight={story.categoryInsight}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryStrip data={overview.categoryBreakdown} />
          <BranchStrip />
        </div>
      </StorySection>

      <StorySection title="Who's driving today's results" insight={story.peopleInsight}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Leaderboard title="Top Vendors · Today" rows={overview.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
          <Leaderboard title="Top Bidders · Today" rows={overview.topBidders} nameKey="bidder" metaKey="wins" metaLabel="wins" />
        </div>
        <BidderComposition data={overview.bidderComposition} />
      </StorySection>

      <StorySection title="Today's pace" insight={story.paceInsight}>
        <HourlyTrend data={overview.hourlyTrend} />
      </StorySection>

      <StorySection title="What needs attention" insight={story.attentionInsight}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <ReservePerformance data={overview.reservePerformance} />
          </div>
          <UnsoldLotsCard data={overview.unsoldLots} />
        </div>
        <div className="mt-4">
          <VendorPayablesBacklog data={overview.vendorPayablesBacklog} />
        </div>
      </StorySection>

      <StorySection title="Where the money goes" insight={story.moneyFlowInsight}>
        <MoneyFlowWaterfall data={overview.moneyFlow} />
      </StorySection>

      <StorySection title="Full lot detail" insight="Drill into every individual lot from today below." last>
        <OperationsTable data={overview.operationsDetail} />
      </StorySection>
    </div>
  );
}

const TITLES = {
  Overview: "Overview",
  "Live Auction": "Live Auction",
  Trends: "Yearly Trends",
  "Auction Types": "Sale Channels",
  Stores: "Store Performance",
  Export: "Export Report",
};

export default function App() {
  const [tab, setTab] = useState("Overview");
  const [store, setStore] = useState(ALL_STORES);

  const overview = useMemo(() => getOverviewForStore(store), [store]);

  const searchPool = useMemo(
    () => [
      ...overview.operationsDetail.map((o) => ({
        lotNumber: o.lotNumber,
        primary: o.vendor,
        secondary: o.category,
        status: o.status,
      })),
      ...getLiveLotsForStore(store).map((l) => ({
        lotNumber: l.lotNumber,
        primary: l.item,
        secondary: l.store,
        status: l.status,
      })),
    ],
    [overview, store]
  );

  return (
    <div className="flex min-h-screen bg-plane">
      <Sidebar active={tab} onChange={setTab} />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar title={TITLES[tab] || tab} store={store} onStoreChange={setStore} searchPool={searchPool} />

        <div className="px-8 py-6 md:px-10 md:py-8 max-w-[1400px]">
          {tab === "Overview" && <OverviewTab store={store} overview={overview} />}
          {CATEGORY_TABS.includes(tab) && <CategoryView category={tab} store={store} />}
          {tab === "Live Auction" && <LiveAuctionView store={store} />}
          {tab === "Trends" && <TrendsView store={store} />}
          {tab === "Auction Types" && <AuctionTypeView store={store} />}
          {tab === "Stores" && <StoreView store={store} />}
          {tab === "Export" && <ExportView store={store} overview={overview} />}

          <footer className="text-center text-[12px] text-muted pt-8 pb-2">
            HMR Auction Services · Internal Use Only
          </footer>
        </div>
      </main>
    </div>
  );
}
