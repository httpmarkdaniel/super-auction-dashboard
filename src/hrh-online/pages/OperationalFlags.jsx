import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import DemoBadge from "../components/DemoBadge";
import SeverityBadge from "../components/SeverityBadge";
import { operationalFlags } from "../mock/data";
import { formatNum } from "../format";

const COLUMNS = [
  { key: "severity", label: "Severity", render: (r) => <SeverityBadge severity={r.severity} /> },
  { key: "area", label: "Area" },
  { key: "flag", label: "Flag" },
  { key: "affectedCount", label: "Affected Count", render: (r) => formatNum(r.affectedCount) },
  { key: "ageDays", label: "Age (days)", render: (r) => formatNum(r.ageDays) },
  { key: "action", label: "Action", render: () => <span style={{ color: "#22304f", fontWeight: 600 }}>View →</span> },
];

// Illustrative UI shell for future deterministic flags — not real HMR
// operational issues. Deterministic rules land once the underlying metric
// contracts (Orders, Inventory, Fulfillment, Publishing, Cancellations,
// Returns) are validated.
export default function OperationalFlags() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
          Operational Flags
        </div>
        <DemoBadge text="Illustrative — not real HMR issues" />
      </div>

      <Panel title="Flags">
        <DataTable columns={COLUMNS} rows={operationalFlags} />
      </Panel>
    </div>
  );
}
