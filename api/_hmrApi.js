// Proxy helper for the cms.hmr.ph live-bidding API. Token stays server-side
// per the API's own docs — never sent to the browser.
const BASE_URL = "https://cms.hmr.ph/api/v1";

export async function hmrApiGet(path, params = {}, signal) {
  const token = process.env.HMR_API_TOKEN;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    .toString()
    .replace(/\+/g, "%20");
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal,
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body || body.success !== 1) {
    const message = body?.message || `HMR API request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status === 401 || response.status === 404 ? response.status : 502;
    throw err;
  }

  return body.data;
}
