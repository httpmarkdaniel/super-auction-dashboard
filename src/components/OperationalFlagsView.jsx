import { useMemo, useState } from "react";
import { useOperationalFlags } from "../useOperationalFlags";
import StorySection from "./primitives/StorySection";
import StatTile from "./primitives/StatTile";
import { formatManila } from "../utils/manilaTime";
import { ALL_DEPARTMENTS } from "../utils/operationalFlags";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const EMPTY_FLAGS = [];

// Restrained, accessible severity tones reusing the dashboard's existing
// palette tokens — never a solid-red row, only a compact badge (PART 14 of
// this feature's spec).
const SEVERITY_BADGE = {
  CRITICAL: "bg-toneRedBg text-toneRedText",
  HIGH: "bg-critical/10 text-critical",
  MEDIUM: "bg-toneAmberBg text-toneAmberText",
  LOW: "bg-navySoft text-navy",
};

function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase whitespace-nowrap ${SEVERITY_BADGE[severity] || SEVERITY_BADGE.LOW}`}>
      {severity}
    </span>
  );
}

function ScopeBadge({ scope }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold tracking-wide uppercase whitespace-nowrap ${
        scope === "live" ? "bg-toneGreenBg text-toneGreenText" : "bg-gridline text-muted"
      }`}
    >
      {scope === "live" ? "Live" : "Period"}
    </span>
  );
}

function relevantDateLabel(flag) {
  if (!flag.relevantDate) return "—";
  return formatManila(flag.relevantDate, { withYear: true });
}

