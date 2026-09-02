// Standardized [By Branch] [By Category] selector for clickable scorecard
// drilldowns (PART 10/11) — exactly one breakdown renders at a time, never
// both simultaneously. Purely a local UI toggle over already-fetched data;
// selecting a tab costs zero extra requests.
export default function BranchCategoryToggle({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 bg-plane border border-gridline rounded-lg p-1 mb-4">
      {["branch", "category"].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-[13.5px] font-semibold rounded-md transition-colors ${
            value === v ? "bg-surface1 text-ink shadow-card" : "text-muted hover:text-ink"
          }`}
        >
          By {v === "branch" ? "Branch" : "Category"}
        </button>
      ))}
    </div>
  );
}
