import { useEffect, useState } from "react";
import { hrh } from "../theme";
import { EmptyState } from "./States";
import Pagination from "./Pagination";

// Generic dense table — dark navy header per the design brief, used by
// every comparison/detail table across HRH Online. columns: [{ key, label,
// render?(row), maxWidth? }]. `maxWidth` (px) truncates a long column
// (e.g. a product name) with an ellipsis + hover title instead of letting
// it force the whole table to horizontally scroll — set it on whichever
// column tends to run long, not every column. Pass `paginate` to page the
// ALREADY-FETCHED `rows` client side (real paging over the full list a
// page holds, never a truncation — callers must fetch/keep the full
// dataset; this only slices for display).
export default function DataTable({ columns, rows, paginate = false, pageSize = 10, emptyLabel }) {
  const [page, setPage] = useState(1);

  // A new `rows` reference (new filter/channel/date selection) should land
  // back on page 1, not silently keep whatever page the previous dataset
  // happened to be on.
  useEffect(() => {
    setPage(1);
  }, [rows]);

  if (!rows || rows.length === 0) return <EmptyState label={emptyLabel} />;

  const totalRows = rows.length;
  const totalPages = paginate ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const clampedPage = Math.min(page, totalPages);
  const visibleRows = paginate ? rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize) : rows;

  return (
    <div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr style={{ background: hrh.navy }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-3 py-2 font-semibold text-white whitespace-nowrap text-[10.5px] uppercase tracking-[0.04em] first:rounded-l-sm last:rounded-r-sm"
                  style={c.maxWidth ? { maxWidth: c.maxWidth } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => (
              <tr key={r.id ?? i} style={{ borderBottom: `1px solid ${hrh.border}` }}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 whitespace-nowrap ${c.maxWidth ? "overflow-hidden text-ellipsis" : ""}`}
                    style={{ color: hrh.ink, ...(c.maxWidth ? { maxWidth: c.maxWidth } : null) }}
                    title={c.maxWidth && typeof r[c.key] === "string" ? r[c.key] : undefined}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginate && (
        <Pagination page={clampedPage} totalPages={totalPages} totalRows={totalRows} pageSize={pageSize} onPageChange={setPage} />
      )}
    </div>
  );
}
