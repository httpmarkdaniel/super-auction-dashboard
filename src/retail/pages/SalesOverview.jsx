import { useCallback, useEffect, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import ToggleSm from "../components/ToggleSm";
import Hero from "../components/Hero";
import { InsightList } from "../components/InsightCard";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, BarComparisonChart, DualAxisComboChart } from "../components/Charts";
import { retail } from "../theme";
import { formatPeso, formatCompactPeso, formatNum, formatPct } from "../format";

const VIEW_OPTIONS = [
  { key: "weekly", label: "Weekly (WoW)" },
  { key: "mtd", label: "MTD" },
];

const AGE_BUCKET_COLOR = {
  "0-30 days": retail.blue,
  "31-60 days": retail.good,
  "61-90 days": retail.orange,
  "91-180 days": retail.purple,
  "180+ days": retail.bad,
};

function AgeBar({ label, pct, color }) {
  return (
    <div className="grid gap-2.5 items-center mb-2.5" style={{ gridTemplateColumns: "1.3fr 2fr .5fr" }}>
      <div className="text-[13px]" style={{ color: retail.ink }}>
        {label}
      </div>
      <div className="h-4 rounded-full overflow-hidden" style={{ background: "#edf3fa" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <div className="text-[13px] text-right" style={{ color: retail.ink }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

// Real ClickHouse-backed Sales Overview — see api/_retail-sales-overview.js
// (dispatched via ?report=salesOverview). "Weekly" compares the last full
// Mon-Sun week against the week before (not week-to-date); "MTD" compares
// month-to-date against the same elapsed span last month. Inventory
// figures are a CURRENT point-in-time snapshot, independent of this
// toggle. Two mockup sections are deliberately NOT included — see
// Data Quality Notes at the bottom for why (Sales by Payment Method:
// the only real payment-method field covers ~4% of actual transaction
// volume; Products to Watch/days-of-supply: the sales↔inventory
// product-name join is too weak to trust per-product).
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

  if (loading && !data) return <LoadingState label="Loading Sales Overview…" />;
  if (error) return <ErrorState label={`Couldn't load Sales Overview: ${error}`} />;
  if (!data) return null;

  const trendChartData = data.salesTrend.map((r) => ({ label: r.date.slice(5), bar: r.revenue, line: r.units }));
  const channelSegments = data.salesByChannel.map((c, i) => ({ label: c.channel, value: c.gmv, color: retail.series[i % retail.series.length] }));
  const regionSegments = data.salesByRegion.map((r, i) => ({ label: r.region, value: r.gmv, color: retail.series[i % retail.series.length] }));
  const hourChartData = data.salesByHour.filter((h) => h.hour >= 6 && h.hour <= 23).map((h) => ({ label: `${h.hour}:00`, value: h.gmv }));
  const totalInvUnits = data.inventoryAge.reduce((s, b) => s + b.units, 0);

  return (
    <div>
      <Hero
        eyebrow="Retail performance"
        title="Driving sales through smarter insights."
        description="Track sales, foot traffic, and customer trends in real time across physical stores, HRH Online, and wholesale accounts."
        stats={[
          { label: "Total Sales", value: formatCompactPeso(data.hero.totalSales.value), delta: data.hero.totalSales.delta, sub: "vs previous period" },
          { label: "Units Sold", value: formatNum(data.hero.unitsSold.value), delta: data.hero.unitsSold.delta, sub: "vs previous period" },
          { label: "Sell-Through Rate", value: data.hero.sellThroughPct === null ? "—" : formatPct(data.hero.sellThroughPct), sub: "vs current inventory" },
        ]}
      />

      <Panel action={<ToggleSm value={view} onChange={setView} options={VIEW_OPTIONS} />} className="mb-3.5">
        <KpiRow>
          <KpiCard label={view === "mtd" ? "MTD Revenue" : "Revenue"} value={formatPeso(data.kpis.revenue.value)} delta={data.kpis.revenue.delta} previousLabel={formatPeso(data.kpis.revenue.previous)} />
          <KpiCard
            label={view === "mtd" ? "MTD Transactions" : "Transactions"}
            value={formatNum(data.kpis.transactions.value)}
            delta={data.kpis.transactions.delta}
            previousLabel={formatNum(data.kpis.transactions.previous)}
          />
          <KpiCard label={view === "mtd" ? "MTD ABS" : "ABS"} value={formatPeso(data.kpis.abs.value)} delta={data.kpis.abs.delta} previousLabel={formatPeso(data.kpis.abs.previous)} sub="Avg Basket Size" />
          <KpiCard label="Active SKUs" value={formatNum(data.moreKpis.activeSkus)} sub="Distinct products sold" />
          <KpiCard label="Total Customers" value={formatNum(data.moreKpis.totalCustomers)} sub="Named customers, current period" />
          <KpiCard label="New / Returning" value={`${formatNum(data.moreKpis.newCustomers)} / ${formatNum(data.moreKpis.returningCustomers)}`} sub="Named customers" />
        </KpiRow>
        {view === "mtd" && data.kpis.attainment && (
          <div className="mt-1">
            <KpiRow>
              <KpiCard
                label="MTD Attainment"
                value={data.kpis.attainment.value === null ? "—" : formatPct(data.kpis.attainment.value)}
                sub={data.kpis.attainment.target > 0 ? `vs ${formatPeso(data.kpis.attainment.target)} target` : "No target set"}
              />
            </KpiRow>
          </div>
        )}
      </Panel>

      <div className="grid gap-3.5 mb-3.5" style={{ gridTemplateColumns: "1.25fr .95fr .9fr" }}>
        <Panel title="Sales Trend" subtitle="Revenue and units sold">
          <DualAxisComboChart data={trendChartData} barName="Revenue" barColor={retail.blue} lineName="Units Sold" lineColor={retail.orange} barValueFormatter={formatCompactPeso} lineValueFormatter={formatNum} />
        </Panel>
        <Panel title="Sales by Channel" subtitle="Contribution mix">
          <DonutChart segments={channelSegments} centerValue={formatCompactPeso(channelSegments.reduce((s, c) => s + c.value, 0))} centerLabel="Total" size={180} />
        </Panel>
        <Panel title="Insights" subtitle="What deserves attention now">
          <InsightList items={data.insights} />
        </Panel>
      </div>

      <div className="grid gap-3.5 mb-3.5" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Panel title="Top Categories by Sales">
          <DataTable
            columns={[
              { key: "category", label: "Category" },
              { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
              { key: "sharePct", label: "% of Total", render: (r) => formatPct(r.sharePct) },
              { key: "units", label: "Units", render: (r) => formatNum(r.units) },
            ]}
            rows={data.topCategories}
            emptyLabel="No sales in this period."
          />
        </Panel>
        <Panel title="Top Stores by Sales">
          <DataTable
            columns={[
              { key: "store", label: "Store" },
              { key: "cur", label: "Sales", render: (r) => formatPeso(r.cur) },
              { key: "growth", label: "Growth", render: (r) => (r.deltaPct === null ? "—" : `${r.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(r.deltaPct).toFixed(1)}%`) },
            ]}
            rows={data.topStores}
            emptyLabel="No sales in this period."
          />
        </Panel>
        <Panel title="Sales by Region" subtitle="Share of total sales">
          <DonutChart segments={regionSegments} centerValue={formatCompactPeso(regionSegments.reduce((s, r) => s + r.value, 0))} centerLabel="Total" size={160} />
          <div className="grid gap-2 text-[13px] mt-2.5">
            {data.salesByRegion.map((r) => (
              <div key={r.region} className="flex justify-between gap-3">
                <span style={{ color: retail.ink2 }}>{r.region}</span>
                <b style={{ color: retail.ink }}>{r.sharePct.toFixed(1)}%</b>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3.5 mb-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Panel title="Sales by Hour" subtitle="All channels, 6am-11pm">
          <BarComparisonChart data={hourChartData} xKey="label" series={[{ key: "value", name: "Sales", color: retail.blue }]} valueFormatter={formatCompactPeso} />
        </Panel>
        <Panel title="Inventory Overview" subtitle="Current snapshot, all stores in scope">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-3.5" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
              <div className="text-[12px] font-semibold" style={{ color: retail.muted }}>
                Total Inventory Value
              </div>
              <div className="text-[22px] font-extrabold mt-1" style={{ color: retail.ink }}>
                {formatCompactPeso(data.inventoryOverview.inventoryValue)}
              </div>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
              <div className="text-[12px] font-semibold" style={{ color: retail.muted }}>
                Total Units on Hand
              </div>
              <div className="text-[22px] font-extrabold mt-1" style={{ color: retail.ink }}>
                {formatNum(data.inventoryOverview.unitsOnHand)}
              </div>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
              <div className="text-[12px] font-semibold" style={{ color: retail.muted }}>
                Low Stock Items (≤2 units)
              </div>
              <div className="text-[22px] font-extrabold mt-1" style={{ color: retail.orange }}>
                {formatNum(data.inventoryOverview.lowStockItems)}
              </div>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: retail.bg, border: `1px solid ${retail.border}` }}>
              <div className="text-[12px] font-semibold" style={{ color: retail.muted }}>
                Out of Stock (recently active)
              </div>
              <div className="text-[22px] font-extrabold mt-1" style={{ color: retail.bad }}>
                {formatNum(data.inventoryOverview.outOfStockItems)}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3.5 mb-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Panel title="Top Selling Products">
          <DataTable
            columns={[
              { key: "product", label: "Product", maxWidth: 260 },
              { key: "department", label: "Department" },
              { key: "gmv", label: "Sales", render: (r) => formatPeso(r.gmv) },
              { key: "units", label: "Units", render: (r) => formatNum(r.units) },
            ]}
            rows={data.topProducts}
            emptyLabel="No sales in this period."
          />
        </Panel>
        <Panel title="Inventory Age Distribution" subtitle="Current in-stock units, by days since received">
          {data.inventoryAge.map((b) => (
            <AgeBar key={b.bucket} label={b.bucket} pct={totalInvUnits ? (b.units / totalInvUnits) * 100 : 0} color={AGE_BUCKET_COLOR[b.bucket]} />
          ))}
        </Panel>
      </div>

      {data.dataQuality?.length > 0 && (
        <Panel title="Data Quality Notes">
          <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: retail.ink2 }}>
            {data.dataQuality.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
