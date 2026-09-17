import { useEffect } from "react";
import { retail } from "../theme";

// Generic drill-down overlay for Retail's KPI/table click-throughs —
// same "click a card, see the breakdown" pattern the methodology report
// itself uses. Own component (not Auction's src/components/primitives/
// Modal.jsx) since Retail is a separate module tree with its own
// theme tokens, per HrhOnlineApp.jsx's header comment.
export default function Modal({ open, onClose, title, subtitle, wide = false, children }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 py-8 overflow-y-auto"
      style={{ background: "rgba(15,20,35,.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full my-auto rounded-md ${wide ? "max-w-5xl" : "max-w-lg"}`}
        style={{ background: retail.surface, border: `1px solid ${retail.border}` }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${retail.border}` }}>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: retail.ink }}>
              {title}
            </div>
            {subtitle && (
              <div className="text-[12px] mt-0.5" style={{ color: retail.muted }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md"
            style={{ border: `1px solid ${retail.border}`, color: retail.ink2 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// A single "label: value" row inside a breakdown modal — mirrors the
// reference HTML's .modal-row (subtract rows in red, a totalled final
// row with a rule above it).
export function ModalRow({ label, value, subtract = false, total = false }) {
  return (
    <div
      className="flex items-center justify-between py-1.5 text-[13.5px]"
      style={total ? { borderTop: `2px solid ${retail.ink}`, marginTop: 6, paddingTop: 10, fontSize: 15 } : undefined}
    >
      <span style={{ color: retail.ink2 }}>{label}</span>
      <span className="font-semibold" style={{ color: subtract ? retail.bad : retail.ink }}>
        {subtract ? "− " : ""}
        {value}
      </span>
    </div>
  );
}
