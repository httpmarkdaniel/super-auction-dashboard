import Card from "./primitives/Card";
import StatusBar from "./primitives/StatusBar";
import { formatPeso } from "../utils/format";

const STATUS_BY_BUCKET = ["good", "warning", "critical"];

export default function VendorPayablesBacklog({ data: vendorPayablesBacklog }) {
  const rows = vendorPayablesBacklog.aging.map((a, i) => ({
    label: a.bucket,
    value: a.value,
    status: STATUS_BY_BUCKET[i],
  }));

  return (
    <Card title="Unremitted Vendor Payables" subtitle="Accumulated backlog" className="h-full">
      <div className="font-bold text-[30px] leading-none text-series1 mb-4">
        {formatPeso(vendorPayablesBacklog.totalBacklog)}
      </div>
      <StatusBar rows={rows} />
    </Card>
  );
}
