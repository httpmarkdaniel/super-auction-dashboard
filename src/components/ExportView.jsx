import { useState } from "react";
import Card from "./primitives/Card";
import StoryHeader from "./StoryHeader";
import { formatPeso } from "../utils/format";
import { scopePossessive } from "../insights";

const sections = [
  "Hero KPIs",
  "Reserve Price Performance",
  "Category & Branch Breakdown",
  "Top Vendors & Bidders",
  "Money Flow",
  "Vendor Payables Backlog",
  "Operations Detail",
];

export default function ExportView({ store, overview }) {
  const [checked, setChecked] = useState(Object.fromEntries(sections.map((s) => [s, true])));
  const toggle = (s) => setChecked((c) => ({ ...c, [s]: !c[s] }));
  const selectedCount = Object.values(checked).filter(Boolean).length;

  const headline = `This report captures ${scopePossessive(store)} snapshot as of today: ${formatPeso(
    overview.heroKPIs.totalBidAmount
  )} in bids at ${overview.heroKPIs.sellThroughRate}% sell-through. ${selectedCount} of ${
    sections.length
  } sections are selected below — trim it down to what the reader actually needs.`;

  return (
    <div>
      <div className="mb-8">
        <StoryHeader eyebrow={`${store} · Export`} headline={headline} />
      </div>

      <div className="max-w-[520px]">
        <Card title="Report Sections" subtitle="Choose what to include, then generate a PDF snapshot for sharing with executives.">
          <div className="space-y-2.5 mb-6">
            {sections.map((s) => (
              <label key={s} className="flex items-center gap-2.5 text-[13.5px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked[s]}
                  onChange={() => toggle(s)}
                  className="w-4 h-4 rounded accent-series1"
                />
                {s}
              </label>
            ))}
          </div>

          <button
            onClick={() => window.print()}
            className="w-full bg-brandOrange hover:opacity-90 text-white text-[13.5px] font-medium rounded-lg py-2.5 transition-opacity"
          >
            Generate PDF
          </button>
          <div className="text-[11.5px] text-muted mt-3 text-center">
            Uses your browser's print dialog — choose "Save as PDF" as the destination.
          </div>
        </Card>
      </div>
    </div>
  );
}
