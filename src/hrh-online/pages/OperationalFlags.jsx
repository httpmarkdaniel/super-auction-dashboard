import { useEffect, useState } from "react";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import SeverityBadge from "../components/SeverityBadge";
import { KpiCard, KpiRow } from "../components/Kpi";
import { LoadingState } from "../components/States";
import { formatNum, formatPeso } from "../format";

// Real Operational Flags — deterministic rules over data the HRH Online
// pages already load (no new API): Orders & Fulfillment, Pickup &
// Delivery, Inventory Aging, Stocks (barcode lifecycle) and Customer
// Success. Each check always shows a row — Good (0) when nothing is wrong
// — so it's visible that it ran. Rules, agreed 2026-09-25:
//   1 Orders        Paid but not yet invoiced            critical if any
//   2 Orders        COD awaiting confirmation            warning if any
//   3 Fulfillment   Orders not picked after 24h (live)   warning >24h, critical >48h
//   4 Cancellations Cancellation rate up vs previous     warning +5 pts, critical +10 pts
//   5 Cancellations Cancellations with no reason         warning if any
//   6 Returns       Return rate up vs previous           warning if up
//   7 Inventory     Non-moving SKUs (61+ days, never sold, live) warning if any
//   8 Inventory     Slow-moving SKUs (61+ days, no sale in 30d, live) warning if any
//   9 Publishing    Received but not yet posted          warning if any
//  10 Cust. Success Escalated / pending inquiries        critical if escalated, warning if pending
// Order-based checks (1-6) are HMRPH Online only — the only channel the
// order data covers.

const SEVERITY_RANK = { critical: 0, warning: 1, unavailable: 2, good: 3 };

function dateRangeParams(dateRange) {
  if (dateRange && typeof dateRange === "object" && dateRange.key === "custom") return { range: "custom", from: dateRange.from, to: dateRange.to };
  return { range: dateRange };
}
// "Previous period" basis for the rate comparisons — same granularity as
// the selected range.
function compareToFor(dateRange) {
  const key = typeof dateRange === "object" ? dateRange?.key : dateRange;
  if (key === "mtd" || key === "prevMonth" || key === "ytd" || key === "prevYear") return "month";
  return "week";
}

async function getReport(report, params) {
  const qs = new URLSearchParams({ report, ...params });
  const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = await res.json();
  if (json.error) throw new Error(json.message || json.error);
  return json;
}

// Order/journey timestamps are Manila local time ("YYYY-MM-DD HH:MM:SS").
function ageDays(ts) {
  if (!ts) return null;
  const t = Date.parse(`${String(ts).slice(0, 19).replace(" ", "T")}${String(ts).length > 10 ? "" : "T00:00:00"}+08:00`);
  return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 86400000) : null;
}
function ageHours(ts) {
  const d = ageDays(ts);
  return d === null ? null : d * 24;
}
const pts = (v) => `${v.toFixed(1)}%`;

