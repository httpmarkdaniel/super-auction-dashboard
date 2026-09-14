import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import TrendBucketPills from "../components/TrendBucketPills";
import { LoadingState, ErrorState } from "../components/States";
import { DonutChart, BarComparisonChart, StackedAreaChart } from "../components/Charts";
import { bucketRows } from "../trendBucket";
import { hrh } from "../theme";
import { formatPct, formatNum } from "../format";

const STATUS_COLOR = {
  Resolved: hrh.good,
  "Did not respond": hrh.bad,
  Pending: hrh.accent,
  Escalated: "#7a3fae",
  Unknown: hrh.muted,
};
const STATUS_PILL = {
  Resolved: { bg: "#e6f4ea", text: hrh.good },
  "Did not respond": { bg: "#faeaea", text: hrh.bad },
  Pending: { bg: hrh.accentSoft, text: hrh.accentText },
  Escalated: { bg: "#eee0f7", text: "#7a3fae" },
  Unknown: { bg: "#f0f1f5", text: hrh.ink2 },
};

function StatusPill({ status }) {
  const c = STATUS_PILL[status] || STATUS_PILL.Unknown;
  return (
    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

const NEEDS_ATTENTION_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
  { key: "name", label: "Customer" },
  { key: "source", label: "Source" },
  { key: "product", label: "Product / Item", maxWidth: 200 },
  { key: "concern", label: "Concern" },
  { key: "remarks", label: "Remarks", maxWidth: 220 },
];

const CONCERN_COLUMNS = [
  { key: "category", label: "Concern / Inquiry Category" },
  { key: "count", label: "Count", render: (r) => formatNum(r.count) },
];

const PRODUCT_COLUMNS = [
  { key: "product", label: "Product / Item Mentioned" },
  { key: "count", label: "Mentions", render: (r) => formatNum(r.count) },
];

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return { range: "custom", from: dateRange.from, to: dateRange.to };
  }
  return { range: dateRange };
}
function isDateRangeReady(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") {
    return Boolean(dateRange.from && dateRange.to && dateRange.from <= dateRange.to);
  }
  return Boolean(dateRange);
}

// Real ClickHouse-backed Customer Success — see
// api/_hrh-customer-success.js (dispatched from api/hrh-sales-analytics.js
// via ?report=customerSuccess) for the queries. Source is
// xv3.mart_sales_customer_tracking, a customer-inquiry/support log
// (chatbot, social media, calls) — HMR-wide, not scoped by store or
// sales channel (that table has no such column), so this page respects
// the Date Range filter but hides the Channel filter entirely.
export default function CustomerSuccess({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendBucket, setTrendBucket] = useState("day");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...p, report: "customerSuccess" });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
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
    if (!ready) return;
    const controller = new AbortController();
    load(params, controller.signal);
    return () => controller.abort();
  }, [params, ready, load]);

  const statusSegments = data?.statusBreakdown?.map((s) => ({ label: s.status, value: s.count, color: STATUS_COLOR[s.status] || hrh.muted })) || [];
  const sourceBars = data?.sourceBreakdown?.map((s) => ({ label: s.source, value: s.count })) || [];

  const trendWithOther = (data?.trend || []).map((r) => ({
    ...r,
    other: Math.max(0, r.total - r.resolved - r.didNotRespond),
  }));
  const trendRows = bucketRows(trendWithOther, trendBucket, ["total", "resolved", "didNotRespond", "other"]);

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Customer Success
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Customer Success…" />}
      {error && <ErrorState label={`Couldn't load Customer Success: ${error}`} />}

      {data && !error && (
        <>
          <div className="text-[11.5px] mb-4" style={{ color: hrh.muted }}>
            {data.meta?.scopeNote}
          </div>

          <KpiRow>
            <KpiCard label="Total Inquiries" value={formatNum(data.kpis.totalInquiries.value)} />
            <KpiCard label="Resolved Rate" value={formatPct(data.kpis.resolvedRate.value)} sub={data.kpis.resolvedRate.sub} />
            <KpiCard label="Did Not Respond Rate" value={formatPct(data.kpis.didNotRespondRate.value)} sub={data.kpis.didNotRespondRate.sub} />
            <KpiCard label="Pending" value={formatNum(data.kpis.pending.value)} />
            <KpiCard label="Escalated" value={formatNum(data.kpis.escalated.value)} />
          </KpiRow>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Status Breakdown" subtitle="All inquiries in the selected period">
              <DonutChart segments={statusSegments} centerValue={formatNum(data.kpis.totalInquiries.value)} centerLabel="Total Inquiries" />
            </Panel>
            <Panel title="Inquiries by Source" subtitle="Where the inquiry came in — chatbot, social media, calls">
              <BarComparisonChart data={sourceBars} series={[{ key: "value", name: "Inquiries", color: hrh.blue }]} valueFormatter={formatNum} horizontal />
            </Panel>
          </div>

          <Panel
            title="Inquiry Volume Trend"
            subtitle="Resolved / Did Not Respond / Other (Pending, Escalated, Unknown), by date reported"
            action={<TrendBucketPills value={trendBucket} onChange={setTrendBucket} />}
            className="mb-4"
          >
            <StackedAreaChart
              data={trendRows}
              xKey="dateLabel"
              stacked
              valueFormatter={formatNum}
              categories={[
                { key: "resolved", name: "Resolved", color: hrh.good },
                { key: "didNotRespond", name: "Did Not Respond", color: hrh.bad },
                { key: "other", name: "Other (Pending/Escalated)", color: hrh.muted },
              ]}
            />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <Panel title="Concern / Inquiry Categories" subtitle="Normalized from free text — top 15">
              <DataTable columns={CONCERN_COLUMNS} rows={data.concernCategories} emptyLabel="No inquiries in this period." />
            </Panel>
            <Panel title="Top Products / Items Mentioned" subtitle="Normalized from free text — top 15">
              <DataTable columns={PRODUCT_COLUMNS} rows={data.topProducts} emptyLabel="No products mentioned in this period." />
            </Panel>
          </div>

          <Panel title="Needs Attention" subtitle="Every inquiry not marked Resolved — Did Not Respond, Pending, Escalated, or Unknown" className="mb-4">
            <DataTable
              columns={NEEDS_ATTENTION_COLUMNS}
              rows={data.needsAttention}
              paginate
              pageSize={10}
              emptyLabel="Every inquiry in this period is Resolved."
            />
          </Panel>

          {data.dataQuality?.length > 0 && (
            <Panel title="Data Quality Notes">
              <ul className="list-disc pl-5 space-y-1.5 text-[12px]" style={{ color: hrh.ink2 }}>
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
