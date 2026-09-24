import { useEffect, useMemo, useState } from "react";
import { hrh } from "../theme";
import CampaignEditor from "../components/CampaignEditor";
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

export default function CampaignCalendar() {
  const today = todayIso();
  const [campaigns, setCampaigns] = useState(() => [...CAMPAIGN_EVENTS, ...CONTINUOUS_CAMPAIGNS].map(withCampaignDefaults));
  const [view, setView] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  const [filter, setFilter] = useState("all");
  const [cleanView, setCleanView] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
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
  const editing = campaigns.find((e) => e.id === editingId) || null;

  function openCampaign(c) {
    setSelectedId(c.id);
    setEditingId(c.id);
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
    return [...visibleEvents].sort((a, b) => a.date.localeCompare(b.date));
  }

  function exportCsv() {
    const rows = [
      ["Start", "End", "Platform", "Campaign", "Objective"],
      ...exportRows().map((e) => [e.date, endOf(e), PLATFORMS[e.platform].name, e.title, e.objective || ""]),
    ];
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
        `UID:${e.id}@hrh-online.hmr.ph`,
        `DTSTART;VALUE=DATE:${e.date.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${addDaysIso(endOf(e), 1).replaceAll("-", "")}`,
        `SUMMARY:${esc(e.title)}`,
        `DESCRIPTION:${esc(PLATFORMS[e.platform].name)}`,
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

  function saveCampaign(updated) {
    setCampaigns((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedId(updated.id);
    setEditingId(null);
    if (!updated.continuous) {
      const d = parseIso(updated.date);
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
  }

  function deleteCampaign(id) {
    setCampaigns((list) => list.filter((c) => c.id !== id));
    setSelectedId(null);
    setEditingId(null);
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
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: hrh.ink }}>
          Interactive Calendar
        </div>
        <p className="text-[12px] mt-1 mb-4" style={{ color: hrh.muted }}>
          HRH Online campaign schedule across HMR Online, Shopee and TikTok.
        </p>
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

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 print:hidden">
          <span className="text-[12.5px] font-bold mr-1" style={{ color: hrh.ink }}>
            Platform View Layer:
          </span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="rounded-md border px-3 py-1.5 text-[12.5px] font-bold"
            style={filter === "all" ? { background: "#071b33", color: "#fff", borderColor: "#071b33" } : { background: hrh.surface, color: hrh.ink, borderColor: hrh.border }}
          >
            All Overlays ({monthEvents.length})
          </button>
          {Object.entries(PLATFORMS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className="rounded-md border px-3 py-1.5 text-[12.5px] font-bold"
              style={filter === key ? { background: "#071b33", color: "#fff", borderColor: "#071b33" } : { ...PLATFORM_TONES[key], borderColor: hrh.border }}
            >
              {p.name} ({platformCounts[key]})
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns, events…"
            className="rounded-md border px-3 py-1.5 text-[12.5px] outline-none w-full sm:w-56 xl:ml-auto"
            style={{ borderColor: hrh.border, color: hrh.ink }}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: hrh.muted }}>
              Display Density:
            </span>
            <Btn active={cleanView} onClick={() => setCleanView(true)}>
              {cleanView ? "✓ " : ""}Clean View
            </Btn>
            <Btn active={!cleanView} onClick={() => setCleanView(false)}>
              {!cleanView ? "✓ " : ""}Show All
            </Btn>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 py-3.5 print:hidden">
        <SummaryCard icon="📊" iconBg="#eaf3ff" value={summary.total} label="Scheduled Campaigns" sub={deltaText} />
        <SummaryCard
          icon="📅"
          iconBg="#eaf3ff"
          value={summary.peakDay ? shortDate(summary.peakDay) : "—"}
          label="Peak Campaign Day"
          sub={summary.peakDay ? `${summary.peakCount} campaigns · most active day` : "No campaigns this month"}
        />
        <SummaryCard
          icon="🛍"
          iconBg="#fff2e7"
          value={summary.busiestCount ? PLATFORMS[summary.busiest].name : "—"}
          label="Busiest Platform"
          sub={summary.busiestCount ? `${summary.busiestCount} campaigns · ${Math.round((summary.busiestCount / summary.total) * 100)}% of total` : "No campaigns this month"}
        />
        <SummaryCard
          icon="🚀"
          iconBg="#f0ecff"
          value={summary.upcoming.length}
          label="Upcoming Launches"
          sub={summary.upcoming[0] ? `Next: ${summary.upcoming[0].title} on ${shortDate(summary.upcoming[0].date)}` : "None left this month"}
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
                title="Edit campaign period"
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
                    className="relative min-h-[150px] px-2 pt-2 pb-6"
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
                      {shown.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => openCampaign(e)}
                          className="text-left rounded-md border px-1.5 py-1 text-[11px] leading-tight transition hover:-translate-y-px hover:shadow"
                          style={{ ...eventStyle(e), color: eventStyle(e).color || hrh.ink }}
                          title={`${PLATFORMS[e.platform].name}: ${e.title}`}
                        >
                          <b className="text-[9.5px] mr-1">{PLATFORMS[e.platform].short}</b>
                          {e.title.length > 29 ? `${e.title.slice(0, 29)}…` : e.title}
                        </button>
                      ))}
                      {cleanView && dayEvents.length > CLEAN_LIMIT && (
                        <button type="button" onClick={() => setCleanView(false)} className="text-left pl-1 text-[11px] font-bold print:hidden" style={{ color: hrh.blueText }}>
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
          {selected ? (
            <>
              <div className="p-4" style={{ borderBottom: `1px solid ${hrh.border}` }}>
                <div className="flex gap-2 items-center">
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: PLATFORM_TONES[selected.platform].color, background: PLATFORM_TONES[selected.platform].background }}>
                    {PLATFORMS[selected.platform].name}
                  </span>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={STATUS_TONES[selectedStatus]}>
                    {selectedStatus}
                  </span>
                </div>
                <h2 className="text-[20px] font-bold leading-tight mt-3 mb-1.5" style={{ color: hrh.ink }}>
                  {selected.title}
                </h2>
                <div className="text-[12.5px]" style={{ color: hrh.ink2 }}>
                  📅 {(() => {
                    const startYear = selected.date.slice(0, 4);
                    const endYear = endOf(selected).slice(0, 4);
                    if (selectedSpan === 1) return `${shortDate(selected.date)}, ${startYear}`;
                    if (startYear === endYear) return `${shortDate(selected.date)} – ${shortDate(endOf(selected))}, ${startYear}`;
                    return `${shortDate(selected.date)}, ${startYear} – ${shortDate(endOf(selected))}, ${endYear}`;
                  })()}{" "}
                  · {selectedSpan} day{selectedSpan > 1 ? "s" : ""}
                </div>
              </div>
              <div className="px-4 py-2">
                <DetailRow label="🎯 Objective">{selected.objective || "Coordinate platform execution, campaign assets, and daily promotional visibility."}</DetailRow>
                {selected.tagline && <DetailRow label="💬 Tagline">{selected.tagline}</DetailRow>}
                <DetailRow label="🏬 Platform">{PLATFORMS[selected.platform].name}</DetailRow>
                <DetailRow label="📍 Scope">
                  {SCOPE_LABELS[selected.scopeType]}
                  {selected.scopeType === "selected" && selected.branches.length ? `: ${selected.branches.join(", ")}` : ""}
                </DetailRow>
                <DetailRow label="● Status">{selectedStatus}</DetailRow>
                <DetailRow label="🏷 Tags">
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.tags || [PLATFORMS[selected.platform].short, "Campaign"]).map((t) => (
                      <span key={t} className="rounded-md border px-2 py-1 text-[10.5px] font-medium" style={{ background: "#f5f7fa", borderColor: hrh.border, color: "#4d6580" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </DetailRow>
                <div className="text-[12px] font-bold mt-4 mb-2" style={{ color: hrh.ink }}>
                  ▣ Description
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "#4e6783" }}>
                  {selected.description || "Campaign activity scheduled for the selected date. Use this panel to review execution details, owners, assets, and notes."}
                </p>
              </div>
              <div className="px-4 pb-4 pt-2">
                <button type="button" onClick={() => setEditingId(selected.id)} className="w-full rounded-md py-3 text-[13px] font-bold text-white" style={{ background: "#0c3a68" }}>
                  ✎ View / Edit Campaign
                </button>
              </div>
            </>
          ) : (
            <div className="p-6 text-[12.5px]" style={{ color: hrh.muted }}>
              Select a campaign on the calendar to see its details.
            </div>
          )}
        </aside>
      </section>

      {editing && (
        <CampaignEditor key={editing.id} campaign={editing} campaigns={campaigns} onSave={saveCampaign} onDelete={deleteCampaign} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}
