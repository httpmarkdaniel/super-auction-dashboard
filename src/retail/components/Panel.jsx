import { retail } from "../theme";

// Generic section card — white bg + soft shadow (reference's own
// .chart-box), title in maroon (reference's own h2 color) rather than
// HRH Online's bordered-card/gray-uppercase-title look.
export default function Panel({ title, subtitle, action, badge, children, className = "" }) {
  return (
    <div className={`rounded-lg p-4 ${className}`} style={{ background: retail.surface, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      {(title || badge || action) && (
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            {title && (
              <h3 className="text-[15px] font-semibold" style={{ color: retail.maroon }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] mt-0.5" style={{ color: retail.muted }}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {badge}
            {action}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
