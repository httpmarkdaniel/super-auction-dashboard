import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import ToggleSm from "../components/ToggleSm";
import { LoadingState, ErrorState } from "../components/States";
import { retail } from "../theme";
import { formatPeso, formatNum, formatPct } from "../format";

const VIEW_OPTIONS = [
  { key: "weekly", label: "Weekly (WoW)" },
  { key: "mtd", label: "MTD" },
];

// Real ClickHouse-backed Sales Overview — see api/_retail-sales-overview.js
// (dispatched via ?report=salesOverview). "Weekly" compares the last full
// Mon-Sun week against the week before (not week-to-date); "MTD" compares
// month-to-date against the same elapsed span last month.
export default function SalesOverview({ filters }) {
  const { segment } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("weekly");

  const load = useCallback(async (seg, v, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ segment: seg, view: v, report: "salesOverview" });
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
    load(segment, view, controller.signal);
    return () => controller.abort();
  }, [segment, view, load]);

  const periodLabel = data?.meta?.current ? `${data.meta.current.from} to ${data.meta.current.to}` : "";
  const glance = data?.atAGlance;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "#111827" }}>
            Sales Overview
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#5b6573" }}>
            Net of Returns · Retail includes HRH Online
          </p>
        </div>
        {data?.meta?.current && (
          <span className="text-[11.5px] font-semibold text-right" style={{ color: retail.ink2 }}>
            {periodLabel}
          </span>
        )}
      </div>

      {loading && !data && <LoadingState label="Loading Sales Overview…" />}
      {error && <ErrorState label={`Couldn't load Sales Overview: ${error}`} />}

      {data && !error && (
        <>
          <Panel title="Overview" action={<ToggleSm value={view} onChange={setView} options={VIEW_OPTIONS} />} className="mb-4">
            <KpiRow>
              <KpiCard label={view === "mtd" ? "MTD Revenue" : "Revenue"} value={formatPeso(data.kpis.revenue.value)} delta={data.kpis.revenue.delta} previousLabel={formatPeso(data.kpis.revenue.previous)} />
              <KpiCard
                label={view === "mtd" ? "MTD Transactions" : "Transactions"}
                value={formatNum(data.kpis.transactions.value)}
                delta={data.kpis.transactions.delta}
                previousLabel={formatNum(data.kpis.transactions.previous)}
              />
              <KpiCard label={view === "mtd" ? "MTD Units Sold" : "Units Sold"} value={formatNum(data.kpis.units.value)} delta={data.kpis.units.delta} previousLabel={formatNum(data.kpis.units.previous)} />
              <KpiCard label={view === "mtd" ? "MTD ABS" : "ABS"} value={formatPeso(data.kpis.abs.value)} delta={data.kpis.abs.delta} previousLabel={formatPeso(data.kpis.abs.previous)} sub="Avg Basket Size" />
              {view === "mtd" && data.kpis.attainment && (
                <KpiCard
                  label="MTD Attainment"
                  value={data.kpis.attainment.value === null ? "—" : formatPct(data.kpis.attainment.value)}
                  sub={data.kpis.attainment.target > 0 ? `vs ${formatPeso(data.kpis.attainment.target)} target` : "No target set"}
                />
              )}
            </KpiRow>
          </Panel>

          <Panel title="At a Glance" className="mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-2">
              {glance?.topStore && (
                <KpiCard label={`Top Performing Store (${view.toUpperCase()})`} value={glance.topStore.store} delta={glance.topStore.deltaPct} sub={view === "mtd" ? "vs Last Month" : "WoW"} />
              )}
              {glance?.worstStore && (
                <KpiCard label={`Steepest Decline (${view.toUpperCase()})`} value={glance.worstStore.store} delta={glance.worstStore.deltaPct} sub={view === "mtd" ? "vs Last Month" : "WoW"} />
              )}
              {glance?.topChannel && <KpiCard label={`Top Channel (${view.toUpperCase()})`} value={glance.topChannel.channel} sub={formatPeso(glance.topChannel.gmv)} />}
              {glance?.topProduct && <KpiCard label="Top Product" value={glance.topProduct.product} sub={formatPeso(glance.topProduct.gmv)} />}
              {glance?.newVsReturning && (
                <KpiCard
                  label="New vs Returning Revenue"
                  value={`${glance.newVsReturning.newPct.toFixed(0)}% / ${glance.newVsReturning.returningPct.toFixed(0)}%`}
                  sub={glance.newVsReturning.returningPct >= glance.newVsReturning.newPct ? "Returning is the majority" : "New is the majority"}
                />
              )}
            </div>
            <div className="text-[11.5px]" style={{ color: retail.muted }}>
              These are quick reference points — the other tabs have the full breakdown behind each figure.
            </div>
          </Panel>

          {data.notableChanges?.length > 0 && (
            <Panel title="Notable Changes" className="mb-4">
              <ul className="list-disc pl-5 space-y-1.5 text-[12.5px]" style={{ color: retail.ink }}>
                {data.notableChanges.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Panel>
          )}

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: retail.ink2 }}>
                {data.dataQuality.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
