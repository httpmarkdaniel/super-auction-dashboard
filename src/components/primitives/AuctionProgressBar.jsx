import { useState } from "react";
import { formatManila, formatManilaFromEpochMs, manilaToEpochMs, timeRemainingLabel } from "../../utils/manilaTime";
import { formatPeso } from "../../utils/format";
import { clusterEvents, primaryEventType } from "../../utils/auctionActivityEvents";

function clampPct(v) {
  return Math.min(100, Math.max(0, v));
}

// Floating hover card for one milestone/track summary — same `.floating`
// hover-card language used everywhere else in the dashboard (EntityBreakdownRow,
// BidTrendChart), anchored at a clamped horizontal position so it never
// overflows the card on either edge regardless of which milestone (0%-100%)
// triggered it.
function TimelineTip({ anchorPct, eyebrow, lines }) {
  const left = Math.min(88, Math.max(12, anchorPct));
  return (
    <div
      // mb-12 clears the tallest permanent-label tier (see PermanentLabel)
      // so the two never visually collide when hovering a marker that
      // already has a permanent label above it.
      className="absolute bottom-full mb-12 -translate-x-1/2 z-50 pointer-events-none"
      style={{ left: `${left}%` }}
    >
      <div className="floating px-3 py-2 text-[12.5px] leading-tight whitespace-nowrap shadow-lg">
        <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold mb-1">{eyebrow}</div>
        {lines.map((line, i) => (
          <div key={i} className={i === 0 ? "text-ink font-medium tabular" : "text-muted tabular"}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

// ALWAYS-VISIBLE compact label + dashed connector for the handful of
// genuinely significant events (First Bid / New Leader / Current or
// Latest Leading Bid / Reserve Met) — this is what makes real bid
// activity apparent on the card WITHOUT hovering anything. `tier`
// staggers the connector's height (0 = short/close to the bar, 1 =
// taller) so two labels landing close together horizontally don't
// overlap; the richer hover tooltip (TimelineTip) still supplies full
// detail on top of this.
function PermanentLabel({ pct, tier, eyebrow, sub }) {
  const left = Math.min(92, Math.max(8, pct));
  return (
    <div
      className="absolute bottom-full -translate-x-1/2 flex flex-col items-center pointer-events-none z-25"
      style={{ left: `${left}%` }}
    >
      <div className="text-[9.5px] uppercase tracking-wide font-semibold text-ink whitespace-nowrap leading-none">{eyebrow}</div>
      {sub && <div className="text-[9px] tabular text-series1 whitespace-nowrap leading-none mt-0.5">{sub}</div>}
      <div className="w-px border-l border-dashed border-navy/40 mt-0.5" style={{ height: tier === 0 ? "10px" : "30px" }} />
    </div>
  );
}

const ACTIVITY_EYEBROW = {
  "first-bid": "FIRST BID",
  "new-leader": "NEW LEADING BIDDER",
  "current-leading-ended": "LATEST BID",
  "current-leading-live": "CURRENT LEADING BID",
  "reserve-met": "RESERVE MET",
  bid: "BID PLACED",
};

// One bid event's hover content — same shape for every bid marker
// (ordinary or significant), with extra facts appended only when this
// specific event actually has them (never fabricated): New/Returning when
// resolved, the previous leader + increase when this bid took the lead,
// Reserve Met when it wasn't already this event's primary label.
function buildActivityTip(event, ended) {
  const primary = primaryEventType(event);
  const eyebrowKey = primary === "current-leading" ? (ended ? "current-leading-ended" : "current-leading-live") : primary;

  const lines = [
    event.bidder,
    formatManila(event.timestamp, { withYear: true }),
    `Bid Amount: ${formatPeso(event.bidAmount)}`,
  ];

  if (event.newOrReturning && event.newOrReturning !== "unclassified") {
    lines.push(event.newOrReturning === "new" ? "New Bidder" : "Returning Bidder");
  }

  if (event.types.includes("new-leader")) {
    lines.push(primary === "new-leader" ? "New Leading Bidder" : "Also took the lead on its lot");
    if (event.previousLeader) {
      const increase = event.bidAmount - event.previousLeader.bidAmount;
      lines.push(`Previous Leader: ${event.previousLeader.bidder} · ${formatPeso(event.previousLeader.bidAmount)}`);
      if (increase > 0) lines.push(`+${formatPeso(increase)} increase`);
    }
  }

  if (event.types.includes("reserve-met") && primary !== "reserve-met") {
    lines.push("Reserve Met");
  }

  lines.push(`Lot ${event.lotNumber}${event.lotName ? ` · ${event.lotName}` : ""}`);

  return { eyebrow: ACTIVITY_EYEBROW[eyebrowKey], lines };
}

// A dense-activity cluster's hover content — the underlying events are
// never discarded (see clusterEvents), just summarized here. Mentions
// leadership changes within the cluster when any occurred, since those
// remain meaningful even once grouped for display.
function buildClusterTip(cluster) {
  const events = cluster.events;
  const first = events[0];
  const last = events[events.length - 1];
  const distinctBidders = new Set(events.map((e) => e.bidder)).size;
  const leaderChanges = events.filter((e) => e.types.includes("new-leader")).length;
  const highest = events.reduce((max, e) => Math.max(max, e.bidAmount), 0);
  const startLabel = formatManila(first.timestamp, { withYear: true });
  const endLabel = formatManila(last.timestamp, { withDate: false });
  const timeLine = first.timestamp === last.timestamp ? startLabel : `${startLabel}–${endLabel}`;

  const lines = [
    timeLine,
    `${events.length} bids`,
    `${distinctBidders} bidder${distinctBidders === 1 ? "" : "s"}`,
    `Highest bid: ${formatPeso(highest)}`,
  ];
  if (leaderChanges > 0) {
    lines.push(`${leaderChanges} leadership change${leaderChanges === 1 ? "" : "s"}`);
  }
  lines.push(`Latest: ${last.bidder} · ${formatPeso(last.bidAmount)}`);

  return { eyebrow: "BID ACTIVITY", lines };
}

// Auction-LEVEL timeline — a horizontal track spanning this auction's
// timeline start to its ending time, with milestone dots placed at their
// REAL proportional positions (never evenly spaced): Timeline Start →
// Official Auction Start (only when real pre-bidding pushed the timeline
// earlier) → Current → Ending Time. Distinct from BidActivityBar (unchanged,
// still used inside each individual lot for its own bid-event-by-bid-event
// history) — this component plots the SAME two things BidActivityBar plots
// per lot, just merged across the whole auction onto one shared track.
//
// timelineStart reuses the EXACT SAME LEAST(official starting_time,
// earliest real bid event) semantics already validated for the per-lot
// timeline (see api/live-auction-detail.js's timeline_start comment,
// api/live-auctions.js's own copy of that formula) — never redefined here.
//
// `activityEvents` (optional, from src/utils/auctionActivityEvents.js) adds
// a SECOND marker layer — real bid activity merged across every lot in
// this auction — entirely from data already loaded with the auction detail
// payload (no API call on hover, no new request to show it). Omitting this
// prop (the collapsed AuctionCard header's own usage) renders exactly the
// original structural-only timeline, unchanged.
export default function AuctionProgressBar({
  auctionNumber,
  auctionName,
  timelineStart,
  officialStartTime,
  endingTime,
  activityEvents,
}) {
  const [hoverKey, setHoverKey] = useState(null);
  // hoverKey: null | 'start' | 'official' | 'now' | 'end' | 'track'
  //         | { activity: <event> } | { cluster: <cluster> }

  const startMs = manilaToEpochMs(timelineStart);
  const endMs = manilaToEpochMs(endingTime);
  const officialStartMs = manilaToEpochMs(officialStartTime);
  const span = startMs != null && endMs != null && endMs > startMs ? endMs - startMs : null;

  if (!span) {
    return <div className="text-[13px] text-muted">Timeline unavailable.</div>;
  }

  const nowMs = Date.now();
  const nowPct = clampPct(((nowMs - startMs) / span) * 100);
  const hadPreBidding = officialStartMs != null && startMs < officialStartMs;
  const officialStartPct = hadPreBidding ? clampPct(((officialStartMs - startMs) / span) * 100) : null;
  const ended = nowMs >= endMs;
  const remainingText = ended ? "Ended" : timeRemainingLabel(endingTime).replace(/ left$/, " remaining");

  // pinned = FIRST BID / CURRENT-LEADING BID / RESERVE MET — inherently
  // rare (at most one-per-lot or one-per-auction), always shown
  // individually, never clustered. clusterable = everything else,
  // including NEW LEADER bids — real production auctions showed
  // leadership changes are often NOT rare, so they share the same
  // proximity-based clustering as ordinary bids (see
  // auctionActivityEvents.js's comment) rather than each demanding its
  // own permanent marker on a dense lot.
  const clusters = clusterEvents(activityEvents?.clusterable);
  const soloEvents = clusters.filter((c) => c.events.length === 1).map((c) => c.events[0]);
  const denseClusters = clusters.filter((c) => c.events.length > 1);
  const pinnedEvents = activityEvents?.pinned ?? [];

  // ALWAYS-VISIBLE labels — First Bid and Current/Latest Leading Bid are
  // always candidates when any real bid exists (each is unique by
  // construction); Reserve Met joins when present (rare); one
  // representative New Leader joins ONLY when an unclustered instance
  // exists (a dense run of leadership changes stays a cluster marker
  // instead — see clusterEvents' own reasoning), so this never grows
  // unbounded on a busy auction. Sorted by position, then staggered
  // between two connector-line heights whenever two candidates land close
  // enough together to otherwise overlap.
  const firstBidEvent = pinnedEvents.find((e) => e.types.includes("first-bid"));
  const currentLeadingEvent = pinnedEvents.find((e) => e.types.includes("current-leading"));
  const reserveMetEvent = pinnedEvents.find((e) => e.types.includes("reserve-met") && e !== firstBidEvent && e !== currentLeadingEvent);
  const soloNewLeaders = soloEvents.filter((e) => primaryEventType(e) === "new-leader");
  const representativeNewLeader = soloNewLeaders[soloNewLeaders.length - 1];

  const labelCandidates = [];
  if (firstBidEvent) labelCandidates.push({ event: firstBidEvent, eyebrow: "FIRST BID" });
  if (reserveMetEvent) labelCandidates.push({ event: reserveMetEvent, eyebrow: "RESERVE MET" });
  if (representativeNewLeader) labelCandidates.push({ event: representativeNewLeader, eyebrow: "NEW LEADER" });
  if (currentLeadingEvent && currentLeadingEvent !== firstBidEvent) {
    labelCandidates.push({ event: currentLeadingEvent, eyebrow: ended ? "LATEST BID" : "CURRENT BID" });
  }
  labelCandidates.sort((a, b) => a.event.pct - b.event.pct);
  let lastLabelPct = null;
  let lastTier = 1;
  const tieredLabels = labelCandidates.map((c) => {
    const tier = lastLabelPct !== null && c.event.pct - lastLabelPct < 16 ? (lastTier === 0 ? 1 : 0) : 0;
    lastLabelPct = c.event.pct;
    lastTier = tier;
    return { ...c, tier };
  });

  const tips = {
    start: { eyebrow: "TIMELINE START", lines: [formatManila(timelineStart, { withYear: true })] },
    official: { eyebrow: "OFFICIAL AUCTION START", lines: [formatManila(officialStartTime, { withYear: true })] },
    now: {
      eyebrow: "CURRENT",
      lines: [formatManilaFromEpochMs(nowMs, { withYear: true }), `${nowPct.toFixed(0)}% elapsed`],
    },
    end: { eyebrow: "ENDING TIME", lines: [formatManila(endingTime, { withYear: true }), remainingText] },
    track: {
      eyebrow: auctionName ? `${auctionNumber} · ${auctionName}` : auctionNumber || "AUCTION TIMELINE",
      lines: [
        `Timeline Start ${formatManila(timelineStart)}`,
        ...(hadPreBidding ? [`Official Start ${formatManila(officialStartTime)}`] : []),
        `Current ${formatManilaFromEpochMs(nowMs)}`,
        `Ending Time ${formatManila(endingTime)}`,
        `${nowPct.toFixed(0)}% elapsed · ${remainingText}`,
      ],
    },
  };

  let active = null;
  let activeAnchor = 50;
  if (hoverKey && typeof hoverKey === "object") {
    if (hoverKey.activity) {
      active = buildActivityTip(hoverKey.activity, ended);
      activeAnchor = hoverKey.activity.pct;
    } else if (hoverKey.cluster) {
      active = buildClusterTip(hoverKey.cluster);
      activeAnchor = hoverKey.cluster.anchorPct;
    }
  } else if (hoverKey) {
    active = tips[hoverKey];
    activeAnchor =
      hoverKey === "start" ? 0 : hoverKey === "official" ? officialStartPct : hoverKey === "now" ? nowPct : hoverKey === "end" ? 100 : 50;
  }

  return (
    // Reserve room above the track for the permanent labels (text + up to
    // the taller connector tier) whenever any exist, so they never bleed
    // into whatever content sits above this component.
    <div className="relative pb-1" style={{ paddingTop: tieredLabels.length > 0 ? 46 : 0 }}>
      <div
        className="relative h-3 rounded-full bg-plane border border-gridline overflow-visible cursor-default"
        onMouseEnter={() => setHoverKey("track")}
        onMouseLeave={() => setHoverKey(null)}
      >
        {/* Elapsed section — filled but deliberately subtle; the Current dot
            below, not this fill, is the most visually prominent element. */}
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-series1/60 transition-[width]"
          style={{ width: `${nowPct}%` }}
        />

        {/* Dense clusters — lowest priority tier, rendered first so any
            other marker at a similar position stacks visually above it.
            A cluster that contains at least one real leadership change
            gets the same accent-diamond treatment as an individual New
            Leader marker (still compact, but not visually identical to a
            cluster of plain repeat-bidding). */}
        {denseClusters.map((cluster, i) => (
          <button
            key={`cluster-${i}`}
            type="button"
            onMouseEnter={() => setHoverKey({ cluster })}
            onMouseLeave={() => setHoverKey("track")}
            onFocus={() => setHoverKey({ cluster })}
            onBlur={() => setHoverKey(null)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center gap-0.5 z-10"
            style={{ left: `${cluster.anchorPct}%` }}
            aria-label={`${cluster.events.length} bids clustered around ${formatManila(cluster.events[0].timestamp)}`}
          >
            {cluster.hasLeaderChange ? (
              <span className="w-1.5 h-1.5 rotate-45 bg-series2 border border-plane shadow-sm" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-muted/80 border border-plane" />
            )}
            <span className="text-[9.5px] leading-none text-muted font-medium tabular">+{cluster.events.length}</span>
          </button>
        ))}

        {/* Solo (unclustered) activity events — plain ordinary bids render
            as a small dot; a lone New Leader event renders as the same
            small diamond used for pinned significant events, just without
            being permanently pinned (so a dense run of them still
            clusters, but an isolated one still reads as meaningful). */}
        {soloEvents.map((event, i) =>
          primaryEventType(event) === "new-leader" ? (
            <button
              key={`solo-leader-${i}`}
              type="button"
              onMouseEnter={() => setHoverKey({ activity: event })}
              onMouseLeave={() => setHoverKey("track")}
              onFocus={() => setHoverKey({ activity: event })}
              onBlur={() => setHoverKey(null)}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-series2 border border-plane shadow-sm z-20"
              style={{ left: `${event.pct}%` }}
              aria-label={`New leading bidder · ${event.bidder} · ${formatPeso(event.bidAmount)} at ${formatManila(event.timestamp)}`}
            />
          ) : (
            <button
              key={`solo-bid-${i}`}
              type="button"
              onMouseEnter={() => setHoverKey({ activity: event })}
              onMouseLeave={() => setHoverKey("track")}
              onFocus={() => setHoverKey({ activity: event })}
              onBlur={() => setHoverKey(null)}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-muted/80 z-[15]"
              style={{ left: `${event.pct}%` }}
              aria-label={`Bid ${formatPeso(event.bidAmount)} at ${formatManila(event.timestamp)}`}
            />
          ),
        )}

        {/* Pinned significant events — First Bid / Current Leading Bid /
            Reserve Met. Inherently rare (at most one per lot or one per
            auction), rendered as a small diamond, deliberately subtler
            than the structural milestones below but stronger than
            ordinary bids, and NEVER absorbed into a cluster. */}
        {pinnedEvents.map((event, i) => (
          <button
            key={`pinned-${i}`}
            type="button"
            onMouseEnter={() => setHoverKey({ activity: event })}
            onMouseLeave={() => setHoverKey("track")}
            onFocus={() => setHoverKey({ activity: event })}
            onBlur={() => setHoverKey(null)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-series2 border border-plane shadow-sm z-20"
            style={{ left: `${event.pct}%` }}
            aria-label={`${primaryEventType(event)} · ${event.bidder} · ${formatPeso(event.bidAmount)} at ${formatManila(event.timestamp)}`}
          />
        ))}

        {/* Permanent compact labels for the handful of genuinely
            significant events — the whole point of this task: real bid
            activity must be visible WITHOUT hovering anything. */}
        {tieredLabels.map((l, i) => (
          <PermanentLabel
            key={`label-${i}`}
            pct={l.event.pct}
            tier={l.tier}
            eyebrow={l.eyebrow}
            sub={formatPeso(l.event.bidAmount)}
          />
        ))}

        {/* Timeline Start (0%) */}
        <button
          type="button"
          onMouseEnter={() => setHoverKey("start")}
          onMouseLeave={() => setHoverKey("track")}
          onFocus={() => setHoverKey("start")}
          onBlur={() => setHoverKey(null)}
          className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-navy/50 bg-plane z-30"
          aria-label={`Timeline start · ${formatManila(timelineStart, { withYear: true })}`}
        />

        {/* Official Auction Start — only rendered when real pre-bidding
            actually pushed the timeline earlier than the official start. */}
        {officialStartPct != null && (
          <button
            type="button"
            onMouseEnter={() => setHoverKey("official")}
            onMouseLeave={() => setHoverKey("track")}
            onFocus={() => setHoverKey("official")}
            onBlur={() => setHoverKey(null)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-navy bg-plane z-30"
            style={{ left: `${officialStartPct}%` }}
            aria-label={`Official auction start · ${formatManila(officialStartTime, { withYear: true })}`}
          />
        )}

        {/* Current — the most visually apparent marker on the track */}
        {!ended && (
          <button
            type="button"
            onMouseEnter={() => setHoverKey("now")}
            onMouseLeave={() => setHoverKey("track")}
            onFocus={() => setHoverKey("now")}
            onBlur={() => setHoverKey(null)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-series1 border-2 border-plane shadow z-40 pulse-dot"
            style={{ left: `${nowPct}%` }}
            aria-label={`Current · ${nowPct.toFixed(0)}% elapsed · ${remainingText}`}
          />
        )}

        {/* Ending Time (100%) */}
        <button
          type="button"
          onMouseEnter={() => setHoverKey("end")}
          onMouseLeave={() => setHoverKey("track")}
          onFocus={() => setHoverKey("end")}
          onBlur={() => setHoverKey(null)}
          className="absolute top-1/2 left-full -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-navy/50 bg-plane z-30"
          aria-label={`Ending time · ${formatManila(endingTime, { withYear: true })}`}
        />

        {active && <TimelineTip anchorPct={activeAnchor} eyebrow={active.eyebrow} lines={active.lines} />}
      </div>

      <div className="flex justify-between text-[12px] text-muted mt-1">
        <div>
          <div className="text-ink">Start</div>
          <div className="tabular">{formatManila(timelineStart)}</div>
        </div>
        {hadPreBidding && (
          <div className="text-navy/70 text-center">
            ↑ Auction Start {formatManila(officialStartTime, { withDate: false })}
          </div>
        )}
        <div className="text-right">
          <div className="text-ink">Current position</div>
          <div className="tabular">{ended ? "Ended" : timeRemainingLabel(endingTime)}</div>
        </div>
        <div className="text-right">
          <div className="text-ink">End</div>
          <div className="tabular">{formatManila(endingTime)}</div>
        </div>
      </div>
    </div>
  );
}
