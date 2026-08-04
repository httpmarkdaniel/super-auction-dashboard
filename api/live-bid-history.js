import { hmrApiGet } from "./_hmrApi.js";

// Bid history for one lot — called on-demand (when a lot's history panel
// is actually viewed), not for every lot on every poll, to stay well
// under the API's 60 requests/min rate limit.
export default async function handler(req, res) {
  const { posting, bidder_number, from, to } = req.query;
  if (!posting) return res.status(400).json({ error: "posting is required" });

  try {
    const data = await hmrApiGet(`/postings/${encodeURIComponent(posting)}/bid-history`, {
      bidder_number,
      from,
      to,
    });
    res.status(200).json({ bids: data });
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message });
  }
}
