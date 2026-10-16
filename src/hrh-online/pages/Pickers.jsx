import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, KpiRow } from "../components/Kpi";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { BarComparisonChart } from "../components/Charts";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatNum, formatPct } from "../format";

// HMR MART picker performance (Click & Collect-style view) from its own WMS
// — see api/_hrh-pickers.js (?report=pickers) for the source and the
// Pick time / Response time definitions. The API returns flat per-order
// rows; every number on this page is computed from them here, so the
// channel pills re-slice instantly without another request.

const MAX_PICK_SECONDS = 24 * 3600; // longer = stale/abandoned session, kept out of the timings
const MAX_RESPONSE_SECONDS = 7 * 24 * 3600;
const WITHIN_SECONDS = 30 * 60;
const CHANNELS = ["TikTok", "Website · Pickup", "Website · Delivery", "Other"];
const CHANNEL_COLOR = { TikTok: hrh.series[0], "Website · Pickup": hrh.accent, "Website · Delivery": hrh.blue, Other: hrh.muted };
const BUCKETS = [
  { label: "0–10m", max: 600 },
  { label: "10–20m", max: 1200 },
  { label: "20–30m", max: 1800 },
  { label: "30–60m", max: 3600 },
  { label: "1–2h", max: 7200 },
  { label: "2h+", max: Infinity },
];
const STATUS_COLOR = {
  Shipped: { bg: "#e8f6ed", text: hrh.good },
  Packed: { bg: hrh.blueSoft, text: hrh.blueText },
  "At QC": { bg: "#fff3d9", text: "#a66900" },
  Picking: { bg: hrh.accentSoft, text: hrh.accentText },
};

const validPick = (o) => o.pickSeconds !== null && o.pickSeconds > 0 && o.pickSeconds <= MAX_PICK_SECONDS;
const validResponse = (o) => o.responseSeconds !== null && o.responseSeconds >= 0 && o.responseSeconds <= MAX_RESPONSE_SECONDS;
const statusOf = (o) => (o.isShipped ? "Shipped" : o.isPacked ? "Packed" : o.qcAt ? "At QC" : "Picking");

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
const formatTime = (ts) => (ts ? String(ts).slice(0, 16) : "—");

function timingStats(orders) {
  const picks = orders.filter(validPick).map((o) => o.pickSeconds);
  const responses = orders.filter(validResponse).map((o) => o.responseSeconds);
  return {
    medianPick: median(picks),
    withinPct: picks.length ? (picks.filter((s) => s <= WITHIN_SECONDS).length / picks.length) * 100 : null,
    withinCount: picks.filter((s) => s <= WITHIN_SECONDS).length,
    timedCount: picks.length,
    medianResponse: median(responses),
  };
}

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

function Pills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="text-[14px] px-3 py-[9px] rounded-lg whitespace-nowrap"
            style={
              active
                ? { background: "#f2f5fa", color: hrh.ink, border: "1px solid #51617e", fontWeight: 650 }
                : { background: hrh.surface, color: hrh.ink, border: `1px solid ${hrh.border}` }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ status }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[12px] font-semibold" style={{ background: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

const CHANNEL_COLUMNS = [
  {
    key: "channel",
    label: "Channel",
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: CHANNEL_COLOR[r.channel] }} />
        {r.channel}
      </span>
    ),
  },
  { key: "orders", label: "Orders", render: (r) => formatNum(r.orders) },
  { key: "medianResponse", label: "Median Response", render: (r) => formatDuration(r.medianResponse) },
  { key: "medianPick", label: "Median Pick", render: (r) => formatDuration(r.medianPick) },
  { key: "withinPct", label: "Picked ≤30m", render: (r) => formatPct(r.withinPct) },
];

