import { handleRetailExecutiveOverview } from "./_retail-executive-overview.js";
import { handleRetailSalesAnalytics } from "./_retail-sales-analytics.js";
import { handleRetailStorePerformance } from "./_retail-store-performance.js";
import { handleRetailTransactionsBasket } from "./_retail-transactions-basket.js";
import { handleRetailCategoryPerformance } from "./_retail-category-performance.js";
import { handleRetailTopProducts } from "./_retail-top-products.js";

// Retail's own dispatch entrypoint — same report=X pattern as
// api/hrh-sales-analytics.js, fanning out to _retail-*.js handlers. One
// dedicated top-level function for the whole module (rather than one per
// report) since Vercel's Hobby plan caps at 12 serverless functions — see
// the 2026-09-17 commit that folded Executive Overview into the HRH
// dispatcher specifically to free this slot.
export default async function handler(req, res) {
  if (req.query.report === "executiveOverview") return handleRetailExecutiveOverview(req, res);
  if (req.query.report === "salesAnalytics") return handleRetailSalesAnalytics(req, res);
  if (req.query.report === "storePerformance") return handleRetailStorePerformance(req, res);
  if (req.query.report === "transactionsBasket") return handleRetailTransactionsBasket(req, res);
  if (req.query.report === "categoryPerformance") return handleRetailCategoryPerformance(req, res);
  if (req.query.report === "topProducts") return handleRetailTopProducts(req, res);
  return res.status(400).json({ error: "Unknown report", message: `report=${req.query.report}` });
}
