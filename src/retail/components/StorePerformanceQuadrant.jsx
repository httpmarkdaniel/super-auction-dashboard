import Panel from "./Panel";
import { BubbleChart } from "./Charts";
import { retail } from "../theme";
import { formatCompactPeso, formatNum, formatPct } from "../format";
import { STORE_QUADRANT_DATA, getStoreQuadrant } from "../mockAnalytics";

const QUADRANT_CARDS = [
  { key: "strong", title: "Strong Store", desc: "Traffic increasing, conversion increasing", color: retail.good },
  { key: "trafficProblem", title: "Traffic Problem", desc: "Traffic declining, conversion improving", color: retail.blue },
  { key: "conversionProblem", title: "Conversion Problem", desc: "Traffic increasing, conversion declining", color: retail.orange },
  { key: "needsAttention", title: "Needs Attention", desc: "Traffic declining, conversion declining", color: retail.bad },
];

function QuadrantTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const rows = [
    ["Revenue", formatCompactPeso(p.z)],
    ["Traffic Growth", formatPct(p.x)],
    ["Conversion Growth", formatPct(p.y)],
    ["Current Traffic", formatNum(p.currentTraffic)],
    ["Current Conversion Rate", formatPct(p.currentConversionPct)],
    ["Transactions", formatNum(p.transactions)],
  ];
  return (
    <div className="rounded-md px-3 py-2 text-[12px] min-w-[190px]" style={{ background: retail.navy, border: `1px solid ${retail.navyBorder}`, color: "#fff" }}>
      <div className="font-semibold mb-1 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
        {p.label}
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4" style={{ color: "#a3adba" }}>
          <span>{k}:</span>
          <span className="font-semibold" style={{ color: "#fff" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

// Bubble chart: foot traffic growth (x) vs conversion growth (y), bubble
// size = revenue. Zero-growth reference lines split it into 4 quadrants —
// see getStoreQuadrant in ../mockAnalytics for the classification rule and
// mockAnalytics.STORE_QUADRANT_DATA for the (currently mock) inputs.
export default function StorePerformanceQuadrant() {
  const bubbleData = STORE_QUADRANT_DATA.map((s) => {
    const q = getStoreQuadrant(s.trafficGrowthPct, s.conversionGrowthPct);
    return {
      x: s.trafficGrowthPct,
      y: s.conversionGrowthPct,
      z: s.revenue,
      label: s.store,
      color: q.color,
      currentTraffic: s.currentTraffic,
      currentConversionPct: s.currentConversionPct,
      transactions: s.transactions,
    };
  });

  return (
    <Panel title="Store Performance Quadrant" subtitle="Foot traffic growth vs conversion growth — bubble size represents revenue" className="mt-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <BubbleChart
          data={bubbleData}
          xLabel="Foot Traffic Growth %"
          yLabel="Conversion Rate Growth %"
          xValueFormatter={(v) => `${v}%`}
          yValueFormatter={(v) => `${v}%`}
          referenceLineX={0}
          referenceLineY={0}
          tooltipContent={QuadrantTooltip}
          height={320}
        />
        <div className="grid grid-cols-2 gap-3">
          {QUADRANT_CARDS.map((c) => (
            <div key={c.key} className="rounded-2xl p-3" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <div className="text-[12.5px] font-bold" style={{ color: retail.ink }}>
                  {c.title}
                </div>
              </div>
              <div className="text-[11.5px]" style={{ color: retail.muted }}>
                {c.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
