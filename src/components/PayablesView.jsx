import { useEffect, useRef, useState } from "react";
import StoryHeader from "./StoryHeader";
import VendorPayablesBreakdown from "./VendorPayablesBreakdown";
import { formatPeso } from "../utils/format";
import { scopeAdverb } from "../insights";
import { useVendorPayables } from "../useVendorPayables";

const DETAIL_PAGE_SIZE = 50;

export default function PayablesView({ store, refreshNonce }) {
  // Full Detail table's search/sort/page state — owned here (not inside
  // VendorPayablesBreakdown) since it drives useVendorPayables' fetch
  // params directly. A store change resets back to page 0 / no search via
  // the key reset below rather than stale detail state leaking across
  // stores.
  const [detailQuery, setDetailQuery] = useState("");
  const [detailSort, setDetailSort] = useState({ key: "amount", dir: "desc" });
  const [detailPage, setDetailPage] = useState(0);

  // A new search term or sort column always jumps back to page 0 — same
  // "reset on filter change" behavior AuctionSummaryTable.jsx already uses.
  function handleDetailQueryChange(value) {
    setDetailQuery(value);
    setDetailPage(0);
  }
  function handleDetailSortChange(key) {
    setDetailSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setDetailPage(0);
  }

  // A store change starts the Full Detail table fresh rather than keeping
  // a search/sort/page that no longer makes sense for the new store.
  const prevStoreRef = useRef(store);
  useEffect(() => {
    if (prevStoreRef.current !== store) {
      prevStoreRef.current = store;
      setDetailQuery("");
      setDetailSort({ key: "amount", dir: "desc" });
      setDetailPage(0);
    }
  }, [store]);

  const { data: live, loading, error } = useVendorPayables(store, refreshNonce, {
    q: detailQuery,
    sortKey: detailSort.key,
    sortDir: detailSort.dir,
    page: detailPage,
    pageSize: DETAIL_PAGE_SIZE,
  });

  if (error && !live) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load vendor payables: {error}
      </div>
    );
  }
  if (loading || !live) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading vendor payables…</div>;
  }

  const paidAmount = Number(live.paid_amount) || 0;
  const outstandingAmount = Number(live.outstanding_amount) || 0;
  const pendingCount = Number(live.pending_count) || 0;

  const headline =
    pendingCount > 0
      ? `${formatPeso(outstandingAmount)} still owed to vendors ${scopeAdverb(store)} across ${pendingCount} outstanding payable${
          pendingCount === 1 ? "" : "s"
        }, with ${formatPeso(paidAmount)} already paid or remitted.`
      : `No outstanding vendor payables ${scopeAdverb(store)} right now — ${formatPeso(paidAmount)} paid or remitted.`;

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-critical/10 text-toneRedText text-[13.5px]">
          Couldn't refresh vendor payables: {error} — showing last loaded data.
        </div>
      )}

      <div className="mb-8">
        <StoryHeader
          eyebrow={`${store} · Vendor Payables · Live`}
          headline={headline}
          amount={formatPeso(outstandingAmount)}
          amountLabel="Outstanding Payables"
        />
      </div>

      <VendorPayablesBreakdown
        data={live}
        scopeLabel={store}
        detailQuery={detailQuery}
        onDetailQueryChange={handleDetailQueryChange}
        detailSort={detailSort}
        onDetailSortChange={handleDetailSortChange}
        detailPage={detailPage}
        onDetailPageChange={setDetailPage}
        detailPageSize={DETAIL_PAGE_SIZE}
      />
    </div>
  );
}
