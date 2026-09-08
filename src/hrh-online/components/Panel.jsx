import { hrh } from "../theme";

// Generic section card used for every chart/table block across HRH Online
// pages — keeps the "dense BI panel" look in exactly one place.
export default function Panel({ title, action, badge, children, className = "" }) {
  return (
    <div className={`rounded-md p-4 ${className}`} style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
      {(title || badge || action) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && (
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: hrh.ink }}>
              {title}
            </h3>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {badge}
            {action}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
