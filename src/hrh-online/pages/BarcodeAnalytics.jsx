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

// A real tapering funnel — plain SVG polygons, no new chart dependency.
// Each stage is a trapezoid: top edge = this stage's share of the first
// stage, bottom edge = the NEXT stage's share (so the shape actually
// narrows stage-to-stage, proportional to the real counts); the last stage
// has no next stage to taper into, so it's drawn as a straight-sided band.
// Centered horizontally, contiguous bands (no gaps) for one continuous
// silhouette. Deliberately no text inside the shape — a label like "Posted
// (Listed for Sale)" would overflow a narrow bottom-of-funnel trapezoid and
// spill across neighboring bands (SVG doesn't wrap or clip text by
// default); all labels/qty/conversion live in the legend to the right
// instead, which stays legible no matter how thin a band gets.
//
// width/height are the SVG's real intrinsic pixel size; CSS then scales it
// responsively (width: 100%, height: auto) — the standard safe pattern for
// a scalable inline SVG, rather than relying on viewBox-only sizing.
const VB_W = 280;
const BAND_H = 56;
const MIN_FRAC = 0.02; // avoid a literal zero-width (degenerate) polygon; a thin sliver is fine — a real funnel is allowed to nearly close

// Single-hue sequential scale (light -> dark) so the funnel reads as one
// shape narrowing in both size AND color depth, not unrelated rainbow
// blocks — hrh.blue (top) down to hrh.navy (bottom).
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
  const frac = (qty) => (firstQty > 0 ? Math.max(MIN_FRAC, Math.min(1, qty / firstQty)) : MIN_FRAC);
  const vbH = stages.length * BAND_H;
  const cx = VB_W / 2;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
      <svg
        viewBox={`0 0 ${VB_W} ${vbH}`}
        width={VB_W}
        height={vbH}
        style={{ width: "100%", maxWidth: 220, height: "auto", display: "block", margin: "0 auto" }}
      >
        {stages.map((s, i) => {
          const topW = frac(s.qty) * VB_W;
          const bottomW = i < stages.length - 1 ? frac(stages[i + 1].qty) * VB_W : topW;
          const y0 = i * BAND_H;
          const y1 = y0 + BAND_H;
          const points = [
            [cx - topW / 2, y0],
            [cx + topW / 2, y0],
            [cx + bottomW / 2, y1],
            [cx - bottomW / 2, y1],
          ]
            .map((p) => p.join(","))
            .join(" ");
          return <polygon key={s.key} points={points} fill={funnelColor(i, stages.length)} stroke={hrh.surface} strokeWidth={2} />;
        })}
      </svg>

      <div className="space-y-3 w-full">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: funnelColor(i, stages.length) }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold" style={{ color: hrh.ink }}>
                  {s.label}
                </span>
                <span className="text-[13px] font-semibold" style={{ color: hrh.ink }}>
                  {formatNum(s.qty)}
                </span>
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
    </div>
  );
}

// Barcode Analytics — scoped to ONLY the ASN -> Barcoded -> Posted -> Sold
// inventory lifecycle funnel (api/_hrh-barcode-analytics.js's
// computeLifecycleFunnel). The picker/QC/pick-to-dispatch content that used
// to live on this page stays on Orders & Fulfillment's "Warehouse
// Operations" sub-tab only — this page no longer duplicates it.
//
// Still fetches ?report=barcodeAnalytics (same endpoint, unchanged) but
// only reads the `lifecycleFunnel` field from the response. See
// computeLifecycleFunnel()'s own comment in that file for the validation
// this was built on (Put-away omitted as unreliable; "Posted" uses
// cms.mart_cms_posted_inventory_report, not cms_hmrph_posting_quantity).
// No Channel dimension exists for this data — the Channel filter is hidden
// for this page (see HrhOnlineApp.jsx's hideChannelFilter).
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
          subtitle={`ASN → Barcoded → Posted → Sold — cohort received in this period, tracked to date (${funnel.cohort?.from} to ${funnel.cohort?.to})`}
        >
          <LifecycleFunnel stages={funnel.stages} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: `1px solid ${hrh.border}` }}>
            <div>
              <div className="text-[11px]" style={{ color: hrh.muted }}>
                Received → Barcoded
              </div>
              <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                {(() => {
                  const hrs = funnel.cycleTimeDays?.receivedToBarcodedHours;
                  return hrs === null || hrs === undefined ? "—" : formatDays(hrs / 24);
                })()}
              </div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: hrh.muted }}>
                Barcoded → Posted
              </div>
              <div className="text-[14px] font-semibold" style={{ color: hrh.ink }}>
                {formatDays(funnel.cycleTimeDays?.barcodedToPostedDays ?? null)}
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
