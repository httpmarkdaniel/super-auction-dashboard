import { get, put } from "@vercel/blob";

// Team-written insights for HRH Online report pages (first user: Weekly
// Business Review's Insights panel, which replaced its Data Quality Notes).
// One private Vercel Blob JSON file per report + period key, shared by
// everyone using the dashboard — last save wins.
//
// Served through api/hrh-sales-analytics.js's `?report=insights` dispatch
// rather than its own api/*.js file, because the project is already at the
// Hobby plan's 12-function cap (see that file's handler comment).
//
//   GET  ?report=insights&key=<key>            -> { key, text, updatedAt }
//   POST ?report=insights  body { key, text }  -> { key, text, updatedAt }

const KEY_PATTERN = /^[a-z0-9_-]{1,100}$/;
const MAX_TEXT_LENGTH = 20000;

const blobPath = (key) => `insights/${key}.json`;

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

export async function handleInsights(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: "Insights storage isn't configured (BLOB_READ_WRITE_TOKEN missing)" });
  }
  try {
    if (req.method === "GET") {
      const key = String(req.query.key || "");
      if (!KEY_PATTERN.test(key)) return res.status(400).json({ error: "Invalid key" });
      const blob = await get(blobPath(key), { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200) return res.status(200).json({ key, text: "", updatedAt: null });
      const saved = JSON.parse(await new Response(blob.stream).text());
      return res.status(200).json({ key, text: saved.text || "", updatedAt: saved.updatedAt || null });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const key = String(body.key || "");
      const text = typeof body.text === "string" ? body.text : "";
      if (!KEY_PATTERN.test(key)) return res.status(400).json({ error: "Invalid key" });
      if (text.length > MAX_TEXT_LENGTH) return res.status(400).json({ error: `Insights are limited to ${MAX_TEXT_LENGTH.toLocaleString()} characters` });
      const updatedAt = new Date().toISOString();
      await put(blobPath(key), JSON.stringify({ text, updatedAt }), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
      });
      return res.status(200).json({ key, text, updatedAt });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("HRH insights error:", err);
    return res.status(500).json({ error: "Failed to load or save insights", message: err instanceof Error ? err.message : String(err) });
  }
}
