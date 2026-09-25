import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import DataTable from "../components/DataTable";
import { KpiCard, KpiRow } from "../components/Kpi";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatNum, formatPct, formatPeso } from "../format";

function StockIcon({ children }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const STOCK_ICONS = {
  box: (
    <StockIcon>
      <path d="M21 8V21H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </StockIcon>
  ),
  peso: (
    <StockIcon>
      <path d="M6 3v18M6 3h7a4 4 0 0 1 0 8H6M3 10h13M3 14h10" />
    </StockIcon>
  ),
};

// r.stageAt is the real timestamp the unit reached THAT specific stage
// (created_time for Barcoded, the ASN's created_at for ASN Raised, its
// updated_at for Received/Put-away, published_date for Posted,
// transaction_date for Sold — see api/_hrh-barcode-analytics.js's
// toItemDetail). Split into Date + Timestamp columns rather than one
// combined column, per explicit request.
function formatStageDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function formatStageTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  // transaction_date (Sold) is a plain Date with no time-of-day — showing a
  // clock time for it would be fabricated, not a real value.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return "—";
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

// Columns for a funnel stage's click-through modal — barcode/item name/
// amount(unit price)/qty(current stock on hand)/stock value/date/
// timestamp, per explicit request. amount = current_srp, qty = item_qty,
// stockValue = total_current_srp (verified server-side to equal item_qty *
// amount, so it's sent as-is rather than recomputed here).
const STAGE_ITEM_COLUMNS = [
  { key: "barcode", label: "Barcode", width: 110 },
  { key: "product", label: "Item Name", maxWidth: 320 },
  { key: "amount", label: "Amount", render: (r) => formatPeso(r.amount) },
  { key: "qty", label: "Qty (Stock)", render: (r) => formatNum(r.qty) },
  { key: "stockValue", label: "Stock Value", render: (r) => formatPeso(r.stockValue) },
  { key: "date", label: "Date", render: (r) => formatStageDate(r.stageAt) },
  { key: "timestamp", label: "Timestamp", render: (r) => formatStageTime(r.stageAt) },
];

// Clickable column header for the On-Hand Stock table's two sortable
// columns (Qty/Stock Value) — click toggles asc/desc, an arrow marks
// whichever column is currently active. Plain label text for every other
// DataTable on this page/site — this is the only table on this page that
// needs sorting, so it's kept page-local rather than a generic DataTable feature.
function SortableHeader({ label, active, dir, onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 uppercase tracking-[0.04em]" style={{ color: "#fff" }}>
      {label}
      <span style={{ opacity: active ? 1 : 0.35 }}>{active && dir === "asc" ? "▲" : "▼"}</span>
    </button>
  );
}

// On-Hand Stock table columns — Product/Qty/Stock Value, per explicit
// request. `onHandStock` is a live current-inventory snapshot (see
// api/_hrh-barcode-analytics.js's computeOnHandStock), independent of the
// page's Date Range filter, so it's rendered above the lifecycle funnel
// (which IS date-scoped) rather than mixed into it. Qty/Stock Value are
// both sortable (click the header); Product isn't, per explicit request
// ("sort by value and qty").
function onHandStockColumns(sortKey, sortDir, onSort) {
  return [
    { key: "product", label: "Product", maxWidth: 360 },
    {
      key: "qty",
      label: <SortableHeader label="On-Hand Qty" active={sortKey === "qty"} dir={sortDir} onClick={() => onSort("qty")} />,
      render: (r) => formatNum(r.qty),
    },
    {
      key: "stockValue",
      label: <SortableHeader label="On-Hand Stock Value" active={sortKey === "stockValue"} dir={sortDir} onClick={() => onSort("stockValue")} />,
      render: (r) => formatPeso(r.stockValue),
    },
  ];
}

function formatDays(days) {
  if (days === null || days === undefined) return "—";
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)}d`;
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

// A real funnel — centered, width-proportional blocks stacked top to
// bottom, plain CSS (no SVG, no polygon coordinate math). Each block's
// width = its stage's count as a share of the first stage's count, so the
// stack visibly narrows in step with the real conversion. A previous SVG
// version computed each stage as a trapezoid tapering into the next
// stage's width via raw polygon points; that math (and long labels
// rendered as centered SVG <text>, which SVG doesn't wrap or clip) was
// fragile and rendered wrong. This version only ever sets a plain
// percentage `width` + `margin: 0 auto`, which cannot mis-render.
//
// Numbers live inside each block (always short, always fits); the
// descriptive label and conversion-from-previous-stage sit in normal
// document flow directly underneath each block — never overlapping the
// shape, never at risk of overflow, regardless of how narrow a stage gets.
const MIN_WIDTH_PCT = 14; // keep even a near-zero stage visible as a real block, not a sliver

// Single-hue sequential scale (light -> dark) so the funnel reads as one
// shape, not unrelated rainbow blocks — hrh.blue (top) down to hrh.navy
// (bottom).
function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function funnelColor(i, n) {
  return lerpColor(hrh.blue, hrh.navy, n > 1 ? i / (n - 1) : 0);
}

// Zeroed pending data validation (see the load() comment above for why) —
// stage quantities/conversion rates go to 0, per-stage item drill-downs
// go empty, cycle-time days go to 0, and the "sold but never posted" gap
// count goes to 0. cohort dates/labels/dataQuality notes are left as-is
// since they aren't numbers the validation concern applies to.
function zeroLifecycleFunnel(funnel) {
  return {
    ...funnel,
    stages: (funnel.stages || []).map((s) => ({
      ...s,
      qty: 0,
      conversionFromPrev: s.conversionFromPrev === null || s.conversionFromPrev === undefined ? s.conversionFromPrev : 0,
      items: [],
    })),
    cycleTimeDays: funnel.cycleTimeDays ? Object.fromEntries(Object.keys(funnel.cycleTimeDays).map((k) => [k, 0])) : funnel.cycleTimeDays,
    unmatched: funnel.unmatched ? { ...funnel.unmatched, soldButNeverPosted: 0 } : funnel.unmatched,
  };
}

// Click a stage's block to open its item-level breakdown (barcode/item
// name/amount/qty/stock value) — a bare count doesn't say WHICH units are
// in that stage. Own modal state here (not lifted to the parent) since
// this funnel is the only consumer. `title="Click for item details"`
// gives a visible hint since the click affordance isn't otherwise obvious
// on a plain colored block.
function LifecycleFunnel({ stages }) {
  const [openStage, setOpenStage] = useState(null);
  const firstQty = stages[0]?.qty || 0;
  const widthPct = (qty) => (firstQty > 0 ? Math.max(MIN_WIDTH_PCT, Math.min(100, (qty / firstQty) * 100)) : MIN_WIDTH_PCT);

  return (
    <div className="max-w-md mx-auto">
      {stages.map((s, i) => (
        <div key={s.key} className={i > 0 ? "mt-3" : ""}>
          <div
            className="mx-auto flex items-center justify-center text-white font-bold cursor-pointer"
            title="Click for item details"
            onClick={() => setOpenStage(s)}
            style={{
              width: `${widthPct(s.qty)}%`,
              minWidth: 92,
              height: 58,
              background: funnelColor(i, stages.length),
              borderRadius: 8,
              fontSize: 17,
              clipPath: "polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)",
            }}
          >
            {formatNum(s.qty)}
          </div>
          <div className="text-center mt-1.5">
            <div className="text-[12.5px] font-semibold" style={{ color: hrh.ink }}>
              {s.label}
            </div>
            <div className="text-[11px]" style={{ color: hrh.muted }}>
              {i === 0
                ? "Cohort start"
                : s.conversionFromPrev !== null && s.conversionFromPrev !== undefined
                  ? `${formatPct(s.conversionFromPrev)} of ${stages[i - 1].label}`
                  : "—"}
            </div>
          </div>
        </div>
      ))}

      <Modal
        open={!!openStage}
        onClose={() => setOpenStage(null)}
        title={openStage ? `${openStage.label} — Item Details` : ""}
        subtitle={openStage ? `${formatNum(openStage.qty)} item(s) in this stage` : ""}
        wide
      >
        <DataTable
          columns={STAGE_ITEM_COLUMNS}
          rows={openStage?.items || []}
          paginate
          pageSize={10}
          emptyLabel="No items in this stage."
        />
      </Modal>
    </div>
  );
}

// Barcode Analytics — scoped to ONLY the Barcoded -> ASN -> Received/
// Put-away -> Posted -> Sold inventory lifecycle funnel
// (api/_hrh-barcode-analytics.js's computeLifecycleFunnel). The picker/QC/
// pick-to-dispatch content that used to live on this page stays on Orders &
// Fulfillment's "Warehouse Operations" sub-tab only — this page no longer
// duplicates it.
//
// Still fetches ?report=barcodeAnalytics (same endpoint, unchanged) but
// only reads the `lifecycleFunnel` field from the response. See
// computeLifecycleFunnel()'s own comment in that file for the validation
// this was built on (Received/Put-away uses ASN status on
// xv3.stg_outbound_slip_items, no separate put-away timestamp exists;
// "Posted" uses cms.mart_cms_posted_inventory_report, not
// cms_hmrph_posting_quantity). No Channel dimension exists for this data —
// the Channel filter is hidden for this page (see HrhOnlineApp.jsx's
// hideChannelFilter).
export default function BarcodeAnalytics({ filters }) {
  const { dateRange } = filters;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stockSortKey, setStockSortKey] = useState("stockValue");
  const [stockSortDir, setStockSortDir] = useState("desc");

  const ready = isDateRangeReady(dateRange);
  const params = useMemo(() => dateRangeParams(dateRange), [dateRange]);

  const load = useCallback(async (p, signal) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...p, report: "barcodeAnalytics" });
      const res = await fetch(`/api/hrh-sales-analytics?${qs.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.message || json.error);
      // Inventory Lifecycle Funnel zeroed pending data validation — see
      // computeLifecycleFunnel()'s own comment in
      // api/_hrh-barcode-analytics.js for the specific joins this was
      // flagged over (ASN-based Received/Put-away, CMS-based Posted).
      // onHandStock (the rest of this page) is untouched and stays real.
      setData(json.lifecycleFunnel ? { ...json, lifecycleFunnel: zeroLifecycleFunnel(json.lifecycleFunnel) } : json);
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

  const funnel = data?.lifecycleFunnel;
  const onHandStock = data?.onHandStock;
  const sortedOnHandStockItems = useMemo(() => {
    if (!onHandStock?.items) return [];
    const sign = stockSortDir === "asc" ? 1 : -1;
    return [...onHandStock.items].sort((a, b) => sign * (a[stockSortKey] - b[stockSortKey]));
  }, [onHandStock, stockSortKey, stockSortDir]);
  function toggleStockSort(key) {
    if (key === stockSortKey) {
      setStockSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setStockSortKey(key);
      setStockSortDir("desc");
    }
  }

  return (
    <div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Stocks…" />}
      {error && <ErrorState label={`Couldn't load Stocks: ${error}`} />}

      {onHandStock && !error && (
        <Panel title="On-Hand Stock" subtitle="Live current inventory, by product — not affected by the Date Range filter above." className="mb-4">
          <KpiRow>
            <KpiCard label="On-Hand Qty" icon={STOCK_ICONS.box} value={formatNum(onHandStock.totals.qty)} />
            <KpiCard label="On-Hand Stock Value" icon={STOCK_ICONS.peso} value={formatPeso(onHandStock.totals.stockValue)} />
          </KpiRow>
          <div className="mt-4">
            <DataTable
              columns={onHandStockColumns(stockSortKey, stockSortDir, toggleStockSort)}
              rows={sortedOnHandStockItems}
              paginate
              pageSize={10}
              emptyLabel="No products currently on hand."
            />
          </div>
        </Panel>
      )}

      {funnel && !error && (
        <Panel
          title="Inventory Lifecycle Funnel"
          subtitle={`Barcoded → ASN → Received/Put-away → Posted → Sold — cohort barcoded in this period, tracked to date (${funnel.cohort?.from} to ${funnel.cohort?.to})`}
        >
          <LifecycleFunnel stages={funnel.stages} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4" style={{ borderTop: `1px solid ${hrh.border}` }}>
            <div>
              <div className="text-[11px]" style={{ color: hrh.muted }}>
                Barcoded → ASN
              </div>
              <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                {(() => {
                  const hrs = funnel.cycleTimeDays?.barcodedToAsnHours;
                  return hrs === null || hrs === undefined ? "—" : formatDays(hrs / 24);
                })()}
              </div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: hrh.muted }}>
                ASN → Received/Put-away
              </div>
              <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                {formatDays(funnel.cycleTimeDays?.asnToReceivedDays ?? null)}
              </div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: hrh.muted }}>
                Received/Put-away → Posted
              </div>
              <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                {formatDays(funnel.cycleTimeDays?.receivedToPostedDays ?? null)}
              </div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: hrh.muted }}>
                Posted → First Sale
              </div>
              <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                {formatDays(funnel.cycleTimeDays?.postedToFirstSaleDays ?? null)}
              </div>
            </div>
          </div>

          {funnel.unmatched?.soldButNeverPosted > 0 && (
            <div className="text-[11px] mt-3" style={{ color: hrh.muted }}>
              {formatNum(funnel.unmatched.soldButNeverPosted)} unit(s) in this cohort sold with no matching "Published" record — a real but unexplained gap between the sales data and the CMS listing data, not folded into the Posted count above.
            </div>
          )}

          {funnel.dataQuality?.length > 0 && (
            <ul className="list-disc pl-5 space-y-1.5 text-[11px] mt-3" style={{ color: hrh.ink2 }}>
              {funnel.dataQuality.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
