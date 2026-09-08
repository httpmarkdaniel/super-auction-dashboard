// Portal module card — fixed light-on-navy card styling, independent of
// the Auction dashboard's own light/dark theme toggle (this is platform
// chrome, not a dashboard view). Same shape for every status so future
// modules (Retail, Inventory, ...) drop into the grid with zero extra work.
const STATUS_STYLE = {
  available: { bg: "#faf1df", text: "#b07514", label: "Available" },
  "coming-soon": { bg: "#eef0f4", text: "#5b6573", label: "Coming Soon" },
};

export default function ModuleCard({ module }) {
  const isAvailable = module.status === "available";
  const status = STATUS_STYLE[module.status] ?? STATUS_STYLE["coming-soon"];

  return (
    <div
      className="flex flex-col rounded-lg p-5 md:p-6"
      style={{
        background: "#ffffff",
        border: "1px solid #e7eaf0",
        boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.05)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center text-[15px] font-bold shrink-0"
          style={{
            background: isAvailable ? "#d99a3d" : "#e7eaf0",
            color: isAvailable ? "#ffffff" : "#94a0ae",
          }}
        >
          {module.name.charAt(0)}
        </div>
        <span
          className="text-[11px] tracking-[0.06em] uppercase font-semibold px-2 py-1 rounded-full shrink-0"
          style={{ background: status.bg, color: status.text }}
        >
          {status.label}
        </span>
      </div>

      <h3 className="text-[17px] font-semibold mb-1.5" style={{ color: "#111827" }}>
        {module.name}
      </h3>
      <p className="text-[14px] leading-relaxed mb-5" style={{ color: "#5b6573" }}>
        {module.description}
      </p>

      <div className="mt-auto">
        {isAvailable ? (
          <a
            href={module.route}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold px-3.5 py-2 rounded-lg transition-opacity hover:opacity-90"
            style={{ background: "#d99a3d", color: "#ffffff" }}
          >
            {module.actionLabel}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold px-3.5 py-2 rounded-lg cursor-default"
            style={{ background: "#eef0f4", color: "#94a0ae" }}
          >
            {module.actionLabel}
          </span>
        )}
      </div>
    </div>
  );
}
