import { retail } from "../theme";

// Generic section card — matches the mockup's own .card/.card-header/
// .card-title/.card-sub exactly (white, rounded-16, soft shadow, bold
// dark-navy-text title, muted subtitle).
export default function Panel({ title, subtitle, action, badge, children, className = "" }) {
  return (
    <div className={`card rounded-[10px] overflow-hidden ${className}`} style={{ background: retail.surface, border: `1px solid ${retail.border}`, boxShadow: retail.shadow }}>
      {(title || badge || action) && (
        <div className="flex items-start justify-between gap-3 flex-wrap px-4 pt-4">
          <div>
            {title && (
              <h3 className="text-[16px] font-bold m-0" style={{ color: retail.ink }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[12px] mt-0.5 mb-0" style={{ color: "#8692a6" }}>
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
      <div className="p-4">{children}</div>
    </div>
  );
}
