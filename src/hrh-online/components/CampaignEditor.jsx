import { useState } from "react";
import { hrh } from "../theme";
import Modal from "./Modal";
import {
  CAMPAIGN_TYPES,
  DIGITAL_CHANNELS,
  FREQUENCIES,
  HMR_BRANCHES,
  PLATFORMS,
  POSTING_PLATFORMS,
  PRIORITIES,
  RECURRING_STATES,
  STATUSES,
  TRACKING_STATES,
} from "../data/campaignCalendar";

// Full "Edit Campaign Period" form for the Interactive Calendar: details,
// standardized scope, schedule, SMS/app tracking, posting links and
// recurring-campaign logic. Works on a copy of the campaign; nothing
// changes until Save.

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fieldClass = "w-full mt-1 rounded-md border px-2.5 py-2 text-[13px] outline-none bg-white";
const labelClass = "block text-[12px] font-semibold";

function Section({ n, title, note, children }) {
  return (
    <section className="py-4" style={{ borderTop: `1px solid ${hrh.border}` }}>
      <div className="flex items-baseline gap-2 mb-3">
        <h4 className="text-[13px] font-bold uppercase tracking-[0.04em]" style={{ color: hrh.ink }}>
          {n}. {title}
        </h4>
        {note && (
          <span className="text-[11px]" style={{ color: hrh.muted }}>
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, hint, className = "", children }) {
  return (
    <label className={`${labelClass} ${className}`} style={{ color: hrh.ink2 }}>
      {label}
      {required && <span style={{ color: hrh.bad }}> *</span>}
      {hint && (
        <span className="font-normal" style={{ color: hrh.muted }}>
          {" "}
          · {hint}
        </span>
      )}
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select className={fieldClass} style={{ borderColor: hrh.border, color: hrh.ink }} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const [val, text] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={val} value={val}>
            {text}
          </option>
        );
      })}
    </select>
  );
}

