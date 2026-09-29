import { sheetsGet } from "./_google-sheets.js";

// Read-only HRH Online campaign calendar from the team's Google Sheet
// ("Campaign Calendar" tab) — all edits happen in the Sheet, the dashboard
// only displays it. Read via the hrh-calendar service account.
const SPREADSHEET_ID = "1s6AO9lSqWBsIMFSYJu796rGmPpNcc3-Hz0kfHHgyhA0";
const RANGE = "'Campaign Calendar'!A:O";
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// "Sep 26, 2026" -> "2026-09-26" (also accepts ISO / M/D/YYYY).
function toIso(s) {
  const t = String(s || "").trim();
  let m = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export async function handleCampaignSheet(req, res) {
  try {
    const { values = [] } = await sheetsGet(SPREADSHEET_ID, `/values/${encodeURIComponent(RANGE)}`);
    const [header = [], ...body] = values;
    const columns = header.map((h) => String(h).trim()).filter(Boolean);
    const rows = body
      .map((r) => {
        const iso = toIso(r[0]);
        if (!iso) return null;
        const row = { iso };
        columns.forEach((c, i) => (row[c] = r[i] ?? ""));
        return row;
      })
      .filter(Boolean);
    // Short CDN cache so Sheet edits show up within a minute.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ columns, rows });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't read the campaign Google Sheet", message: err.message });
  }
}
