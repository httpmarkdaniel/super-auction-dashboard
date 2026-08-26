import StoryHeader from "./StoryHeader";
import VendorPayablesBreakdown from "./VendorPayablesBreakdown";
import { formatPeso } from "../utils/format";
import { scopeAdverb } from "../insights";
import { useVendorPayables } from "../useVendorPayables";

export default function PayablesView({ store, refreshNonce }) {
  const { data: live, loading, error } = useVendorPayables(store, refreshNonce);

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

      <VendorPayablesBreakdown data={live} scopeLabel={store} />
    </div>
  );
}
