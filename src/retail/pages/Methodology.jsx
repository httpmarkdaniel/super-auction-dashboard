import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import { retail } from "../theme";

const ROWS = [
  {
    topic: "Segments",
    detail:
      "Retail = 9 physical branches (PIONEER, NORTH CALOOCAN, MABALACAT, S AND C CAINTA, HMR TAGAYTAY ROAD, CEBU, HMR SUCAT, SUBIC MAIN, HMR CAGAYAN DE ORO) + HRH Online. Wholesale = Envirocycle + HPI Canlubang. All = both combined. See src/retail/segments.js.",
  },
  {
    topic: "Why Envirocycle/HPI Canlubang are Wholesale, not Retail",
    detail: "Both have live sales targets but zero foot-traffic tracking and average tickets 10-70x larger than the 9 core branches — they behave like institutional/bulk accounts, not walk-in floor traffic (investigated 2026-09-17).",
  },
  {
    topic: "Weekly view",
    detail: "\"This Week\" is the last full completed Monday-Sunday calendar week, compared against the week before it — not week-to-date.",
  },
  {
    topic: "MTD view",
    detail: "1st of the current month through today, compared against the same elapsed number of days in the previous month.",
  },
  {
    topic: "Revenue",
    detail: "Net of returns — sum(net_sales_amount) from xv3.mart_net_sales, including negative return rows. \"ABS\" (Average Basket Size) = Revenue ÷ Transactions.",
  },
  {
    topic: "Transactions",
    detail: "Distinct invoice_id among gross-sale rows (net_sales_amount > 0) in xv3.mart_net_sales.",
  },
  {
    topic: "Customer (3R): New / Retained / Reactivated",
    detail:
      "Same cohort methodology as HRH Online's own Executive Overview — New = first-ever purchase this month; Retained = repeat purchase within 2 months of the prior one; Reactivated = repeat after a 2+ month gap. Only covers invoices with a real customer name; anonymous/unregistered walk-in transactions are shown separately, not silently dropped — this is why the 3R total doesn't match Sales Overview's revenue total.",
  },
  {
    topic: "Category vs Department",
    detail: "Top Products' Category subtab groups by the raw category_name field (real, ~2,000 distinct fragmented values overall — ranking by revenue and showing only the top 12 naturally filters out the noise). Top Movers/Repeat Sellers/Dropped Items group by the coarser department_name instead, since those tables aren't pre-filtered to a top-N list.",
  },
  {
    topic: "Stock status",
    detail: "From xv3.mart_level_of_inventory's item_qty, summed per product per store — Has Stock (with which store) if item_qty > 0 anywhere in scope, otherwise Sold Out.",
  },
  {
    topic: "Foot Traffic",
    detail: "Only tracked for the 9 core walk-in branches (xv3.mart_foot_traffic_masterlist) — verified zero rows for Wholesale (Envirocycle, HPI Canlubang), and not applicable to HRH Online (e-commerce).",
  },
  {
    topic: "Targets",
    detail: "xv3.mart_sales_target's daily_target, summed over the selected window. Verified 2026-09-17 to have exactly one row per store/date (no duplicates).",
  },
  {
    topic: "How to verify any figure",
    detail: "Every number here is a live ClickHouse query, re-run on every page load — nothing is cached or pre-computed. Ask for the exact query behind any figure and it can be reproduced directly.",
  },
];

// Static content — real methodology summary (data sources, segment
// definitions, view semantics) pulled from every other Retail tab's own
// dataQuality notes, matching the reference report's own Methodology tab.
export default function Methodology() {
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Methodology &amp; Data Notes
      </div>
      <Panel>
        <DataTable
          columns={[
            { key: "topic", label: "Topic", maxWidth: 220 },
            { key: "detail", label: "Detail" },
          ]}
          rows={ROWS}
        />
      </Panel>
      <div className="mt-3 text-[11.5px]" style={{ color: retail.muted }}>
        Source tables: xv3.mart_net_sales, xv3.mart_invoice_items, xv3.mart_foot_traffic_masterlist, xv3.mart_sales_target, xv3.mart_level_of_inventory.
      </div>
    </div>
  );
}
