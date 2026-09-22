// Mock data + derivation logic for the 3 new analytics additions (Store
// Performance Quadrant, Product Velocity Analysis, Needs Attention Center).
// Kept separate from the components that render them so each can later be
// swapped for a live /api/retail-analytics report by replacing these
// exports without touching any JSX.
import { retail } from "./theme";

// ---------------------------------------------------------------------
// 1. Store Performance Quadrant
// ---------------------------------------------------------------------
// Store names match the real, fixed 9 core walk-in branches used
// everywhere else in Retail (see CORE_RETAIL_STORES in
// api/_retail-foot-traffic.js and STORE_REGIONS in ../storeRegions.js) —
// only the growth/revenue figures below are mock, pending a live
// foot-traffic + conversion API report.
export const STORE_QUADRANT_DATA = [
  { store: "PIONEER", revenue: 3200000, trafficGrowthPct: 8.4, conversionGrowthPct: 5.1, currentTraffic: 12400, currentConversionPct: 18.2, transactions: 2258 },
  { store: "S AND C CAINTA", revenue: 2650000, trafficGrowthPct: -4.2, conversionGrowthPct: -6.0, currentTraffic: 9100, currentConversionPct: 14.0, transactions: 1274 },
  { store: "HMR SUCAT", revenue: 2100000, trafficGrowthPct: 6.7, conversionGrowthPct: -3.8, currentTraffic: 8700, currentConversionPct: 12.5, transactions: 1088 },
  { store: "HMR TAGAYTAY ROAD", revenue: 1980000, trafficGrowthPct: -2.9, conversionGrowthPct: 4.4, currentTraffic: 7600, currentConversionPct: 16.9, transactions: 1284 },
  { store: "SUBIC MAIN", revenue: 1750000, trafficGrowthPct: 3.1, conversionGrowthPct: 2.0, currentTraffic: 6900, currentConversionPct: 15.4, transactions: 1063 },
  { store: "CEBU", revenue: 1550000, trafficGrowthPct: 2.4, conversionGrowthPct: -1.5, currentTraffic: 6100, currentConversionPct: 13.9, transactions: 848 },
  { store: "HMR CAGAYAN DE ORO", revenue: 1420000, trafficGrowthPct: -7.5, conversionGrowthPct: -2.1, currentTraffic: 5200, currentConversionPct: 11.8, transactions: 613 },
  { store: "MABALACAT", revenue: 1180000, trafficGrowthPct: 1.6, conversionGrowthPct: 1.2, currentTraffic: 4700, currentConversionPct: 13.6, transactions: 639 },
  { store: "NORTH CALOOCAN", revenue: 980000, trafficGrowthPct: -1.1, conversionGrowthPct: -4.9, currentTraffic: 4100, currentConversionPct: 10.2, transactions: 418 },
];

export function getStoreQuadrant(trafficGrowthPct, conversionGrowthPct) {
  if (trafficGrowthPct >= 0 && conversionGrowthPct >= 0) return { key: "strong", label: "Strong Store", color: retail.good };
  if (trafficGrowthPct < 0 && conversionGrowthPct >= 0) return { key: "trafficProblem", label: "Traffic Problem", color: retail.blue };
  if (trafficGrowthPct >= 0 && conversionGrowthPct < 0) return { key: "conversionProblem", label: "Conversion Problem", color: retail.orange };
  return { key: "needsAttention", label: "Needs Attention", color: retail.bad };
}

// ---------------------------------------------------------------------
// 2. Product Velocity Analysis
// ---------------------------------------------------------------------
function classifyVelocity(avgDailySales, daysOfSupply) {
  if (avgDailySales >= 2 && daysOfSupply <= 10) {
    return { status: "Replenishment Risk", color: retail.bad, action: "Reorder immediately — high stockout risk" };
  }
  if (avgDailySales >= 2 && daysOfSupply <= 45) {
    return { status: "Fast Moving", color: retail.blue, action: "Monitor closely; consider a larger reorder qty" };
  }
  if (avgDailySales < 0.5 || daysOfSupply >= 90) {
    return { status: "Slow Moving", color: retail.orange, action: "Review for markdown or promotion" };
  }
  return { status: "Healthy", color: retail.good, action: "No action needed — coverage is balanced" };
}

