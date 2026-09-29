import crypto from "node:crypto";

// Minimal read-only Google Sheets client using the hrh-calendar service
// account (GOOGLE_SA_KEY_B64 = base64 of its JSON key) — signs its own JWT
// with node:crypto so no googleapis dependency is needed.
let cached = null; // { token, exp }

async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64 || "", "base64").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${json.error_description || json.error}`);
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export async function sheetsGet(spreadsheetId, path = "", params = {}) {
  const token = await accessToken();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${json.error?.message || "request failed"}`);
  return json;
}
