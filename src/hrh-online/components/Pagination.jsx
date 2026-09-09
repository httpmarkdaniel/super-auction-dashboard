import { hrh } from "../theme";

// Windowed page-number list: all pages if few, otherwise first/last plus a
// small range around the current page with "…" gaps — the classic pattern,
// nothing bespoke.
function pageNumbers(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withGaps.push("…");
    withGaps.push(p);
  });
  return withGaps;
}

// Shared client-side pagination control for HRH Online's DataTable — real
// paging over the full list a page already fetched, not a cosmetic re-slice
// of a truncated one (see DataTable.jsx's `paginate` prop).
export default function Pagination({ page, totalPages, totalRows, pageSize, onPageChange }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${hrh.border}` }}>
      <span className="text-[12px]" style={{ color: hrh.muted }}>
        Showing {start}–{end} of {totalRows}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="w-7 h-7 rounded-md text-[13px] font-semibold disabled:opacity-35"
          style={{ background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }}
        >
          ‹
        </button>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="w-7 h-7 flex items-center justify-center text-[12px]" style={{ color: hrh.muted }}>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className="w-7 h-7 rounded-md text-[12.5px] font-semibold"
              style={
                p === page
                  ? { background: hrh.navy, color: "#ffffff" }
                  : { background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="w-7 h-7 rounded-md text-[13px] font-semibold disabled:opacity-35"
          style={{ background: hrh.surface, color: hrh.ink2, border: `1px solid ${hrh.border}` }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
