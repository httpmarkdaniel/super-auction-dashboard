import { formatPeso } from "../utils/format";

const PILL_TONE = {
  critical: "bg-toneRedBg text-toneRedText",
  warning: "bg-toneAmberBg text-toneAmberText",
};

// Rolls up the concrete, actionable numbers already sitting in the overview
// data (unsold value, aging vendor payables, below-reserve lots, pending
// approvals) into a ranked worklist — highest peso value at stake first.
function buildPriorityActions(overview) {
  const { unsoldLots, vendorPayablesBacklog, reservePerformance, heroKPIs } = overview;
  const pendingApproval = heroKPIs.pendingApprovalCount ?? 0;
  const aged60 = vendorPayablesBacklog.aging.find((a) => a.bucket.startsWith("60"))?.value ?? 0;
  const aged31 = vendorPayablesBacklog.aging.find((a) => a.bucket.startsWith("31"))?.value ?? 0;

  const items = [
    {
      label: `${unsoldLots.count} unsold lots need relisting or a price cut`,
      value: unsoldLots.value,
      priority: "Critical",
    },
    {
      label: "Vendor payables aged 60+ days need remittance",
      value: aged60,
      priority: "Critical",
    },
    {
      label: `${reservePerformance.belowReserve.count} lots sold below reserve — review pricing with vendors`,
      value: reservePerformance.belowReserve.value,
      priority: "Watch",
    },
    {
      label: "Vendor payables aged 31–60 days building up",
      value: aged31,
      priority: "Watch",
    },
    pendingApproval > 0 && {
      label: `${pendingApproval} lot${pendingApproval === 1 ? "" : "s"} awaiting approval sign-off`,
      value: null,
      valueLabel: `${pendingApproval} lot${pendingApproval === 1 ? "" : "s"}`,
      priority: "Watch",
    },
  ].filter(Boolean);

  return items.filter((i) => (i.value ?? 1) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

export default function PriorityActions({ overview }) {
  const items = buildPriorityActions(overview);
  if (items.length === 0) return null;

  return (
    <div className="card px-5 py-4">
      <div className="eyebrow mb-3">Priority Actions</div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-3 py-2 border-b border-gridline last:border-0">
            <span className="w-5 h-5 rounded-full bg-navySoft text-navy text-[11px] font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 min-w-0 text-[13px] text-ink truncate">{item.label}</span>
            <span className="text-[13px] font-semibold text-ink tabular shrink-0">
              {item.valueLabel ?? formatPeso(item.value)}
            </span>
            <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PILL_TONE[item.priority === "Critical" ? "critical" : "warning"]}`}>
              {item.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
