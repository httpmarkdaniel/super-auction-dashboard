import { useCallback, useEffect, useState } from "react";
import Panel from "./Panel";
import { BubbleChart } from "./Charts";
import { LoadingState, ErrorState, EmptyState } from "./States";
import { retail } from "../theme";
import { formatCompactPeso, formatNum, formatPct } from "../format";

const QUADRANT_CARDS = [
  { key: "strong", title: "Strong Store", desc: "Traffic increasing, conversion increasing", color: retail.good },
  { key: "trafficProblem", title: "Traffic Problem", desc: "Traffic declining, conversion improving", color: retail.blue },
  { key: "conversionProblem", title: "Conversion Problem", desc: "Traffic increasing, conversion declining", color: retail.orange },
  { key: "needsAttention", title: "Needs Attention", desc: "Traffic declining, conversion declining", color: retail.bad },
];

function getStoreQuadrant(trafficGrowthPct, conversionGrowthPct) {
  if (trafficGrowthPct >= 0 && conversionGrowthPct >= 0) return { key: "strong", color: retail.good };
  if (trafficGrowthPct < 0 && conversionGrowthPct >= 0) return { key: "trafficProblem", color: retail.blue };
  if (trafficGrowthPct >= 0 && conversionGrowthPct < 0) return { key: "conversionProblem", color: retail.orange };
  return { key: "needsAttention", color: retail.bad };
}

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}

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

// Real ClickHouse-backed Store Performance Quadrant — see
// api/_retail-store-quadrant.js (dispatched via ?report=storeQuadrant).
// Foot traffic growth (x) vs conversion rate change in percentage points
// (y), bubble size = revenue. Scoped to the 10 walk-in branches only, same
// as the Foot Traffic tab — see that report's own data quality notes.
export default function StorePerformanceQuadrant({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (dr, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...dateRangeParams(dr), report: "storeQuadrant" });
      const res = await fetch(`/api/retail-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      setData(json);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(dateRange, controller.signal);
    return () => controller.abort();
  }, [dateRange, load]);

  const bubbleData = (data?.table || []).map((s) => {
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
    <Panel title="Store Performance Quadrant" subtitle="Foot traffic growth vs conversion rate change (pp) — bubble size represents revenue" className="mt-4">
      {loading && !data && <LoadingState label="Loading Store Performance Quadrant…" />}
      {error && <ErrorState label={`Couldn't load Store Performance Quadrant: ${error}`} />}
      {data && !error && bubbleData.length === 0 && (
        <EmptyState label="No foot-traffic data available for both this period and the prior one yet — check back once today's data has synced." />
      )}
      {data && !error && bubbleData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
          <BubbleChart
            data={bubbleData}
            xLabel="Foot Traffic Growth %"
            yLabel="Conversion Rate Change (pp)"
            xValueFormatter={(v) => `${v.toFixed(0)}%`}
            yValueFormatter={(v) => `${v.toFixed(0)}pp`}
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
      )}
    </Panel>
  );
}
