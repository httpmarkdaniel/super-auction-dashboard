import { hrh } from "../theme";

// Every pending-integration / unvalidated-definition indicator in HRH
// Online renders through this one component, so "this number isn't real
// yet" always looks the same and is easy to find/remove later.
export default function DemoBadge({ text = "Demo Data" }) {
  return (
    <span
      className="text-[10.5px] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded whitespace-nowrap"
      style={{ background: hrh.accentSoft, color: hrh.accentText }}
    >
      {text}
    </span>
  );
}
