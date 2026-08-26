// Single source of truth for turning /api/bidding-pace's `hourly` rows into
// the two shapes the UI needs — the chart's own {hour, bidAmount} points
// (unchanged from before this file existed) and a lookup of per-hour
// Participating/Winning bidder detail for the shared hover tooltip. Used by
// both Overview and the Bidding Pace tab so neither can drift onto its own
// mapping of the same API response.

export const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
});

function withTotal(bucket) {
  return {
    ...bucket,
    total: bucket.new + bucket.returning,
    totalAmount: bucket.newAmount + bucket.returningAmount,
  };
}

// hourlyRows: the raw `hourly` array from /api/bidding-pace's response.
// Returns { hourlyTrend, hourlyDetail } — hourlyTrend is the existing
// recharts-ready array; hourlyDetail is keyed by the same hour LABEL
// (e.g. "7AM") used as hourlyTrend's `hour` field, for O(1) tooltip lookup.
export function mapHourlyRows(hourlyRows) {
  const rows = (hourlyRows ?? []).filter((h) => h.hour != null);

  const hourlyTrend = rows.map((h) => ({
    hour: HOUR_LABELS[Number(h.hour)],
    bidAmount: Number(h.bid_amount) || 0,
  }));

  const hourlyDetail = {};
  for (const h of rows) {
    const label = HOUR_LABELS[Number(h.hour)];
    const p = h.participating ?? { new: 0, returning: 0, new_amount: 0, returning_amount: 0 };
    const w = h.winning ?? { new: 0, returning: 0, new_amount: 0, returning_amount: 0, unresolved_amount: 0 };

    hourlyDetail[label] = {
      bidAmount: Number(h.bid_amount) || 0,
      participating: withTotal({
        new: Number(p.new) || 0,
        returning: Number(p.returning) || 0,
        newAmount: Number(p.new_amount) || 0,
        returningAmount: Number(p.returning_amount) || 0,
      }),
      winning: {
        ...withTotal({
          new: Number(w.new) || 0,
          returning: Number(w.returning) || 0,
          newAmount: Number(w.new_amount) || 0,
          returningAmount: Number(w.returning_amount) || 0,
        }),
        unresolvedAmount: Number(w.unresolved_amount) || 0,
      },
    };
  }

  return { hourlyTrend, hourlyDetail };
}
