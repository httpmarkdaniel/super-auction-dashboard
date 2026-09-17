import { handleRetailSalesOverview } from "./_retail-sales-overview.js";
import { handleRetailTrend } from "./_retail-trend.js";
import { handleRetailStorePerformance } from "./_retail-store-performance.js";
import { handleRetailSalesChannel } from "./_retail-sales-channel.js";
import { handleRetailFootTraffic } from "./_retail-foot-traffic.js";
import { handleRetailCustomerSegments } from "./_retail-customer-segments.js";
import { handleRetailTopProducts } from "./_retail-top-products.js";

// Retail's own dispatch entrypoint — same report=X pattern as
// api/hrh-sales-analytics.js, fanning out to _retail-*.js handlers. One
// dedicated top-level function for the whole module (rather than one per
// report) since Vercel's Hobby plan caps at 12 serverless functions.
export default async function handler(req, res) {
  if (req.query.report === "salesOverview") return handleRetailSalesOverview(req, res);
  if (req.query.report === "trend") return handleRetailTrend(req, res);
  if (req.query.report === "storePerformance") return handleRetailStorePerformance(req, res);
  if (req.query.report === "salesChannel") return handleRetailSalesChannel(req, res);
  if (req.query.report === "footTraffic") return handleRetailFootTraffic(req, res);
  if (req.query.report === "customerSegments") return handleRetailCustomerSegments(req, res);
  if (req.query.report === "topProducts") return handleRetailTopProducts(req, res);
  return res.status(400).json({ error: "Unknown report", message: `report=${req.query.report}` });
}