function Input({ value, onChange, type = "text", ...rest }) {
  return (
    <input
      type={type}
      className={fieldClass}
      style={{ borderColor: hrh.border, color: hrh.ink }}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

function TextArea({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea
      rows={rows}
      placeholder={placeholder}
      className={fieldClass}
      style={{ borderColor: hrh.border, color: hrh.ink }}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Yes/No pill toggle.
function YesNo({ value, onChange }) {
  return (
    <div className="inline-flex rounded-md overflow-hidden border mt-1" style={{ borderColor: hrh.border }}>
      {[
        [true, "Yes"],
        [false, "No"],
      ].map(([v, t]) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(v)}
          className="px-4 py-1.5 text-[12.5px] font-semibold"
          style={value === v ? { background: hrh.navyAccentRow, color: "#fff" } : { background: hrh.surface, color: hrh.ink2 }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
      style={active ? { background: hrh.accentSoft, color: hrh.accentText, borderColor: hrh.accent } : { background: hrh.surface, color: hrh.ink2, borderColor: hrh.border }}
    >
      {children}
      {active ? " ✓" : ""}
    </button>
  );
}

function ScopeCard({ active, title, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md border px-3 py-2.5"
      style={active ? { borderColor: hrh.accent, background: hrh.accentSoft } : { borderColor: hrh.border, background: hrh.surface }}
    >
      <div className="text-[13px] font-bold" style={{ color: hrh.ink }}>
        {active ? "● " : "○ "}
        {title}
      </div>
      <div className="text-[11.5px] mt-0.5" style={{ color: hrh.muted }}>
        {sub}
      </div>
    </button>
  );
}

// Occurrences implied by the recurrence rule, for weekly-style cadences
// where it can be counted exactly.
function countOccurrences(c) {
  const start = c.recurrenceStart || c.date;
  const end = c.recurrenceEnd || c.end || c.date;
  if (!start || !end || end < start) return null;
  const stepDays = { Daily: 1, Weekly: 7, "Bi-weekly": 14 }[c.frequency];
  if (!stepDays) return null;
  const interval = Math.max(1, Number(c.repeatInterval) || 1);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  const weekday = WEEKDAY_NAMES.indexOf(c.cadence);
  if (stepDays > 1 && weekday >= 0) while (s.getDay() !== weekday) s.setDate(s.getDate() + 1);
  if (s > e) return 0;
  return Math.floor(Math.round((e - s) / 86400000) / (stepDays * interval)) + 1;
}

function validate(c) {
  const errors = [];
  if (!c.title.trim()) errors.push("Campaign Name is required.");
  if (!c.date) errors.push("Campaign Start is required.");
  if (!c.end) errors.push("Campaign End is required.");
  if (c.date && c.end && c.end < c.date) errors.push("Campaign End can't be before Campaign Start.");
  if (c.teaserDate && c.date && c.teaserDate > c.date) errors.push("Teaser Date should be on or before Campaign Start.");
  if (c.planningStart && c.date && c.planningStart > c.date) errors.push("Planning Start should be on or before Campaign Start.");
  if (c.scopeType === "selected" && !c.branches.length) errors.push("Pick at least one branch for Selected Branches scope.");
  if (c.recurring && c.recurrenceStart && c.recurrenceEnd && c.recurrenceEnd < c.recurrenceStart) errors.push("Recurrence End can't be before Recurrence Start.");
  if (c.postingLinks.some((l) => l.url && !/^https?:\/\//i.test(l.url.trim()))) errors.push("Posting links must start with http:// or https://.");
  return errors;
}

export default function CampaignEditor({ campaign, campaigns, onSave, onDelete, onClose }) {
  const [c, setC] = useState(() => ({ ...campaign, end: campaign.end || campaign.date, branches: campaign.branches || [], postingLinks: campaign.postingLinks || [] }));
  const [errors, setErrors] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (patch) => setC((prev) => ({ ...prev, ...patch }));
  const toggleIn = (key, value) => set({ [key]: c[key].includes(value) ? c[key].filter((v) => v !== value) : [...c[key], value] });
  const setLink = (i, patch) => set({ postingLinks: c.postingLinks.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const parentOptions = [["", "— None —"], ...campaigns.filter((x) => x.continuous && x.id !== c.id).map((x) => [x.title, x.title])];
  const autoOccurrences = countOccurrences(c);
  const selectedChannels = c.channels.length;

  function save() {
    const errs = validate(c);
    setErrors(errs);
    if (errs.length) return;
    onSave({
      ...c,
      title: c.title.trim(),
      end: c.end > c.date ? c.end : undefined,
      postingLinks: c.postingLinks.filter((l) => l.url.trim()),
      occurrences: c.occurrences === "" ? "" : Number(c.occurrences),
    });
  }

  return (
    <Modal open onClose={onClose} wide title="Edit Campaign Period" subtitle={`${PLATFORMS[c.platform].name} · ${campaign.title}`}>
      <div className="-mt-4">
        {/* 1. Campaign Details */}
        <Section n={1} title="Campaign Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Campaign Name" required>
              <Input value={c.title} onChange={(v) => set({ title: v })} />
            </Field>
            <Field label="Platform" required>
              <Select value={c.platform} onChange={(v) => set({ platform: v })} options={Object.entries(PLATFORMS).map(([k, p]) => [k, p.name])} />
            </Field>
            <Field label="Campaign Type / Category">
              <Select value={c.campaignType} onChange={(v) => set({ campaignType: v })} options={CAMPAIGN_TYPES} />
            </Field>
            <Field label="Tagline">
              <Input value={c.tagline} onChange={(v) => set({ tagline: v })} placeholder="Short campaign line" />
            </Field>
            <Field label="Campaign Category" required>
              <Select value={c.category} onChange={(v) => set({ category: v })} options={CAMPAIGN_TYPES} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <Select value={c.priority} onChange={(v) => set({ priority: v })} options={PRIORITIES} />
              </Field>
              <Field label="Status">
                <Select value={c.status} onChange={(v) => set({ status: v })} options={[["", "Auto (from dates)"], ...STATUSES]} />
              </Field>
            </div>
            <Field label="Description" className="md:col-span-2">
              <TextArea value={c.description} onChange={(v) => set({ description: v })} />
            </Field>
          </div>
        </Section>

        {/* 2. Scope */}
        <Section n={2} title="Standardized Campaign Scope" note="Not a free-text field">
          <div className={labelClass} style={{ color: hrh.ink2 }}>
            Scope Type<span style={{ color: hrh.bad }}> *</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1.5">
            <ScopeCard active={c.scopeType === "chainwide"} title="Chainwide" sub={`All ${HMR_BRANCHES.length} HMR Branches`} onClick={() => set({ scopeType: "chainwide" })} />
            <ScopeCard active={c.scopeType === "online"} title="Online Only" sub="No Physical Branch" onClick={() => set({ scopeType: "online", onlineComponent: true })} />
            <ScopeCard active={c.scopeType === "selected"} title="Selected Branches" sub={`Multi-Select · ${c.branches.length} of ${HMR_BRANCHES.length} picked`} onClick={() => set({ scopeType: "selected" })} />
          </div>

          {c.scopeType === "chainwide" && (
            <p className="text-[12px] mt-2.5 leading-relaxed" style={{ color: hrh.ink2 }}>
              Associated automatically with all {HMR_BRANCHES.length} HMR branches: {HMR_BRANCHES.join(" • ")}
            </p>
          )}
          {c.scopeType === "selected" && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {HMR_BRANCHES.map((b) => (
                <Chip key={b} active={c.branches.includes(b)} onClick={() => toggleIn("branches", b)}>
                  {b}
                </Chip>
              ))}
            </div>
          )}

          <div className="mt-4">
            {c.scopeType !== "online" && (
              <>
                <div className={labelClass} style={{ color: hrh.ink2 }}>
                  Online Component
                  <span className="font-normal" style={{ color: hrh.muted }}>
                    {" "}
                    · "Chainwide" can include physical branches + HMR.PH + marketplaces.
                  </span>
                </div>
                <YesNo value={c.onlineComponent} onChange={(v) => set({ onlineComponent: v })} />
              </>
            )}
            {(c.onlineComponent || c.scopeType === "online") && (
              <div className="mt-3">
                <div className={labelClass} style={{ color: hrh.ink2 }}>
                  Select Applicable Digital Channels ({selectedChannels} selected):
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {DIGITAL_CHANNELS.map((ch) => (
                    <Chip key={ch} active={c.channels.includes(ch)} onClick={() => toggleIn("channels", ch)}>
                      {ch}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* 3. Schedule */}
        <Section n={3} title="Campaign Schedule">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Planning Start">
              <Input type="date" value={c.planningStart} onChange={(v) => set({ planningStart: v })} />
            </Field>
            <Field label="Teaser Date" hint="Pre-Launch">
              <Input type="date" value={c.teaserDate} onChange={(v) => set({ teaserDate: v })} />
            </Field>
            <Field label="Campaign Start" required>
              <Input type="date" value={c.date} onChange={(v) => v && set({ date: v, end: c.end < v ? v : c.end })} />
            </Field>
            <Field label="Campaign End" required>
              <Input type="date" value={c.end} min={c.date} onChange={(v) => set({ end: v })} />
            </Field>
            <Field label="Operational Strategic Hook" className="col-span-2">
              <TextArea rows={2} value={c.strategicHook} onChange={(v) => set({ strategicHook: v })} />
            </Field>
            <Field label="Marketplace Notes / Category Focus" className="col-span-2">
              <TextArea
                rows={2}
                value={c.marketplaceNotes}
                onChange={(v) => set({ marketplaceNotes: v })}
                placeholder="e.g. Category focus: Lifestyle, Beauty, Tech on Trend; Unli Free Shipping terms..."
              />
            </Field>
          </div>
        </Section>

        {/* 4. Tracking */}
        <Section n={4} title="SMS / App Notification / App Push Tracking" note="Dispatch Lifecycle">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              ["sms", "SMS Tracking"],
              ["appNotif", "App Notif Tracking"],
              ["appPush", "App Push Tracking"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <Select value={c.tracking[key]} onChange={(v) => set({ tracking: { ...c.tracking, [key]: v } })} options={TRACKING_STATES} />
              </Field>
            ))}
          </div>
        </Section>

        {/* 5. Posting links */}
        <Section n={5} title="Posting Links" note="Track Live Posts">
          <div className="space-y-2">
            {c.postingLinks.map((l, i) => (
              <div key={i} className="grid grid-cols-[150px_1fr_auto] gap-2 items-center">
                <select className={fieldClass + " mt-0"} style={{ borderColor: hrh.border, color: hrh.ink }} value={l.platform} onChange={(e) => setLink(i, { platform: e.target.value })}>
                  {POSTING_PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <input
                  className={fieldClass + " mt-0"}
                  style={{ borderColor: hrh.border, color: hrh.ink }}
                  value={l.url}
                  placeholder="https://"
                  onChange={(e) => setLink(i, { url: e.target.value })}
                />
                <div className="flex gap-1">
                  {/^https?:\/\//i.test(l.url.trim()) && (
                    <a href={l.url.trim()} target="_blank" rel="noreferrer" className="rounded-md border px-2.5 py-2 text-[12px] font-semibold" style={{ borderColor: hrh.border, color: hrh.blueText }}>
                      Open
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => set({ postingLinks: c.postingLinks.filter((_, j) => j !== i) })}
                    className="rounded-md border px-2.5 py-2 text-[12px] font-semibold"
                    style={{ borderColor: hrh.border, color: hrh.bad }}
                    aria-label="Remove link"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set({ postingLinks: [...c.postingLinks, { platform: "Facebook", url: "" }] })}
            className="mt-2.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold"
            style={{ borderColor: hrh.border, color: hrh.ink }}
          >
            + Add Live Link
          </button>
        </Section>

        {/* 6. Recurring */}
        <Section n={6} title="Recurring Campaign Logic">
          <div className={labelClass} style={{ color: hrh.ink2 }}>
            Recurring
          </div>
          <YesNo value={c.recurring} onChange={(v) => set({ recurring: v, recurrenceStart: c.recurrenceStart || c.date, recurrenceEnd: c.recurrenceEnd || c.end })} />
          <p className="text-[11.5px] mt-1.5" style={{ color: hrh.muted }}>
            Recurring campaigns are created from one master campaign rather than manually creating unrelated records.
          </p>
          {c.recurring && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Field label="Frequency" required>
                <Select value={c.frequency} onChange={(v) => set({ frequency: v })} options={FREQUENCIES} />
              </Field>
              <Field label="Day of Week / Cadence">
                <Input value={c.cadence} onChange={(v) => set({ cadence: v })} placeholder="e.g. Tuesday" list="cadence-days" />
                <datalist id="cadence-days">
                  {WEEKDAY_NAMES.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              <Field label="Recurring Campaign State" required>
                <Select value={c.recurringState} onChange={(v) => set({ recurringState: v })} options={RECURRING_STATES} />
              </Field>
              <Field label="Parent Campaign" hint="for Seasonally Integrated">
                <Select value={c.parentCampaign} onChange={(v) => set({ parentCampaign: v })} options={parentOptions} />
              </Field>
              <Field label="Repeat Interval">
                <Input type="number" min={1} value={c.repeatInterval} onChange={(v) => set({ repeatInterval: v })} />
              </Field>
              <Field label="Recurrence Start">
                <Input type="date" value={c.recurrenceStart} onChange={(v) => set({ recurrenceStart: v })} />
              </Field>
              <Field label="Recurrence End">
                <Input type="date" value={c.recurrenceEnd} min={c.recurrenceStart} onChange={(v) => set({ recurrenceEnd: v })} />
              </Field>
              <Field label="Number of Occurrences" hint={autoOccurrences != null ? `rule gives ${autoOccurrences}` : undefined}>
                <Input type="number" min={0} value={c.occurrences} onChange={(v) => set({ occurrences: v })} placeholder={autoOccurrences != null ? String(autoOccurrences) : ""} />
              </Field>
              <Field label="Custom Recurrence Notes" className="col-span-2 md:col-span-4">
                <TextArea rows={2} value={c.recurrenceNotes} onChange={(v) => set({ recurrenceNotes: v })} />
              </Field>
            </div>
          )}
        </Section>

        {errors.length > 0 && (
          <div className="rounded-md px-3 py-2.5 mb-3 text-[12.5px]" style={{ background: "#faeaea", color: "#c42b2b" }}>
            {errors.map((e) => (
              <div key={e}>• {e}</div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: `1px solid ${hrh.border}` }}>
          {confirmDelete ? (
            <>
              <span className="text-[12.5px] font-semibold" style={{ color: hrh.bad }}>
                Delete this campaign?
              </span>
              <button type="button" onClick={() => onDelete(c.id)} className="rounded-md px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: hrh.bad }}>
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border px-3 py-2 text-[12.5px] font-semibold" style={{ borderColor: hrh.border, color: hrh.ink2 }}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-md border px-3 py-2 text-[12.5px] font-semibold" style={{ borderColor: "#f0b4b4", color: hrh.bad }}>
              Delete Campaign
            </button>
          )}
          <span className="text-[11px] ml-auto" style={{ color: hrh.muted }}>
            Changes last until the page is reloaded.
          </span>
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-[12.5px] font-semibold" style={{ borderColor: hrh.border, color: hrh.ink }}>
            Cancel
          </button>
          <button type="button" onClick={save} className="rounded-md px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: "#071b33" }}>
            Save Campaign Change
          </button>
        </div>
      </div>
    </Modal>
  );
}