function buildFlags({ of, pd, ia, ba, cs }) {
  const rows = [];
  const push = (r) => rows.push({ id: `f${rows.length + 1}`, ...r });
  const unavailable = (area, flag, page, err) =>
    push({ severity: "unavailable", area, flag, affectedCount: null, ageDays: null, detail: `Couldn't load: ${err}`, page });

  // 1–6: Orders & Fulfillment (+ its returns block)
  if (of.error) {
    ["Paid but not yet invoiced", "COD awaiting confirmation"].forEach((f) => unavailable("Orders", f, "fulfillment", of.error));
    ["Cancellation rate up vs previous period", "Cancellations with no reason given"].forEach((f) => unavailable("Cancellations", f, "returnsCancellation", of.error));
    unavailable("Returns", "Return rate up vs previous period", "returnsCancellation", of.error);
  } else {
    const k = of.data.kpis || {};
    const unresolved = of.data.unresolvedOrders || [];
    const oldest = (status) => {
      const r = unresolved.find((o) => (status === "Pending" ? o.paymentStatus === "Pending" : o.paymentStatus !== "Pending"));
      return r ? ageDays(r.orderDate) : null;
    };
    const paid = k.stillAwaitingFulfillment?.paid || { count: 0, value: 0 };
    push({
      severity: paid.count > 0 ? "critical" : "good",
      area: "Orders",
      flag: "Paid but not yet invoiced",
      affectedCount: paid.count,
      ageDays: paid.count > 0 ? oldest("Paid") : null,
      detail: paid.count > 0 ? `${formatPeso(paid.value)} paid with no invoice yet` : "Every paid order has an invoice",
      page: "fulfillment",
    });
    const cod = k.stillAwaitingFulfillment?.pending || { count: 0, value: 0 };
    push({
      severity: cod.count > 0 ? "warning" : "good",
      area: "Orders",
      flag: "COD awaiting confirmation",
      affectedCount: cod.count,
      ageDays: cod.count > 0 ? oldest("Pending") : null,
      detail: cod.count > 0 ? `${formatPeso(cod.value)} waiting for phone confirmation` : "No COD orders waiting",
      page: "fulfillment",
    });
    const cr = k.cancellationRate || {};
    const crUp = cr.value !== null && cr.value !== undefined && cr.previous !== null && cr.previous !== undefined ? cr.value - cr.previous : null;
    push({
      severity: crUp === null ? "good" : crUp >= 10 ? "critical" : crUp >= 5 ? "warning" : "good",
      area: "Cancellations",
      flag: "Cancellation rate up vs previous period",
      affectedCount: k.cancelledOrders?.value ?? null,
      ageDays: null,
      detail: crUp === null ? "No previous period to compare" : `${pts(cr.value)} vs ${pts(cr.previous)} (${crUp >= 0 ? "+" : ""}${crUp.toFixed(1)} pts)`,
      page: "returnsCancellation",
    });
    const noReason = k.cancelNoReasonCount?.value || 0;
    push({
      severity: noReason > 0 ? "warning" : "good",
      area: "Cancellations",
      flag: "Cancellations with no reason given",
      affectedCount: noReason,
      ageDays: null,
      detail: noReason > 0 ? "Cancelled without a recorded reason" : "Every cancellation has a reason",
      page: "returnsCancellation",
    });
    const rr = of.data.returns?.kpis?.returnRateByCount || {};
    const rrUp = rr.value !== null && rr.value !== undefined && rr.previous !== null && rr.previous !== undefined ? rr.value - rr.previous : null;
    push({
      severity: rrUp !== null && rrUp > 0 ? "warning" : "good",
      area: "Returns",
      flag: "Return rate up vs previous period",
      affectedCount: of.data.returns?.kpis?.totalReturns?.value ?? null,
      ageDays: null,
      detail: rrUp === null ? "No previous period to compare" : `${pts(rr.value)} vs ${pts(rr.previous)} (${rrUp >= 0 ? "+" : ""}${rrUp.toFixed(1)} pts)`,
      page: "returnsCancellation",
    });
  }

  // 3: Pickup & Delivery — live, unpicked orders
  if (pd.error) unavailable("Fulfillment", "Orders not picked after 24h", "fulfillment", pd.error);
  else {
    const late = (pd.data.inProgress || []).filter((o) => !o.pickedAt && (ageHours(o.orderPlacedAt) ?? 0) > 24);
    const oldestH = late.reduce((m, o) => Math.max(m, ageHours(o.orderPlacedAt) ?? 0), 0);
    push({
      severity: late.length === 0 ? "good" : oldestH > 48 ? "critical" : "warning",
      area: "Fulfillment",
      flag: "Orders not picked after 24h",
      affectedCount: late.length,
      ageDays: late.length ? oldestH / 24 : null,
      detail: late.length ? `Oldest waiting ${Math.round(oldestH)}h since it was placed` : "Every open order was picked within 24h",
      page: "fulfillment",
    });
  }

  // 7–8: Inventory Aging — live snapshot
  if (ia.error) {
    unavailable("Inventory", "Non-moving SKUs (61+ days, never sold)", "barcodeAnalytics", ia.error);
    unavailable("Inventory", "Slow-moving SKUs (61+ days, no sale in 30 days)", "barcodeAnalytics", ia.error);
  } else {
    const k = ia.data.kpis || {};
    const non = k.nonMovingSkus?.value || 0;
    const oldestNon = (ia.data.oldestInventoryTable || []).find((r) => r.status === "Non-Moving");
    push({
      severity: non > 0 ? "warning" : "good",
      area: "Inventory",
      flag: "Non-moving SKUs (61+ days, never sold)",
      affectedCount: non,
      ageDays: oldestNon ? oldestNon.ageDays : null,
      detail: non > 0 ? `${formatPeso(k.nonMovingValue?.value || 0)} of stock` : "None",
      page: "barcodeAnalytics",
    });
    const slow = k.slowMovingSkus?.value || 0;
    push({
      severity: slow > 0 ? "warning" : "good",
      area: "Inventory",
      flag: "Slow-moving SKUs (61+ days, no sale in 30 days)",
      affectedCount: slow,
      ageDays: null,
      detail: slow > 0 ? `${formatPeso(k.slowMovingValue?.value || 0)} of stock` : "None",
      page: "barcodeAnalytics",
    });
  }

  // 9: Stocks — barcode lifecycle (received vs posted)
  if (ba.error) unavailable("Product Publishing", "Received but not yet posted", "barcodeAnalytics", ba.error);
  else {
    const stages = ba.data.lifecycleFunnel?.stages || [];
    const qty = (key) => stages.find((s) => s.key === key)?.qty || 0;
    const unposted = Math.max(0, qty("received") - qty("posted"));
    const avg = ba.data.lifecycleFunnel?.cycleTimeDays?.receivedToPostedDays;
    push({
      severity: unposted > 0 ? "warning" : "good",
      area: "Product Publishing",
      flag: "Received but not yet posted",
      affectedCount: unposted,
      ageDays: avg ?? null,
      // Age = average days received → posted. Posting data starts Feb 25,
      // 2026 and isn't fully captured, so this is an estimate.
      detail: "Estimate · posting data partial (from Feb 25, 2026)",
      page: "barcodeAnalytics",
    });
  }

  // 10: Customer Success
  if (cs.error) unavailable("Customer Success", "Escalated / pending inquiries", "customerSuccess", cs.error);
  else {
    const k = cs.data.kpis || {};
    const esc = k.escalated?.value || 0;
    const pend = k.pending?.value || 0;
    const oldest = (cs.data.needsAttention || []).find((r) => r.status === "Escalated" || r.status === "Pending");
    push({
      severity: esc > 0 ? "critical" : pend > 0 ? "warning" : "good",
      area: "Customer Success",
      flag: "Escalated / pending inquiries",
      affectedCount: esc + pend,
      ageDays: oldest ? ageDays(oldest.date) : null,
      detail: `${formatNum(esc)} escalated · ${formatNum(pend)} pending`,
      page: "customerSuccess",
    });
  }

  return rows.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export default function OperationalFlags({ filters, onNavigate }) {
  const { dateRange } = filters || {};
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const range = dateRangeParams(dateRange);
    if (range.range === "custom" && !(range.from && range.to)) return undefined;
    setState(null);
    const settle = (p) => p.then((data) => ({ data })).catch((err) => ({ error: err.message || String(err) }));
    Promise.all([
      settle(getReport("ordersFulfillment", { channel: "HMRPH Online", ...range, compareTo: compareToFor(dateRange) })),
      settle(getReport("pickupDelivery", range)),
      settle(getReport("inventoryAging", {})),
      settle(getReport("barcodeAnalytics", range)),
      settle(getReport("customerSuccess", range)),
    ]).then(([of, pd, ia, ba, cs]) => {
      if (!cancelled) setState({ rows: buildFlags({ of, pd, ia, ba, cs }), at: new Date() });
    });
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  const COLUMNS = [
    {
      key: "severity",
      label: "Severity",
      render: (r) => (r.severity === "unavailable" ? <SeverityBadge severity="warning" text="Unavailable" /> : <SeverityBadge severity={r.severity} />),
    },
    { key: "area", label: "Area" },
    { key: "flag", label: "Flag" },
    { key: "affectedCount", label: "Affected Count", render: (r) => (r.affectedCount === null ? "—" : formatNum(r.affectedCount)) },
    { key: "ageDays", label: "Age (days)", render: (r) => (r.ageDays === null || r.ageDays === undefined ? "—" : r.ageDays < 10 ? r.ageDays.toFixed(1) : formatNum(Math.round(r.ageDays))) },
    {
      key: "action",
      label: "Action",
      render: (r) =>
        onNavigate ? (
          <button type="button" onClick={() => onNavigate(r.page)} style={{ color: "#22304f", fontWeight: 600 }}>
            View →
          </button>
        ) : (
          <span style={{ color: "#22304f", fontWeight: 600 }}>View →</span>
        ),
    },
    { key: "detail", label: "Details", maxWidth: 320 },
  ];

  if (!state) return <LoadingState label="Running operational checks…" />;

  const count = (sev) => state.rows.filter((r) => r.severity === sev).length;

  return (
    <div>
      <KpiRow>
        <KpiCard label="Critical" value={formatNum(count("critical"))} sub="Needs action now" />
        <KpiCard label="Warnings" value={formatNum(count("warning"))} sub="Worth a look" />
        <KpiCard label="Good" value={formatNum(count("good"))} sub="Nothing to report" />
        <KpiCard label="Checks Run" value={formatNum(state.rows.length)} sub={`As of ${state.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} />
      </KpiRow>

      <Panel title="Flags" subtitle="Order checks cover HMRPH Online only (the channel the order data covers). Inventory and unpicked-order checks are live; the rest follow the date range.">
        <DataTable columns={COLUMNS} rows={state.rows} />
      </Panel>
    </div>
  );
}
