import { hrh } from "../theme";
import { formatNum } from "../format";

// A real tapering funnel (Order Status, Traffic, Publishing, Fulfillment) —
// each stage is a trapezoid clipped via CSS clip-path, narrowing from its
// own width into the width of the NEXT stage (so adjacent bands connect
// into one continuous funnel silhouette instead of reading as separate
// bars) — the last stage tapers slightly on its own since there's no next
// stage to connect into. Width is proportional to value relative to the
// funnel's own first/largest stage, with a floor so a tiny final stage
// never collapses to an invisible sliver. Each stage gets its own color
// (hrh.series, the same multi-color palette used for channel/category
// breakdowns elsewhere) rather than one flat color, so stages are visually
// distinct at a glance.
const MIN_WIDTH_PCT = 18;
const TAPER_LAST_PCT = 0.75; // last stage's bottom edge vs its own top edge

export default function FunnelList({ stages, stageHeight = 52, gap = 4 }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const widths = stages.map((s) => Math.max((s.value / max) * 100, MIN_WIDTH_PCT));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {stages.map((s, i) => {
        const topW = widths[i];
        const bottomW = i < stages.length - 1 ? widths[i + 1] : topW * TAPER_LAST_PCT;
        const topX0 = (100 - topW) / 2;
        const topX1 = 100 - topX0;
        const botX0 = (100 - bottomW) / 2;
        const botX1 = 100 - botX0;
        const prevValue = i > 0 ? stages[i - 1].value : null;
        const dropoffPct = prevValue ? ((prevValue - s.value) / prevValue) * 100 : null;
        const color = hrh.series[i % hrh.series.length];

        return (
          <div key={s.label}>
            <div className="relative" style={{ height: stageHeight }}>
              <div
                className="absolute inset-0"
                style={{
                  clipPath: `polygon(${topX0}% 0, ${topX1}% 0, ${botX1}% 100%, ${botX0}% 100%)`,
                  background: color,
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight pointer-events-none">
                <span className="text-[12px] font-semibold text-white">{s.label}</span>
                <span className="text-[13px] font-bold text-white">{formatNum(s.value)}</span>
              </div>
            </div>
            {dropoffPct != null && (
              <div className="text-center text-[10.5px] mt-0.5" style={{ color: hrh.muted }}>
                -{dropoffPct.toFixed(0)}% from previous stage
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
