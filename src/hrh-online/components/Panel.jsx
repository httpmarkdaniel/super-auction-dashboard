import { hrh } from "../theme";

// Generic section card used for every chart/table block across HRH Online
// pages — the "LIVE DASHBOARD UNIFORM FORMAT" card: white, 10px radius,
// soft shadow, bold title with a muted one-line subtitle.
export default function Panel({ title, subtitle, action, badge, children, className = "" }) {
  return (
    <div
      className={`card rounded-[10px] p-4 ${className}`}
      style={{ background: hrh.surface, border: `1px solid ${hrh.border}`, boxShadow: "0 1px 2px rgba(13,24,45,.06),0 8px 24px rgba(13,24,45,.04)" }}
    >
      {(title || badge || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && (
              <h3 className="text-[16px] font-bold m-0" style={{ color: hrh.ink }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[12px] mt-0.5" style={{ color: "#8692a6" }}>
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
