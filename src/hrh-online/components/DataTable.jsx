import { hrh } from "../theme";
import { EmptyState } from "./States";

// Generic dense table — dark navy header per the design brief, used by
// every comparison/detail table across HRH Online. columns: [{ key, label,
// render?(row) }].
export default function DataTable({ columns, rows }) {
  if (!rows || rows.length === 0) return <EmptyState />;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr style={{ background: hrh.navy }}>
            {columns.map((c) => (
              <th
                key={c.key}
                className="text-left px-3 py-2 font-semibold text-white whitespace-nowrap text-[10.5px] uppercase tracking-[0.04em] first:rounded-l-sm last:rounded-r-sm"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} style={{ borderBottom: `1px solid ${hrh.border}` }}>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 whitespace-nowrap" style={{ color: hrh.ink }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
