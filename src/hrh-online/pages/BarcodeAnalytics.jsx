import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import { LoadingState, ErrorState } from "../components/States";
import { hrh } from "../theme";
import { formatNum, formatPct } from "../format";

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

function LifecycleFunnel({ stages }) {
  const firstQty = stages[0]?.qty || 0;
  const widthPct = (qty) => (firstQty > 0 ? Math.max(MIN_WIDTH_PCT, Math.min(100, (qty / firstQty) * 100)) : MIN_WIDTH_PCT);

  return (
    <div className="max-w-md mx-auto">
      {stages.map((s, i) => (
        <div key={s.key} className={i > 0 ? "mt-3" : ""}>
          <div
            className="mx-auto flex items-center justify-center text-white font-bold"
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

  const funnel = data?.lifecycleFunnel;

  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Barcode Analytics
      </div>

      {!ready && <ErrorState label="Select both a From and To date for the custom range in the Date Range filter above." />}
      {ready && loading && !data && <LoadingState label="Loading Barcode Analytics…" />}
      {error && <ErrorState label={`Couldn't load Barcode Analytics: ${error}`} />}

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