const LEADERBOARD_COLUMNS = [
  { key: "rank", label: "#" },
  { key: "picker", label: "Picker", maxWidth: 200 },
  { key: "orders", label: "Orders Picked", render: (r) => formatNum(r.orders) },
  { key: "items", label: "Items", render: (r) => formatNum(r.items) },
  { key: "medianPick", label: "Median Pick", render: (r) => formatDuration(r.medianPick) },
  { key: "withinPct", label: "Picked ≤30m", render: (r) => formatPct(r.withinPct) },
  { key: "share", label: "Share of Orders", render: (r) => formatPct(r.share) },
];

const WORKBENCH_COLUMNS = [
  { key: "orderId", label: "Order ID" },
  { key: "channel", label: "Channel" },
  { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
  { key: "picker", label: "Picker", maxWidth: 170, render: (r) => r.picker || "—" },
  { key: "orderPlacedAt", label: "Order Placed", render: (r) => formatTime(r.orderPlacedAt) },
  { key: "pickStartedAt", label: "Pick Started", render: (r) => formatTime(r.pickStartedAt) },
  { key: "qcAt", label: "At QC", render: (r) => formatTime(r.qcAt) },
  { key: "responseSeconds", label: "Response", render: (r) => (validResponse(r) ? formatDuration(r.responseSeconds) : "—") },
  { key: "pickSeconds", label: "Pick Time", render: (r) => (validPick(r) ? formatDuration(r.pickSeconds) : "—") },
  { key: "items", label: "Items", render: (r) => formatNum(r.items) },
  { key: "courier", label: "Courier", render: (r) => r.courier || "—" },
  { key: "waybill", label: "Waybill", render: (r) => r.waybill || "—" },
];

export default function Pickers({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const ready = isDateRangeReady(dateRange);
  const params = new URLSearchParams({ report: "pickers", ...dateRangeParams(dateRange) }).toString();

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/hrh-sales-analytics?${params}`, { signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
        setData(body);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [params]
  );

  useEffect(() => {
    if (!ready) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [ready, load]);

  const allOrders = useMemo(() => (data?.orders || []).map((o) => ({ ...o, id: o.orderId, status: statusOf(o) })), [data]);
  const orders = useMemo(() => (channel === "all" ? allOrders : allOrders.filter((o) => o.channel === channel)), [allOrders, channel]);

  const view = useMemo(() => {
    const overall = timingStats(orders);
    const picked = orders.filter((o) => o.qcAt);

    const byChannel = CHANNELS.map((c) => {
      const rows = allOrders.filter((o) => o.channel === c);
      return { channel: c, orders: rows.length, ...timingStats(rows) };
    }).filter((r) => r.orders > 0);

    const pickerMap = new Map();
    for (const o of picked) {
      const key = o.picker || "Unassigned";
      if (!pickerMap.has(key)) pickerMap.set(key, []);
      pickerMap.get(key).push(o);
    }
    const leaderboard = [...pickerMap.entries()]
      .map(([picker, rows]) => ({
        id: picker,
        picker,
        orders: rows.length,
        items: rows.reduce((n, o) => n + o.items, 0),
        share: picked.length ? (rows.length / picked.length) * 100 : 0,
        ...timingStats(rows),
      }))
      .sort((a, b) => b.orders - a.orders || (a.medianPick ?? Infinity) - (b.medianPick ?? Infinity))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const distribution = BUCKETS.map((b) => ({ label: b.label, orders: 0 }));
    for (const o of orders.filter(validPick)) {
      distribution[BUCKETS.findIndex((b) => o.pickSeconds <= b.max)].orders += 1;
    }

    return {
      overall,
      picked: picked.length,
      pickedItems: picked.reduce((n, o) => n + o.items, 0),
      inProgress: orders.filter((o) => !o.isPacked && !o.isShipped).length,
      byChannel,
      leaderboard,
      distribution,
    };
  }, [orders, allOrders]);

  const workbenchRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (status === "all" || o.status === status) &&
        (!q || [o.orderId, o.picker, o.waybill, o.basket].some((v) => v && String(v).toLowerCase().includes(q)))
    );
  }, [orders, status, search]);

  const channelOptions = [
    { key: "all", label: "All Channels" },
    ...CHANNELS.filter((c) => allOrders.some((o) => o.channel === c)).map((c) => ({ key: c, label: c })),
  ];
  const statusOptions = [{ key: "all", label: "All" }, ...Object.keys(STATUS_COLOR).map((s) => ({ key: s, label: s }))];

  return (
    <div>
      {ready && loading && !data && <LoadingState label="Loading picker data…" />}
      {error && <ErrorState label={`Couldn't load picker data: ${error}`} />}
      {data && !error && (
        <>
          {loading && <div className="mb-3 text-[13px]" style={{ color: hrh.muted }}>Updating…</div>}
          <div className="mb-4">
            <Pills options={channelOptions} value={channel} onChange={setChannel} />
          </div>

          <KpiRow>
            <KpiCard label="Median Pick Time" value={formatDuration(view.overall.medianPick)} sub="pick start → basket at QC" />
            <KpiCard
              label="Within 30 Mins"
              value={formatPct(view.overall.withinPct)}
              sub={`${formatNum(view.overall.withinCount)} of ${formatNum(view.overall.timedCount)} orders`}
            />
            <KpiCard label="Picked Orders" value={formatNum(view.picked)} sub={`${formatNum(view.pickedItems)} items`} />
            <KpiCard label="In Progress" value={formatNum(view.inProgress)} sub="picking started, not yet packed" />
          </KpiRow>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <Panel title="Pick Response Time, per Channel" subtitle="Median time from order placed to picking started — HMR MART is one warehouse, so channels stand in for stores">
              <BarComparisonChart
                data={view.byChannel.map((r) => ({ label: r.channel, response: r.medianResponse === null ? 0 : Math.round(r.medianResponse / 60) }))}
                series={[{ key: "response", name: "Median response (min)", color: hrh.series[0] }]}
                valueFormatter={(v) => formatDuration(v * 60)}
                horizontal
                height={Math.max(160, view.byChannel.length * 48)}
              />
              <div className="mt-3">
                <DataTable columns={CHANNEL_COLUMNS} rows={view.byChannel.map((r) => ({ ...r, id: r.channel }))} exportName="pick-response-by-channel" />
              </div>
            </Panel>

            <Panel title="Pick Time Distribution" subtitle="Orders by pick time (pick start → basket at QC)">
              <BarComparisonChart
                data={view.distribution}
                series={[{ key: "orders", name: "Orders", color: hrh.accent }]}
                valueFormatter={(v) => formatNum(v)}
                height={300}
              />
            </Panel>
          </div>

          <Panel title="Picker Leaderboard" subtitle="Ranked by orders picked in this period" className="mb-4">
            <DataTable columns={LEADERBOARD_COLUMNS} rows={view.leaderboard} paginate pageSize={10} exportName="picker-leaderboard" />
          </Panel>

          <Panel
            title="Order Workbench"
            subtitle={`${formatNum(workbenchRows.length)} orders — newest first`}
            action={
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order, picker, waybill…"
                className="text-[13px] px-3 py-2 rounded-lg w-64"
                style={{ border: `1px solid ${hrh.border}`, color: hrh.ink }}
              />
            }
          >
            <div className="mb-3">
              <Pills options={statusOptions} value={status} onChange={setStatus} />
            </div>
            <DataTable columns={WORKBENCH_COLUMNS} rows={workbenchRows} paginate pageSize={10} exportName="order-workbench" />
          </Panel>

          <p className="mt-4 text-[12px]" style={{ color: hrh.muted }}>
            Source: HMR MART WMS (xv3.mart_order_fulfilment_journey). Pick times over 24 h or not positive are left out of the timings as data errors.
          </p>
        </>
      )}
    </div>
  );
}
