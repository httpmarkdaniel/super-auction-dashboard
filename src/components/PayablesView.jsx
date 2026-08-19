import StoryHeader from "./StoryHeader";
import VendorPayablesBreakdown from "./VendorPayablesBreakdown";
import { formatPeso } from "../utils/format";
import { scopeAdverb } from "../insights";
import { useVendorPayables } from "../useVendorPayables";

export default function PayablesView({ store, refreshNonce }) {
  const { data: live, loading, error } = useVendorPayables(store, refreshNonce);

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">
        Couldn't load vendor payables: {error}
      </div>
    );
  }
  if (loading || !live) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading vendor payables…</div>;
  }

  const totalBacklog = Number(live.total_backlog) || 0;
  const pendingCount = Number(live.pending_count) || 0;
  const avgAgeDays = Math.round(Number(live.avg_age_days) || 0);

  const headline =
    pendingCount > 0
      ? `${formatPeso(totalBacklog)} owed to vendors ${scopeAdverb(store)} across ${pendingCount} pending payable${
          pendingCount === 1 ? "" : "s"
        }, averaging ${avgAgeDays} day${avgAgeDays === 1 ? "" : "s"} outstanding.`
      : `No outstanding vendor payables ${scopeAdverb(store)} right now.`;

  return (
    <div>
      <div className="mb-8">
        <StoryHeader eyebrow={`${store} · Vendor Payables · Live`} headline={headline} amount={formatPeso(totalBacklog)} />
      </div>

      <VendorPayablesBreakdown data={live} scopeLabel={store} />
    </div>
  );
}
