import Panel from "../../retail/components/Panel";
import { retail } from "../../retail/theme";
import { SEGMENTS } from "../segments";

const NOTES = [
  ["Source", "xv3.mart_invoice_items (ClickHouse), queried live on every load. Voided invoices and voided lines are excluded everywhere."],
  [
    "Who counts as a customer",
    "Registered customers only — a real customer name. Walk-in and placeholder names (anything containing “walk in”, n/a, blank, no letters) can't be tracked across visits, so they're left out of customer counts. Overview's “Registered Share” shows how much of total sales that covers.",
  ],
  [
    "One row per customer",
    "Customers are identified by name (there's no shared customer id across stores). A name that appears with several emails or phone numbers is one customer, shown with the email/phone from their most recent purchase.",
  ],
  ["Stores", "Every store that ever sold to a registered customer, closed branches included (e.g. Fairview, Novaliches). “Sucat, Paranaque” is merged into HMR SUCAT."],
  [
    "Customer Explorer",
    "All time, no date filter. Pick stores, then choose ANY (bought at least one) or ALL (bought at every one). “Metrics: selected stores” computes Last Visit, Days Inactive, Last Item, Primary Category, Frequent Store/SC, Lifetime Sales, Visits and Segment from purchases at the selected stores only; “Metrics: all stores” uses every purchase. All Stores Visited always lists every store.",
  ],
  ["Visits", "Distinct invoices."],
  ["New (Overview)", "First-ever purchase at the chosen scope falls inside the period — first at that store when a store is selected, first at any HMR store otherwise."],
  ["Store Overlap", "Distinct registered customers who bought at both stores in the window. Stores with fewer than 500 customers in the window are left out."],
];

export default function Methodology() {
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.05em] mb-4" style={{ color: "#111827" }}>
        Methodology
      </div>
      <Panel title="Customer Segments" subtitle="As of today, from each customer's purchase history" className="mb-4">
        <div className="grid gap-2.5">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="flex items-start gap-2.5 text-[13px]" style={{ color: retail.ink2 }}>
              <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span>
                <b style={{ color: retail.ink }}>{s.key}</b> — {s.definition}
              </span>
            </div>
          ))}
          <p className="text-[12px] m-0 mt-1" style={{ color: retail.muted }}>
            Checked in this order, first match wins — same definition as the Superset customer list.
          </p>
        </div>
      </Panel>
      <Panel title="Definitions">
        <dl className="grid gap-3 m-0">
          {NOTES.map(([term, text]) => (
            <div key={term} className="text-[13px]">
              <dt className="font-bold" style={{ color: retail.ink }}>
                {term}
              </dt>
              <dd className="m-0 mt-0.5" style={{ color: retail.ink2 }}>
                {text}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
