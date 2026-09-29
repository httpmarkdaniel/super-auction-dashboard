import { useEffect, useMemo, useState } from "react";
import { hrh } from "../theme";
import Modal from "../components/Modal";
import { CAMPAIGN_EVENTS, CONTINUOUS_CAMPAIGNS, HMR_BRANCHES, PLATFORMS, SEASON_MONTHS, withCampaignDefaults } from "../data/campaignCalendar";

// Recreates "HRH_Online_Campaign_Calendar.html" (the marketing team's
// campaign calendar) as a dashboard page: month grid with HMR Online /
// Shopee / TikTok overlays, platform filter, search, clean/show-all density, summary cards,
// a detail panel, and PDF/CSV/ICS export.
//
// Campaign data is static (src/hrh-online/data/campaignCalendar.js).
// Clicking any campaign opens the full "Edit Campaign Period" form
// (components/CampaignEditor.jsx); edits and deletes live in this page's
// state only — the original HTML worked the same way, and there's no
// campaign table in the warehouse to write to yet.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const CLEAN_LIMIT = 3;

// Platform colors carried over from the original calendar — they're how
// the marketing team already reads it (pink HMR, orange Shopee, cyan
// TikTok; green marks payday sales).
const EVENT_STYLES = {
  hmr: { background: "#ffeaf1", borderColor: "#f2a3bb" },
  hmrStrong: { background: "#f73563", borderColor: "#f73563", color: "#fff" },
  shopee: { background: "#fff4e8", borderColor: "#f3ab67" },
  tiktok: { background: "#e7fbff", borderColor: "#54d4ea" },
  payday: { background: "#e9faf3", borderColor: "#87d9bf" },
  yellow: { background: "#fff7dc", borderColor: "#f0d36d" },
  purple: { background: "#efeaff", borderColor: "#c5b9ff" },
};
const PLATFORM_TONES = {
  hmr: { color: "#a9214c", background: "#ffeaf1", borderColor: "#f6a4bd" },
  shopee: { color: "#b64d00", background: "#fff4e8", borderColor: "#f8ba82" },
  tiktok: { color: "#007c91", background: "#e7fbff", borderColor: "#6fd7e8" },
};
const STATUS_TONES = {
  Active: { color: "#0a8c5e", background: "#e4f8ee" },
  Upcoming: { color: hrh.blueText, background: hrh.blueSoft },
  Ended: { color: hrh.ink2, background: "#eef0f4" },
  Paused: { color: "#b07514", background: "#faf1df" },
  Draft: { color: hrh.ink2, background: "#eef0f4" },
};
const SCOPE_LABELS = { chainwide: `Chainwide · all ${HMR_BRANCHES.length} branches`, online: "Online only", selected: "Selected branches" };

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseIso = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const todayIso = () => {
  const t = new Date();
  return isoOf(t.getFullYear(), t.getMonth(), t.getDate());
};
const shortDate = (iso) => parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const addDaysIso = (iso, n) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
};
const monthKey = (iso) => iso.slice(0, 7);
const endOf = (e) => e.end || e.date;

function eventStyle(e) {
  if (e.variant) return EVENT_STYLES[e.variant];
  if (e.platform === "hmr" && e.strong) return EVENT_STYLES.hmrStrong;
  return EVENT_STYLES[e.platform];
}

function statusOf(e, today) {
  if (e.status) return e.status;
  if (endOf(e) < today) return "Ended";
  if (e.date > today) return "Upcoming";
  return "Active";
}