function FlagDetailRow({ flag }) {
  return (
    <tr className="bg-plane border-t border-gridline">
      <td colSpan={7} className="py-4 px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-w-3xl">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Rule</div>
            <div className="text-[14px] text-ink">{flag.rule}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Department</div>
            <div className="text-[14px] text-ink">{flag.departments.join(" + ")}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Current</div>
            <div className="text-[14px] text-ink tabular">{flag.ruleDetail.current}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Threshold</div>
            <div className="text-[14px] text-ink">{flag.ruleDetail.threshold}</div>
          </div>
          {flag.entityLabel && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Entity</div>
              <div className="text-[14px] text-ink">{flag.entityLabel}</div>
            </div>
          )}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Relevant Date</div>
            <div className="text-[14px] text-ink tabular">{relevantDateLabel(flag)}</div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// OPERATIONAL FLAGS — every flag here comes from a deterministic rule in
// src/utils/operationalFlags.js, computed from data already fetched by
// Overview/Leaderboards plus one lightweight new aggregate (see
// useOperationalFlags.js). No AI narrative, no fabricated issues.
export default function OperationalFlagsView({ dateRange, store, category, rangeLabel, refreshNonce }) {
  const { data, loading, error } = useOperationalFlags(dateRange, store, category, refreshNonce);
  const [department, setDepartment] = useState("");
  const [severity, setSeverity] = useState("");
  const [expanded, setExpanded] = useState(null);

  const allFlags = data?.flags ?? EMPTY_FLAGS;

  const departmentsPresent = useMemo(() => {
    const set = new Set();
    for (const f of allFlags) for (const d of f.departments) set.add(d);
    return ALL_DEPARTMENTS.filter((d) => set.has(d));
  }, [allFlags]);

  const severityCounts = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const f of allFlags) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
  }, [allFlags]);

  const severitiesPresent = SEVERITY_ORDER.filter((s) => severityCounts[s] > 0);

  const filteredFlags = allFlags.filter((f) => {
    if (department && !f.departments.includes(department)) return false;
    if (severity && f.severity !== severity) return false;
    return true;
  });

  if (error && !data) {
    return <div className="px-4 py-3 rounded-lg bg-critical/10 text-toneRedText text-[15.5px]">Couldn't load Operational Flags: {error}</div>;
  }
  if (!data) {
    return <div className="text-center text-ink text-[15.5px] py-12">Loading Operational Flags…</div>;
  }

  return (
    <div>
      {loading && <div className="mb-4 text-[13px] text-muted">Updating Operational Flags…</div>}

      <StorySection
        title="Operational Flags"
        insight="Deterministic, data-driven issues surfaced from existing dashboard data, each assigned to the department most likely responsible. Live flags (e.g. data freshness) are always current; period flags respect the selected Date/Store/Category filters."
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {severitiesPresent.map((s) => (
            <StatTile key={s} accent eyebrow={s.charAt(0) + s.slice(1).toLowerCase()} value={severityCounts[s]} />
          ))}
          <StatTile accent eyebrow="Total Open Flags" value={allFlags.length} />
        </div>
      </StorySection>

      <StorySection title="Filter Flags" insight="Filter by department or severity. Store/Branch and Date come from the dashboard's global filters above.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] tracking-[0.06em] uppercase text-muted font-semibold mr-1">Department</span>
          <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 text-[14px]">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="font-semibold text-ink bg-transparent outline-none cursor-pointer max-w-[220px]"
            >
              <option value="">All Departments</option>
              {departmentsPresent.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <span className="text-[11px] tracking-[0.06em] uppercase text-muted font-semibold ml-3 mr-1">Severity</span>
          <div className="flex items-center gap-1.5 bg-surface1 border border-gridline rounded-lg px-2.5 h-8 text-[14px]">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="font-semibold text-ink bg-transparent outline-none cursor-pointer max-w-[160px]"
            >
              <option value="">All Severities</option>
              {severitiesPresent.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </StorySection>

      <StorySection
        title="Flags"
        insight={`${filteredFlags.length} of ${allFlags.length} flag${allFlags.length === 1 ? "" : "s"} shown · ${rangeLabel} for period-based flags · click a row for the underlying rule and evidence.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] min-w-[1000px]">
            <thead>
              <tr className="text-white text-[12px] uppercase tracking-wide bg-navy">
                <th className="text-left font-medium py-2 px-3">Severity</th>
                <th className="text-left font-medium py-2 px-3">Department</th>
                <th className="text-left font-medium py-2 px-3">Flag</th>
                <th className="text-left font-medium py-2 px-3">Affected Entity</th>
                <th className="text-left font-medium py-2 px-3">Branch</th>
                <th className="text-left font-medium py-2 px-3">Evidence</th>
                <th className="text-left font-medium py-2 px-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlags.map((f) => {
                const isOpen = expanded === f.id;
                return (
                  <>
                    <tr
                      key={f.id}
                      className="border-t border-gridline cursor-pointer hover:bg-plane"
                      onClick={() => setExpanded(isOpen ? null : f.id)}
                    >
                      <td className="py-2 px-3">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="py-2 px-3 text-ink">{f.primaryDepartment}</td>
                      <td className="py-2 px-3 text-ink">
                        <span className="inline-block w-3 text-muted">{isOpen ? "▾" : "▸"}</span> {f.title}
                        <span className="ml-2 align-middle">
                          <ScopeBadge scope={f.scope} />
                        </span>
                      </td>
                      <td className="py-2 px-3 text-ink">{f.entityLabel ?? "—"}</td>
                      <td className="py-2 px-3 text-ink">{f.branch ?? "—"}</td>
                      <td className="py-2 px-3 text-ink">{f.evidence}</td>
                      <td className="py-2 px-3 text-ink tabular whitespace-nowrap">{relevantDateLabel(f)}</td>
                    </tr>
                    {isOpen && <FlagDetailRow key={`${f.id}-detail`} flag={f} />}
                  </>
                );
              })}
              {filteredFlags.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted text-[14px]">
                    No flags match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </StorySection>

      <StorySection title="Methodology" last>
        <div className="text-[13.5px] text-ink space-y-3 max-w-3xl">
          <p className="text-muted">
            Every flag below comes from a fixed, auditable rule over real dashboard data — never an AI judgment. "Live" flags
            reflect current data-pipeline/auction state regardless of the selected Date filter; "Period" flags respect the
            selected Date/Store/Category filters, same as Bidder/Vendor Analytics.
          </p>
          <div className="space-y-2.5">
            {[
              { rule: "Bid History Freshness", dept: "Developers / IT + Data / BI", scope: "Live", desc: "Hours since the warehouse's latest recorded bid, only evaluated while auctions are currently active. CRITICAL >= 24h, HIGH >= 6h, MEDIUM >= 2h." },
              { rule: "Very Low Sell-Through", dept: "Operations", scope: "Period", desc: "Auctions with >= 20 lots listed and sell-through < 30%. HIGH < 15%, MEDIUM < 30%." },
              { rule: "High Unsold Reserve Value", dept: "Operations", scope: "Period", desc: "Sum of reserve price on an auction's Unsold lots. HIGH >= ₱300,000, MEDIUM >= ₱150,000." },
              { rule: "Unpaid/Outstanding Settlement Aging", dept: "Cashier / Finance + Operations", scope: "Period", desc: "Outstanding/Unpaid winning value on auctions that ended >= 3 days ago. HIGH >= ₱200,000, MEDIUM >= ₱50,000." },
              { rule: "Missing Item Name/Description", dept: "Barcoders / Cataloging", scope: "Period", desc: "Lots with a null/blank item name. Flags at >= 5 lots or >= 10% of listed lots; MEDIUM at >= 10 lots or >= 20%." },
              { rule: "Unresolved Winning Bids", dept: "Data / BI + Developers / IT", scope: "Period", desc: "Winning value with no matching bid-history event, as a share of total winning value (min. ₱200,000 in scope). Some of this is expected for Negotiated-channel sales. HIGH >= 55%, MEDIUM >= 30%." },
              { rule: "Low Registration Conversion", dept: "Marketing", scope: "Period", desc: "Registered customers who never actually bid (min. 50 registered). HIGH < 8%, MEDIUM < 15%." },
              { rule: "Vendor Stuck Inventory", dept: "Vendor Management", scope: "Period", desc: "Same >= 20-lot minimum as Vendor Analytics' own Stuck Inventory ranking, sell-through < 35%. HIGH < 20%, MEDIUM < 35%. Capped to the 5 worst per period." },
              { rule: "Vendor Concentration Risk", dept: "Vendor Management", scope: "Period", desc: "Top-5 vendor concentration of settled Bid Amount (min. 10 active vendors). HIGH >= 75%, MEDIUM >= 60%." },
              { rule: "Branch Sell-Through Below Baseline", dept: "Branch / Store Operations", scope: "Period", desc: "A branch's sell-through vs. the overall average across all branches in scope (min. 30 lots listed). HIGH gap >= 25pp, MEDIUM gap >= 15pp." },
              { rule: "Bidder Concentration Dominance", dept: "Auction Team", scope: "Period", desc: "Top settled bidder's share of period winning value (min. ₱500,000 period total). MEDIUM >= 25%, LOW >= 15%." },
            ].map((m) => (
              <div key={m.rule} className="pb-2.5 border-b border-gridline last:border-b-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold text-ink">{m.rule}</span>
                  <span className="text-[12px] text-muted">{m.dept} · {m.scope}</span>
                </div>
                <div className="text-[13px] text-ink mt-0.5">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </StorySection>
    </div>
  );
}
