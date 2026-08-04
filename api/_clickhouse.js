// Shared ClickHouse HTTP-interface query helper for serverless functions.
// Credentials come from Vercel env vars only — never bundled client-side.
export async function chQuery(sql) {
  const { CH_HOST, CH_PORT, CH_USER, CH_PASSWORD, CH_DB, CH_SECURE } = process.env;
  const protocol = CH_SECURE === "true" ? "https" : "http";
  const url = `${protocol}://${CH_HOST}:${CH_PORT}/?database=${encodeURIComponent(CH_DB)}`;
  const auth = Buffer.from(`${CH_USER}:${CH_PASSWORD}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: sql,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ClickHouse query failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const json = await response.json();
  return json.data;
}
