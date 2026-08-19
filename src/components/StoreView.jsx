import { useState } from "react";
import StatTile from "./primitives/StatTile";
import Leaderboard from "./Leaderboard";
import StoryHeader from "./StoryHeader";
import StorySection from "./primitives/StorySection";
import { ALL_STORES } from "../mockData";
import { MOCK_STORE_DETAIL } from "../mockApiData";
import { formatPeso } from "../utils/format";
import { buildStoreStoryline } from "../insights";
import { resolveDateRange } from "../utils/dateRange";
import { useLiveBidCorrection } from "../useLiveBidding";

// MOCKED — real fetch disconnected, see src/mockApiData.js. Restore fetch() below to re-wire.
function useStoreDetail(store, dateRangeKey, refreshNonce = 0) {
  const [state] = useState(
    store === ALL_STORES
      ? { data: null, loading: false, error: null }
      : { data: MOCK_STORE_DETAIL, loading: false, error: null }
  );
  return state;
}

/* Original live implementation:
import { useEffect, useState } from "react";

function useStoreDetail(store, dateRangeKey, refreshNonce = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    // This endpoint requires one specific branch — "All Stores" has no
    // real single-branch equivalent, so skip the fetch entirely rather
    // than querying a branch that can't exist.
    if (store === ALL_STORES) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    const { from, to } = resolveDateRange(dateRangeKey);
    // %20 not "+" — see useLiveOverview.js for why URLSearchParams' default
    // "+" encoding silently breaks multi-word store names server-side.
    const params = new URLSearchParams(Object.entries({ store, from, to }).filter(([, v]) => v))
      .toString()
      .replace(/\+/g, "%20");
    fetch(`/api/store-detail?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`store-detail returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [store, dateRangeKey, refreshNonce]);

  return state;
}
*/

export default function StoreView({ store, dateRange, refreshNonce }) {
  const { data: live, loading, error } = useStoreDetail(store, dateRange, refreshNonce);
  // Deferred, non-blocking correction of the stale ClickHouse snapshot for
  // auctions still live right now at this branch — see useLiveBidCorrection.
  const bidCorrectionDelta = useLiveBidCorrection(live?.auctions, refreshNonce);

  if (store === ALL_STORES) {
    return (
      <div className="text-center text-ink text-[15.5px] py-12">
        Select a specific store from the dropdown above to view its detail.
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load {store} data: {error}
      </div>
    );
  }
  if (loading || !live) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading {store} data…</div>;
  }

  const totalBidAmount = (Number(live.total_bid_amount) || 0) + bidCorrectionDelta;
  // Sell-through scoped to ended auctions, counting Outstanding/Released/
  // Paid as sold — see api/overview.js's comment for why raw total_paid/
  // total_lots understates it (still-open auctions, payment-pending lots).
  const endedLotsListed = Number(live.ended_lots_listed) || 0;
  const endedLotsSold = Number(live.ended_lots_sold) || 0;
  const d = {
    totalBidAmount,
    sellThroughRate: endedLotsListed > 0 ? Math.round((endedLotsSold / endedLotsListed) * 100) : 0,
    lotsSold: endedLotsSold,
    lotsListed: endedLotsListed,
    avgBidPerItem: endedLotsSold > 0 ? Math.round(totalBidAmount / endedLotsSold) : 0,
    activeAuctions: Number(live.total_auctions) || 0,
    topVendors: (live.topVendors || []).map((v) => ({
      vendor: v.vendor,
      bidAmount: Number(v.bid_amount) || 0,
      lots: Number(v.lots) || 0,
    })),
  };

  const rangeLabel = resolveDateRange(dateRange).label;
  const story = buildStoreStoryline(d, store, rangeLabel);

  return (
    <div>
      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · ${rangeLabel} · Live`}
          headline={story.headline}
          amount={formatPeso(d.totalBidAmount)}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatTile eyebrow="Sell-Through Rate" value={`${d.sellThroughRate}%`} />
          <StatTile eyebrow="Lots Sold / Listed" value={`${d.lotsSold} / ${d.lotsListed}`} />
          <StatTile eyebrow="Avg Bid per Item" value={formatPeso(d.avgBidPerItem)} />
          <StatTile eyebrow="Active Auctions" value={d.activeAuctions} live={d.activeAuctions > 0} />
        </div>
      </div>

      <StorySection title="Top Vendors" insight="The vendors bringing in the most consignments at this branch." last>
        <Leaderboard title={`Top Vendors · ${store}`} rows={d.topVendors} nameKey="vendor" metaKey="lots" metaLabel="lots" />
      </StorySection>
    </div>
  );
}
