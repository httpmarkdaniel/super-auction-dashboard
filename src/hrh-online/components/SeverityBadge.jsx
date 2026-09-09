import { SEVERITY_COLORS } from "../theme";

const LABELS = { critical: "Critical", warning: "Warning", good: "Good" };

export default function SeverityBadge({ severity, text }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.good;
  return (
    <span
      className="text-[10.5px] font-semibold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {text || LABELS[severity] || severity}
    </span>
  );
}
