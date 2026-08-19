export default function Card({ title, subtitle, action, className = "", children }) {
  return (
    <div className={`card px-6 py-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-1">
          <div>
            {title && <div className="eyebrow">{title}</div>}
            {subtitle && <div className="text-[14.5px] text-ink mt-0.5">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </div>
  );
}
