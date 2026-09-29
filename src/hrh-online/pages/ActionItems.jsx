import { useEffect, useState } from "react";
import Panel from "../components/Panel";
import ExportButton from "../components/ExportButton";
import { exportTableToExcel } from "../exportTable";
import { hrh } from "../theme";

// Action Items tracker — saved as JSON through the same Blob-backed
// insights endpoint the Weekly Business Review notes use.
const STORAGE_KEY = "action-items";
const STATUSES = ["Not Started", "In Progress", "Done", "Blocked"];
const FIELDS = [
  { key: "item", label: "Item" },
  { key: "owner", label: "Owner" },
  { key: "dueDate", label: "Due Date" },
  { key: "actionSteps", label: "Action Steps" },
  { key: "status", label: "Status" },
];
const blankRow = () => ({ item: "", owner: "", dueDate: "", actionSteps: "", status: STATUSES[0] });

export default function ActionItems() {
  const [rows, setRows] = useState([]);
  const [savedJson, setSavedJson] = useState("[]");
  const [savedAt, setSavedAt] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/hrh-sales-analytics?report=insights&key=${STORAGE_KEY}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || json.error || `Request failed (${res.status})`);
        const list = json.text ? JSON.parse(json.text) : [];
        setRows(list);
        setSavedJson(JSON.stringify(list));
        setSavedAt(json.updatedAt);
      })
      .catch((err) => setError(err.message))
      .finally(() => setStatus("ready"));
  }, []);

  const update = (i, key, value) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const dirty = JSON.stringify(rows) !== savedJson;

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const text = JSON.stringify(rows);
      const res = await fetch("/api/hrh-sales-analytics?report=insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: STORAGE_KEY, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `Request failed (${res.status})`);
      setSavedJson(text);
      setSavedAt(json.updatedAt);
    } catch (err) {
      setError(err.message);
    }
    setStatus("ready");
  }

  const inputStyle = { border: `1px solid ${hrh.border}`, background: hrh.surface, color: hrh.ink };
  const inputCls = "w-full rounded-md px-2 py-1.5 text-[13px]";
  const btnStyle = { border: `1px solid ${hrh.border}`, color: hrh.ink2, background: hrh.surface };

  return (
    <Panel title="Action Items" subtitle="Track follow-ups from the weekly business review">
      {status === "loading" ? (
        <div className="text-[13px]" style={{ color: hrh.muted }}>Loading…</div>
      ) : (
        <>
          <ExportButton onClick={() => exportTableToExcel(FIELDS, rows, "Action Items")} />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr style={{ background: hrh.surface2 }}>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="text-left px-3 py-2.5 font-bold whitespace-nowrap text-[11px] uppercase tracking-[0.7px]" style={{ color: "#8792a5", borderBottom: `1px solid ${hrh.border}` }}>
                      {f.label}
                    </th>
                  ))}
                  <th style={{ borderBottom: `1px solid ${hrh.border}` }} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={FIELDS.length + 1} className="px-3 py-4 text-center" style={{ color: hrh.muted }}>
                      No action items yet. Click "+ Add row".
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${hrh.border2}` }}>
                    <td className="px-2 py-1.5 min-w-[180px]"><input className={inputCls} style={inputStyle} value={r.item} onChange={(e) => update(i, "item", e.target.value)} /></td>
                    <td className="px-2 py-1.5 min-w-[130px]"><input className={inputCls} style={inputStyle} value={r.owner} onChange={(e) => update(i, "owner", e.target.value)} /></td>
                    <td className="px-2 py-1.5 min-w-[140px]"><input type="date" className={inputCls} style={inputStyle} value={r.dueDate} onChange={(e) => update(i, "dueDate", e.target.value)} /></td>
                    <td className="px-2 py-1.5 min-w-[260px]"><textarea rows={2} className={inputCls} style={inputStyle} value={r.actionSteps} onChange={(e) => update(i, "actionSteps", e.target.value)} /></td>
                    <td className="px-2 py-1.5 min-w-[130px]">
                      <select className={inputCls} style={inputStyle} value={r.status} onChange={(e) => update(i, "status", e.target.value)}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" className="text-[12px]" style={{ color: hrh.bad }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button type="button" onClick={() => setRows((rs) => [...rs, blankRow()])} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-md" style={btnStyle}>
              + Add row
            </button>
            <button type="button" onClick={save} disabled={!dirty || status === "saving"} className="text-[12.5px] font-semibold px-4 py-1.5 rounded-md text-white disabled:opacity-50" style={{ background: hrh.accent }}>
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            <span className="text-[11.5px]" style={{ color: error ? hrh.bad : hrh.muted }}>
              {error ? `Error: ${error}` : dirty ? "Unsaved changes" : savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : ""}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
