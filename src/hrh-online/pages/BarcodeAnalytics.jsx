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
// stage, bottom edge = the NEXT stage's share (so the shape actually narrows
// stage-to-stage instead of just being a shorter bar); the last stage is a
// straight-sided band since it has no next stage to taper into. Centered
// horizontally, contiguous bands (no gaps) for a single continuous funnel
// silhouette. Labels/qty/conversion sit outside the shape (left of a
// pointer line) rather than on top of the fill, so they stay legible
// regardless of the band's color or how thin it gets.
const VB_W = 520;
const BAND_H = 76;
const MIN_FRAC = 0.05; // keep a sliver visible even for a near-zero stage

function LifecycleFunnel({ stages }) {
  const firstQty = stages[0]?.qty || 0;
  const frac = (qty) => (firstQty > 0 ? Math.max(MIN_FRAC, Math.min(1, qty / firstQty)) : MIN_FRAC);
  const vbH = stages.length * BAND_H;
  const cx = VB_W / 2;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
      <svg viewBox={`0 0 ${VB_W} ${vbH}`} className="w-full" style={{ maxWidth: 420 }} preserveAspectRatio="xMidYMid meet">
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
          return (
            <g key={s.key}>
              <polygon points={points} fill={hrh.series[i % hrh.series.length]} stroke={hrh.surface} strokeWidth={2} />
              <text x={cx} y={y0 + BAND_H / 2 - 6} textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff">
                {formatNum(s.qty)}
              </text>
              <text x={cx} y={y0 + BAND_H / 2 + 14} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.85)">
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="space-y-2 lg:pt-2 lg:min-w-[180px]">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hrh.series[i % hrh.series.length] }} />
            <span className="text-[11.5px]" style={{ color: hrh.ink2 }}>
              {i === 0 ? (
                <span style={{ color: hrh.muted }}>Cohort start</span>
              ) : s.conversionFromPrev !== null && s.conversionFromPrev !== undefined ? (
                <>
                  <span className="font-semibold" style={{ color: hrh.ink }}>
                    {formatPct(s.conversionFromPrev)}
                  </span>{" "}
                  of {stages[i - 1].label}
                </>
              ) : (
                "—"
              )}
            </span>
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
