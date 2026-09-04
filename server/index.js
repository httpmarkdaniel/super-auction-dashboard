// Cloud Run adapter — the ONLY job of this file is to expose the existing
// Vercel-style handlers in api/*.js under the same /api/* paths the
// frontend already calls. It is transport only: no business logic, no SQL,
// no response reshaping. Every handler already uses exactly the same
// req/res surface Express provides natively (req.query for query-string
// params, res.status().json() and res.setHeader() for responses — see the
// P0 usage-fix audit's own findings), so each one is imported and mounted
// completely unmodified.
import express from "express";

import overview from "../api/overview.js";
import leaderboards from "../api/leaderboards.js";
import liveAuctions from "../api/live-auctions.js";
import liveAuctionDetail from "../api/live-auction-detail.js";
import payables from "../api/payables.js";
import auctionDetail from "../api/auction-detail.js";
import revenueBreakdown from "../api/revenue-breakdown.js";
import upcomingAuctions from "../api/upcoming-auctions.js";
import biddingPace from "../api/bidding-pace.js";

const app = express();

// Cloud Run's own container health check just needs a 200 on the port —
// no dashboard traffic ever reaches this path (Firebase Hosting only
// rewrites /api/** here, see firebase.json).
app.get("/", (req, res) => res.status(200).send("ok"));

// One route per existing api/*.js file — same path, same query params,
// same handler function, same response. No second implementation.
app.get("/api/overview", overview);
app.get("/api/leaderboards", leaderboards);
app.get("/api/live-auctions", liveAuctions);
app.get("/api/live-auction-detail", liveAuctionDetail);
app.get("/api/payables", payables);
app.get("/api/auction-detail", auctionDetail);
app.get("/api/revenue-breakdown", revenueBreakdown);
app.get("/api/upcoming-auctions", upcomingAuctions);
app.get("/api/bidding-pace", biddingPace);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
