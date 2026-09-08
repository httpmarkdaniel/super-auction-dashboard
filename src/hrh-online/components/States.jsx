import { hrh } from "../theme";

// Reusable Loading/Empty/Error states — not exercised by today's
// synchronous mock data, but wired in ahead of the real ClickHouse/GA4/
// TikTok/Shopee API calls landing in a later phase.
export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center py-10 text-[13px]" style={{ color: hrh.muted }}>
      {label}
    </div>
  );
}

export function EmptyState({ label = "No data for this selection." }) {
  return (
    <div className="flex items-center justify-center py-10 text-[13px]" style={{ color: hrh.muted }}>
      {label}
    </div>
  );
}

export function ErrorState({ label = "Couldn't load this data." }) {
  return (
    <div className="flex items-center justify-center py-10 text-[13px]" style={{ color: hrh.bad }}>
      {label}
    </div>
  );
}
