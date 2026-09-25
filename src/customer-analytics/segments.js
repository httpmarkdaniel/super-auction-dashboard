import { retail } from "../retail/theme";

// Lifecycle segments — same keys/order as api/_customer-analytics.js's
// SEGMENT_KEYS and the business's own Superset customer list definition.
export const SEGMENTS = [
  { key: "New", color: retail.good, definition: "First purchase was this month." },
  { key: "Retained", color: retail.navy3, definition: "Bought this month and in one of the previous 2 months." },
  { key: "Reactivated", color: retail.blue, definition: "Bought this month after 2+ months without a purchase." },
  { key: "Slipped", color: retail.orange, definition: "Last purchase 1–60 days ago, nothing yet this month." },
  { key: "Inactive", color: retail.bad, definition: "No purchase in more than 60 days." },
];

export const SEGMENT_COLOR = Object.fromEntries(SEGMENTS.map((s) => [s.key, s.color]));
