import { hrh } from "../theme";

export default function ExportButton({ onClick }) {
  return (
    <div className="flex justify-end mb-1.5">
      <button
        type="button"
        onClick={onClick}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
        style={{ border: `1px solid ${hrh.border}`, color: hrh.ink2, background: hrh.surface }}
      >
        Export Excel
      </button>
    </div>
  );
}
