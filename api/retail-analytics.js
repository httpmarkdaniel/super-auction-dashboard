import { handleRetailSalesOverview } from "./_retail-sales-overview.js";
import { handleRetailTrend } from "./_retail-trend.js";
import { handleRetailStorePerformance } from "./_retail-store-performance.js";
import { handleRetailSalesChannel } from "./_retail-sales-channel.js";
import { handleRetailFootTraffic } from "./_retail-foot-traffic.js";
import { handleRetailCustomerSegments } from "./_retail-customer-segments.js";
import { handleRetailTopProducts } from "./_retail-top-products.js";
import { handleRetailStocks } from "./_retail-stocks.js";
import { handleRetailStoreQuadrant } from "./_retail-store-quadrant.js";
import { handleRetailProductVelocity } from "./_retail-product-velocity.js";
import { handleRetailNeedsAttention } from "./_retail-needs-attention.js";
import { handleRetailSalesSegmentBreakdown, handleRetailStoreEngagementBreakdown } from "./_retail-kpi-breakdown.js";
import { handleCaStores, handleCaCustomers } from "./_customer-analytics.js";

// Retail's own dispatch entrypoint — same report=X pattern as
// api/hrh-sales-analytics.js, fanning out to _retail-*.js handlers. One
// dedicated top-level function for the whole module (rather than one per
// report) since Vercel's Hobby plan caps at 12 serverless functions. The
// Marketing module (ca* reports) rides on this same function for
// the same reason.
export default async function handler(req, res) {
  if (req.query.report === "salesOverview") return handleRetailSalesOverview(req, res);
  if (req.query.report === "trend") return handleRetailTrend(req, res);
  if (req.query.report === "storePerformance") return handleRetailStorePerformance(req, res);
  if (req.query.report === "salesChannel") return handleRetailSalesChannel(req, res);
  if (req.query.report === "footTraffic") return handleRetailFootTraffic(req, res);
  if (req.query.report === "customerSegments") return handleRetailCustomerSegments(req, res);
  if (req.query.report === "topProducts") return handleRetailTopProducts(req, res);
  if (req.query.report === "stocks") return handleRetailStocks(req, res);
  if (req.query.report === "storeQuadrant") return handleRetailStoreQuadrant(req, res);
  if (req.query.report === "productVelocity") return handleRetailProductVelocity(req, res);
  if (req.query.report === "needsAttention") return handleRetailNeedsAttention(req, res);
  if (req.query.report === "salesSegmentBreakdown") return handleRetailSalesSegmentBreakdown(req, res);
  if (req.query.report === "storeEngagementBreakdown") return handleRetailStoreEngagementBreakdown(req, res);
  if (req.query.report === "caStores") return handleCaStores(req, res);
  if (req.query.report === "caCustomers") return handleCaCustomers(req, res);
  return res.status(400).json({ error: "Unknown report", message: `report=${req.query.report}` });
}
