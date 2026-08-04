import { hmrApiGet } from "./_hmrApi.js";

// Distinct bidders for one lot — same on-demand-only calling pattern as
// live-bid-history.js, for the same rate-limit reason.
export default async function handler(req, res) {
  const { posting, search } = req.query;
  if (!posting) return res.status(400).json({ error: "posting is required" });

  try {
    const data = await hmrApiGet(`/postings/${encodeURIComponent(posting)}/bidders`, { search });
    res.status(200).json({ bidders: data });
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message });
  }
}
