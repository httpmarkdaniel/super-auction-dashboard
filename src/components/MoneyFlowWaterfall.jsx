import Card from "./primitives/Card";
import usePalette from "../usePalette";
import { formatPeso } from "../utils/format";

function colorFor(stage, palette) {
  if (stage === "Net Vendor Payable") return palette.good;
  if (stage === "Commission") return palette.series1;
  if (stage === "Buyer's Premium") return palette.series3;
  return palette.divNeg; // Service Fee
}

// A single proportional bar — one bid amount, split into the shares each
// stage takes — reads more directly as "how it splits" than the previous
// waterfall (bid amount minus deductions, bar by bar), which told more of
// a sequential "before/after" story than a composition one.
export default function MoneyFlowWaterfall({ data: moneyFlow, rangeLabel = "Today" }) {
  const palette = usePalette();
  const total = moneyFlow.find((r) => r.type === "total")?.value || 0;
  const segments = moneyFlow.filter((r) => r.type !== "total").map((r) => ({ ...r, value: Math.abs(r.value) }));

  return (
    <Card title={`Money Flow · ${rangeLabel}`} subtitle="How the total bid amount splits">
      <div className="h-3 rounded-full overflow-hidden flex bg-gridline mb-5">
        {segments.map((s) => (
          <div
            key={s.stage}
            className="h-full"
            style={{ width: total > 0 ? `${(s.value / total) * 100}%` : 0, background: colorFor(s.stage, palette) }}
            title={`${s.stage}: ${formatPeso(s.value)}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {segments.map((s) => (
          <div key={s.stage} className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(s.stage, palette) }} />
              <span className="text-[13px] text-ink truncate">{s.stage}</span>
            </div>
            <div className="font-display text-[19px] leading-none text-ink">{formatPeso(s.value)}</div>
            <div className="text-[12.5px] tabular text-muted mt-0.5">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