const PRODUCT_VELOCITY_BASE = [
  { product: "Bottled Water 1.5L", category: "Beverages", currentStock: 40, unitsSold30d: 390, salesValue: 5850 },
  { product: "3-in-1 Coffee Pack", category: "Beverages", currentStock: 150, unitsSold30d: 270, salesValue: 2700 },
  { product: "Toothpaste 150g", category: "Personal Care", currentStock: 300, unitsSold30d: 150, salesValue: 12750 },
  { product: "Laundry Detergent 1kg", category: "Household", currentStock: 600, unitsSold30d: 60, salesValue: 7200 },
  { product: "Canned Tuna 155g", category: "Grocery", currentStock: 80, unitsSold30d: 340, salesValue: 11900 },
  { product: "Biscuits Family Pack", category: "Snacks", currentStock: 250, unitsSold30d: 180, salesValue: 8100 },
  { product: "Dishwashing Liquid 500mL", category: "Household", currentStock: 400, unitsSold30d: 45, salesValue: 2925 },
  { product: "Cooking Oil 1L", category: "Grocery", currentStock: 350, unitsSold30d: 210, salesValue: 23100 },
  { product: "Sardines 155g", category: "Grocery", currentStock: 20, unitsSold30d: 5, salesValue: 140 },
  { product: "Powdered Milk 900g", category: "Grocery", currentStock: 110, unitsSold30d: 270, salesValue: 56700 },
];

export const PRODUCT_VELOCITY_DATA = PRODUCT_VELOCITY_BASE.map((p, i) => {
  const avgDailySales = p.unitsSold30d / 30;
  const daysOfSupply = avgDailySales > 0 ? p.currentStock / avgDailySales : Infinity;
  const { status, color, action } = classifyVelocity(avgDailySales, daysOfSupply);
  return { id: i + 1, ...p, avgDailySales, daysOfSupply, status, color, action };
});

// ---------------------------------------------------------------------
// 3. Needs Attention Center
// ---------------------------------------------------------------------
export const NEEDS_ATTENTION_DATA = [
  { id: 1, priority: "Critical", area: "Store", entity: "HMR CAGAYAN DE ORO", issue: "Revenue down 24%", currentMetric: "₱1.1M", benchmark: "₱1.45M previous", businessImpact: "-₱350K", recommendedAction: "Investigate traffic and conversion drop together", status: "Critical" },
  { id: 2, priority: "High", area: "Store", entity: "S AND C CAINTA", issue: "Revenue down 18%", currentMetric: "₱3.2M", benchmark: "₱3.9M previous", businessImpact: "-₱700K", recommendedAction: "Check traffic and conversion", status: "Investigate" },
  { id: 3, priority: "High", area: "Store", entity: "HMR SUCAT", issue: "Conversion down 6pp", currentMetric: "14%", benchmark: "20% previous", businessImpact: "Lost sales opportunity", recommendedAction: "Review traffic quality and store operations", status: "Investigate" },
  { id: 4, priority: "High", area: "Product", entity: "Bottled Water 1.5L", issue: "3 days of supply", currentMetric: "40 units", benchmark: "7-day minimum", businessImpact: "Stockout risk", recommendedAction: "Replenish / review incoming stock", status: "Action Required" },
  { id: 5, priority: "High", area: "Product", entity: "Canned Tuna 155g", issue: "7 days of supply", currentMetric: "80 units", benchmark: "7-day minimum", businessImpact: "Stockout risk", recommendedAction: "Replenish / review incoming stock", status: "Action Required" },
  { id: 6, priority: "Medium", area: "Channel", entity: "Viber", issue: "Transactions down 14%", currentMetric: "1,317", benchmark: "1,453 previous", businessImpact: "Revenue risk", recommendedAction: "Review campaign and engagement activity", status: "Monitor" },
  { id: 7, priority: "Medium", area: "Customer", entity: "Retained Customers", issue: "Retained customer count down 9%", currentMetric: "2,140", benchmark: "2,350 previous", businessImpact: "Recurring revenue risk", recommendedAction: "Review loyalty and retention campaigns", status: "Monitor" },
  { id: 8, priority: "Medium", area: "Inventory", entity: "180+ Day Inventory", issue: "Aged stock above threshold", currentMetric: "₱3.4M", benchmark: "Threshold exceeded", businessImpact: "Capital tied up", recommendedAction: "Review markdown opportunities", status: "Monitor" },
  { id: 9, priority: "Low", area: "Store", entity: "PIONEER", issue: "Revenue up 12%, trending healthy", currentMetric: "₱3.2M", benchmark: "₱2.9M previous", businessImpact: "Positive", recommendedAction: "No action needed", status: "Healthy" },
];