function download(filename, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Btn({ children, onClick, active = false, tone, className = "", title }) {
  const tones = {
    primary: { background: "#e91e63", color: "#fff", borderColor: "#e91e63" },
    green: { background: "#f3fff9", color: "#09895e", borderColor: "#88dfc1" },
    purple: { background: "#faf7ff", color: "#6e4bf1", borderColor: "#ccbfff" },
    dark: { background: "#071b33", color: "#fff", borderColor: "#071b33" },
  };
  const style = active
    ? { background: hrh.navyAccentRow, color: "#fff", borderColor: hrh.navyAccentRow }
    : tones[tone] || { background: hrh.surface, color: hrh.ink, borderColor: hrh.border };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

function SummaryCard({ icon, iconBg, value, label, sub }) {
  return (
    <div className="rounded-md p-4 flex items-center gap-3" style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
      <div className="w-11 h-11 rounded-lg grid place-items-center text-[21px] shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[22px] font-bold leading-tight" style={{ color: hrh.ink }}>
          {value}
        </div>
        <div className="text-[12.5px] font-semibold" style={{ color: hrh.ink }}>
          {label}
        </div>
        <div className="text-[11px] mt-0.5 truncate" style={{ color: hrh.muted }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2.5 my-3 text-[12px]">
      <div style={{ color: hrh.ink2 }}>{label}</div>
      <div className="font-semibold leading-snug" style={{ color: hrh.ink }}>
        {children}
      </div>
    </div>
  );
}

// Display-only day view: every Google Sheet column for that date (all
// edits happen in the Sheet), plus the read-only Campaign Details,
// Campaign Schedule and Posting Links of any campaign running that day.
function DayDetails({ iso, sheetRow, sheetColumns, dayCampaigns, onClose }) {
  const links = dayCampaigns.flatMap((c) => (c.postingLinks || []).filter((l) => l.url).map((l) => ({ ...l, title: c.title })));
  const dateLabel = parseIso(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const heading = "text-[12px] font-bold uppercase tracking-[0.05em] mt-4 mb-2";
  return (
    <Modal open onClose={onClose} wide title={sheetRow?.["Campaign Theme"] || "No sheet entry"} subtitle={dateLabel}>
      <div className={heading} style={{ color: hrh.ink }}>Campaign Calendar (Google Sheet)</div>
      {sheetRow ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {sheetColumns.map((col) => (
            <DetailRow key={col} label={col}>{sheetRow[col] || "—"}</DetailRow>
          ))}
        </div>
      ) : (
        <div className="text-[12.5px]" style={{ color: hrh.muted }}>No row for this date in the Google Sheet.</div>
      )}

      <div className={heading} style={{ color: hrh.ink }}>Campaign Details</div>
      {dayCampaigns.length === 0 && <div className="text-[12.5px]" style={{ color: hrh.muted }}>No platform campaigns on this day.</div>}
      {dayCampaigns.map((c) => (
        <div key={c.id} className="mb-2">
          <DetailRow label="Campaign">{c.title}</DetailRow>
          <DetailRow label="Platform">{PLATFORMS[c.platform].name}</DetailRow>
          <DetailRow label="Type">{c.campaignType}</DetailRow>
          {c.tagline && <DetailRow label="Tagline">{c.tagline}</DetailRow>}
          {c.description && <DetailRow label="Description">{c.description}</DetailRow>}
        </div>
      ))}

      <div className={heading} style={{ color: hrh.ink }}>Campaign Schedule</div>
      {dayCampaigns.length === 0 && <div className="text-[12.5px]" style={{ color: hrh.muted }}>—</div>}
      {dayCampaigns.map((c) => (
        <DetailRow key={c.id} label={c.title}>
          {shortDate(c.date)}
          {endOf(c) !== c.date ? ` – ${shortDate(endOf(c))}` : ""}
          {c.planningStart ? ` · Planning ${shortDate(c.planningStart)}` : ""}
          {c.teaserDate ? ` · Teaser ${shortDate(c.teaserDate)}` : ""}
        </DetailRow>
      ))}

      <div className={heading} style={{ color: hrh.ink }}>Posting Links</div>
      {links.length === 0 ? (
        <div className="text-[12.5px]" style={{ color: hrh.muted }}>No posting links.</div>
      ) : (
        links.map((l, i) => (
          <DetailRow key={i} label={`${l.title}${l.platform ? ` · ${l.platform}` : ""}`}>
            <a href={l.url} target="_blank" rel="noreferrer" className="underline break-all" style={{ color: hrh.blueText }}>
              {l.url}
            </a>
          </DetailRow>
        ))
      )}
    </Modal>
  );
}

export default function CampaignCalendar() {
  const today = todayIso();
  // Calendar grid is Sheet only; the old platform campaigns are kept ONLY
  // for the day popup's Campaign Details / Schedule / Posting Links.
  const campaigns = useMemo(() => [], []);
  const legacyCampaigns = useMemo(() => [...CAMPAIGN_EVENTS, ...CONTINUOUS_CAMPAIGNS].map(withCampaignDefaults), []);
  const [view, setView] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  const [filter, setFilter] = useState("all");
  const [cleanView, setCleanView] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [dayIso, setDayIso] = useState(null);
  const [sheet, setSheet] = useState({ columns: [], rows: [] });
  const [sheetError, setSheetError] = useState(null);
  useEffect(() => {
    fetch("/api/hrh-sales-analytics?report=campaignSheet")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || j.error);
        setSheet(j);
      })
      .catch((e) => setSheetError(e.message));
  }, []);
  const sheetByIso = useMemo(() => Object.fromEntries(sheet.rows.map((r) => [r.iso, r])), [sheet]);
  const toNumber = (v) => Number(String(v || "").replace(/[^0-9.-]/g, "")) || 0;
  const [shareMsg, setShareMsg] = useState("");

  const viewKey = `${view.year}-${pad(view.month + 1)}`;
  const monthLabel = `${MONTH_NAMES[view.month]} ${view.year}`;

  const events = useMemo(() => campaigns.filter((c) => !c.continuous), [campaigns]);
  const monthEvents = useMemo(() => events.filter((e) => monthKey(e.date) === viewKey), [events, viewKey]);

  const visibleEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthEvents.filter(
      (e) =>
        (filter === "all" || e.platform === filter) &&
        (!q || e.title.toLowerCase().includes(q) || PLATFORMS[e.platform].short.toLowerCase().includes(q)),
    );
  }, [monthEvents, filter, query]);

  const byDay = useMemo(() => {
    const map = {};
    for (const e of visibleEvents) (map[e.date] ||= []).push(e);
    return map;
  }, [visibleEvents]);

  const platformCounts = useMemo(() => {
    const counts = Object.fromEntries(Object.keys(PLATFORMS).map((k) => [k, 0]));
    for (const e of monthEvents) counts[e.platform]++;
    return counts;
  }, [monthEvents]);

  const summary = useMemo(() => {
    const total = monthEvents.length;
    const prev = new Date(view.year, view.month - 1, 1);
    const prevKey = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
    const prevTotal = events.filter((e) => monthKey(e.date) === prevKey).length;
    const dayCounts = {};
    for (const e of monthEvents) dayCounts[e.date] = (dayCounts[e.date] || 0) + 1;
    const [peakDay, peakCount] = Object.entries(dayCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    const [busiest, busiestCount] = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0] || [];
    const upcoming = monthEvents.filter((e) => e.strong && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    return { total, prevTotal, peakDay, peakCount, busiest, busiestCount, upcoming };
  }, [monthEvents, events, platformCounts, view, today]);

  const continuous = useMemo(() => {
    const monthStart = `${viewKey}-01`;
    const monthEnd = isoOf(view.year, view.month, new Date(view.year, view.month + 1, 0).getDate());
    return campaigns.filter((c) => c.continuous && c.date <= monthEnd && endOf(c) >= monthStart);
  }, [campaigns, viewKey, view]);

  // Default selection: this month's next headline launch, else its first campaign.
  const selected = campaigns.find((e) => e.id === selectedId) || summary.upcoming[0] || monthEvents[0] || null;
  const monthSheetRows = sheet.rows.filter((r) => monthKey(r.iso) === viewKey);

  // Side panel: today's sheet row if it is in this month, else the month's first.
  const panelRow = sheetByIso[today] && monthKey(today) === viewKey ? sheetByIso[today] : monthSheetRows[0] || null;

  function openCampaign(c) {
    setSelectedId(c.id);
    setDayIso(c.date);
  }

  useEffect(() => {
    if (!shareMsg) return;
    const t = setTimeout(() => setShareMsg(""), 2500);
    return () => clearTimeout(t);
  }, [shareMsg]);

  function shiftMonth(delta) {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedId(null);
  }

  function exportRows() {
    return monthSheetRows;
  }

  function exportCsv() {
    const rows = [sheet.columns, ...exportRows().map((r) => sheet.columns.map((c) => r[c] ?? ""))];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    download(`HRH_Campaign_Calendar_${MONTH_NAMES[view.month].slice(0, 3)}_${view.year}.csv`, csv, "text/csv");
  }

  function exportIcs() {
    const esc = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HMR//HRH Online Campaign Calendar//EN",
      ...exportRows().flatMap((e) => [
        "BEGIN:VEVENT",
        `UID:${e.iso}@hrh-online.hmr.ph`,
        `DTSTART;VALUE=DATE:${e.iso.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${addDaysIso(e.iso, 1).replaceAll("-", "")}`,
        `SUMMARY:${esc(e["Campaign Theme"] || "Campaign")}`,
        `DESCRIPTION:${esc(e["Suggested Mechanic"] || "")}`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ];
    download(`HRH_Campaign_Calendar_${MONTH_NAMES[view.month].slice(0, 3)}_${view.year}.ics`, lines.join("\r\n"), "text/calendar");
  }

  async function share() {
    const data = { title: "HRH Online Campaign Calendar", text: `HRH Online campaign calendar — ${monthLabel}`, url: window.location.href };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMsg("Link copied");
    } catch {
      setShareMsg("Couldn't copy the link");
    }
  }



  // Calendar cells: leading/trailing days of the neighboring months, only as many rows as the month needs.
  const firstDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const prevMonthDays = new Date(view.year, view.month, 0).getDate();
  const cellCount = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => {
    const n = i - firstDow + 1;
    if (n < 1) return { label: prevMonthDays + n, out: true };
    if (n > daysInMonth) return { label: n - daysInMonth, out: true };
    return { label: n, out: false, iso: isoOf(view.year, view.month, n) };
  });

  const selectedDays = selected ? { start: selected.date, end: endOf(selected) } : null;
  const selectedSpan = selected ? Math.round((parseIso(endOf(selected)) - parseIso(selected.date)) / 86400000) + 1 : 0;
  const selectedStatus = selected ? statusOf(selected, today) : null;
  const deltaText =
    summary.prevTotal > 0
      ? `${summary.total >= summary.prevTotal ? "↑" : "↓"} ${Math.round((Math.abs(summary.total - summary.prevTotal) / summary.prevTotal) * 100)}% vs. last month`
      : "No campaigns scheduled last month";

  return (
    <div>
      <div className="print:hidden">
      </div>

      {/* Toolbar */}
      <section className="rounded-t-md" style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: `1px solid ${hrh.border}` }}>
          <Btn onClick={() => shiftMonth(-1)} className="print:hidden w-9 px-0" title="Previous month">
            ‹
          </Btn>
          <h2 className="text-[22px] font-bold mx-2" style={{ color: hrh.ink }}>
            {monthLabel}
          </h2>
          <Btn onClick={() => shiftMonth(1)} className="print:hidden w-9 px-0" title="Next month">
            ›
          </Btn>
          <div className="flex flex-wrap gap-1.5 lg:ml-auto print:hidden">
            {SEASON_MONTHS.map((m) => (
              <Btn
                key={`${m.year}-${m.month}`}
                active={m.year === view.year && m.month === view.month}
                onClick={() => {
                  setView(m);
                  setSelectedId(null);
                }}
              >
                {MONTH_NAMES[m.month]}
              </Btn>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            <Btn tone="primary" onClick={() => window.print()}>
              🖨 Export to PDF
            </Btn>
            <Btn tone="green" onClick={exportCsv}>
              ▦ CSV
            </Btn>
            <Btn tone="purple" onClick={exportIcs}>
              ▣ ICS
            </Btn>
            <Btn tone="dark" onClick={share}>
              ⌯ Export & Share
            </Btn>
            {shareMsg && (
              <span className="text-[12px] font-semibold" style={{ color: hrh.good }}>
                {shareMsg}
              </span>
            )}
          </div>
        </div>

      </section>

      {/* Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 py-3.5 print:hidden">
        <SummaryCard icon="📊" iconBg="#eaf3ff" value={monthSheetRows.length} label="Campaign Days" sub={`in ${monthLabel}`} />
        <SummaryCard
          icon="🎉"
          iconBg="#fff4e8"
          value={monthSheetRows.filter((r) => r["Key Occasion"]).length}
          label="Key Occasions"
          sub={monthSheetRows.filter((r) => r["Key Occasion"]).slice(0, 3).map((r) => r["Key Occasion"]).join(" · ") || "—"}
        />
        <SummaryCard icon="🛍" iconBg="#e9faf3" value={monthSheetRows.reduce((t, r) => t + toNumber(r["# Featured SKUs"]), 0).toLocaleString()} label="Featured SKUs" sub="sum across the month's days" />
        <SummaryCard
          icon="🏷"
          iconBg="#efeaff"
          value={monthSheetRows.length ? `${(monthSheetRows.reduce((t, r) => t + toNumber(r["Avg % Discount (Featured)"]), 0) / monthSheetRows.length).toFixed(1)}%` : "—"}
          label="Avg % Discount"
          sub="featured SKUs, daily average"
        />
      </section>

      {/* Continuous campaigns */}
      {continuous.length > 0 && (
        <section
          className="rounded-md px-4 py-3.5 mb-3.5 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3 items-start print:hidden"
          style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}
        >
          <h3 className="text-[12.5px] font-bold uppercase tracking-[0.03em] mt-1" style={{ color: hrh.ink }}>
            ✨ Continuous campaigns this month:
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {continuous.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openCampaign(c)}
                className="rounded border px-2.5 py-1.5 text-[11px] font-bold transition hover:-translate-y-px hover:shadow"
                style={PLATFORM_TONES[c.platform]}
                title="View campaign"
              >
                [{PLATFORMS[c.platform].name}] {c.title} · {shortDate(c.date)}–{shortDate(endOf(c))}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Calendar + detail */}
      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-3.5 items-start">
        <div className="rounded-md overflow-x-auto" style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7" style={{ background: "#f7f9fc", borderBottom: `1px solid ${hrh.border}` }}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center py-2.5 text-[11.5px] font-bold tracking-[0.05em]" style={{ color: "#354b66" }}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((cell, i) => {
                const dayEvents = cell.out ? [] : byDay[cell.iso] || [];
                const shown = cleanView ? dayEvents.slice(0, CLEAN_LIMIT) : dayEvents;
                const isSelectedDay = selectedDays && !cell.out && cell.iso >= selectedDays.start && cell.iso <= selectedDays.end;
                const isToday = cell.iso === today;
                return (
                  <div
                    key={i}
                    className={`relative min-h-[150px] px-2 pt-2 pb-6 ${cell.out ? "" : "cursor-pointer"}`}
                    onClick={cell.out ? undefined : () => setDayIso(cell.iso)}
                    style={{
                      background: cell.out ? "#fbfcfe" : isSelectedDay ? "#fbfdff" : hrh.surface,
                      borderRight: (i + 1) % 7 ? `1px solid ${hrh.border}` : "none",
                      borderBottom: i < cellCount - 7 ? `1px solid ${hrh.border}` : "none",
                      outline: isSelectedDay ? "2px solid #4da3ff" : "none",
                      outlineOffset: -2,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full grid place-items-center text-[12.5px] font-bold"
                      style={
                        cell.out
                          ? { color: "#b7c3cf" }
                          : isToday
                            ? { background: hrh.accent, color: "#fff" }
                            : { background: "#0b1d36", color: "#fff" }
                      }
                      title={isToday ? "Today" : undefined}
                    >
                      {cell.label}
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {!cell.out && sheetByIso[cell.iso] && (
                        <div className="rounded-md px-1.5 py-1 text-[11px] leading-tight font-semibold" style={{ background: "#0b1d36", color: "#fff" }} title={sheetByIso[cell.iso]["Focus / Assortment"]}>
                          {sheetByIso[cell.iso]["Campaign Theme"] || sheetByIso[cell.iso]["Campaign Pillar"]}
                          {sheetByIso[cell.iso]["Key Occasion"] && <div className="font-normal text-[10px] opacity-80">{sheetByIso[cell.iso]["Key Occasion"]}</div>}
                        </div>
                      )}
                      {shown.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openCampaign(e);
                          }}
                          className="text-left rounded-md border px-1.5 py-1 text-[11px] leading-tight transition hover:-translate-y-px hover:shadow"
                          style={{ ...eventStyle(e), color: eventStyle(e).color || hrh.ink }}
                          title={`${PLATFORMS[e.platform].name}: ${e.title}`}
                        >
                          <b className="text-[9.5px] mr-1">{PLATFORMS[e.platform].short}</b>
                          {e.title.length > 29 ? `${e.title.slice(0, 29)}…` : e.title}
                        </button>
                      ))}
                      {cleanView && dayEvents.length > CLEAN_LIMIT && (
                        <button type="button" onClick={(ev) => { ev.stopPropagation(); setCleanView(false); }} className="text-left pl-1 text-[11px] font-bold print:hidden" style={{ color: hrh.blueText }}>
                          +{dayEvents.length - CLEAN_LIMIT} more
                        </button>
                      )}
                    </div>
                    {dayEvents.length > 0 && (
                      <div className="absolute bottom-1.5 right-2 text-[10px]" style={{ color: "#71879e" }}>
                        {dayEvents.length} item{dayEvents.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {monthEvents.length === 0 && (
            <div className="px-4 py-3 text-[12.5px]" style={{ color: hrh.muted, borderTop: `1px solid ${hrh.border}` }}>
              No campaigns scheduled for {monthLabel} yet.
            </div>
          )}
        </div>

        <aside className="rounded-md overflow-hidden xl:sticky xl:top-4 print:hidden" style={{ background: hrh.surface, border: `1px solid ${hrh.border}` }}>
          {panelRow ? (
            <>
              <div className="p-4" style={{ borderBottom: `1px solid ${hrh.border}` }}>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: "#fff", background: "#0b1d36" }}>
                  {panelRow["Phase"] || "Campaign"}
                </span>
                <h2 className="text-[20px] font-bold leading-tight mt-3 mb-1.5" style={{ color: hrh.ink }}>
                  {panelRow["Campaign Theme"]}
                </h2>
                <div className="text-[12.5px]" style={{ color: hrh.ink2 }}>
                  📅 {panelRow["Date"]} · {panelRow["Day"]}
                </div>
              </div>
              <div className="px-4 py-2">
                {["Campaign Pillar", "Focus / Assortment", "Key Occasion", "Suggested Mechanic", "Channels"].map((k) => (
                  <DetailRow key={k} label={k}>{panelRow[k] || "—"}</DetailRow>
                ))}
              </div>
              <div className="px-4 pb-4 pt-2">
                <button type="button" onClick={() => setDayIso(panelRow.iso)} className="w-full rounded-md py-3 text-[13px] font-bold text-white" style={{ background: "#0c3a68" }}>
                  View full details
                </button>
                <div className="text-[11.5px] mt-2" style={{ color: hrh.muted }}>
                  Display only — edit the Google Sheet to change the calendar.
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-[12.5px]" style={{ color: hrh.muted }}>
              No Google Sheet entries for {monthLabel}.
            </div>
          )}
        </aside>
      </section>

      {sheetError && <div className="mt-3 text-[12px]" style={{ color: hrh.bad }}>Could not load the Google Sheet: {sheetError}</div>}
      {dayIso && (
        <DayDetails
          iso={dayIso}
          sheetRow={sheetByIso[dayIso]}
          sheetColumns={sheet.columns}
          dayCampaigns={legacyCampaigns.filter((c) => c.date <= dayIso && endOf(c) >= dayIso)}
          onClose={() => setDayIso(null)}
        />
      )}
    </div>
  );
}
