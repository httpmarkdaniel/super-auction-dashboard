import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildAuctionResultWorkbook,
  excelFileName,
  endDateOnly,
  dash,
  exportDateSuffix,
  DETAILED_COLUMNS,
  DESCRIPTION_COL,
} from "./auctionResultWorkbook";

// jsPDF's standard 14 fonts (Helvetica et al.) have no glyph for "₱"
// (U+20B1) — it renders as a garbled "±" in the PDF. Excel/HTML have no
// such issue (real Unicode font support), so the shared formatPeso() in
// ./format.js stays untouched (48 other call sites, all HTML/Excel) —
// this ASCII-only variant is used ONLY inside exportAuctionResultPdf below.
function formatPesoPdf(n) {
  if (n === null || n === undefined) return "—";
  return "PHP " + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

// Navy for the PDF header text/fills — the Excel side's NAVY_HEX lives in
// ./auctionResultWorkbook.js with the rest of the workbook builder.
const NAVY_RGB = [0x22, 0x30, 0x4f];

// ============================================================
// EXCEL — built by ./auctionResultWorkbook.js (shared with the automated
// auction-result email so both produce the identical workbook).
// ============================================================
export function exportAuctionResultExcel({ filters, totals, rows, topInfo, detailed }) {
  XLSX.writeFile(buildAuctionResultWorkbook({ totals, rows, topInfo, detailed }), excelFileName(filters));
}

// ============================================================
// PDF — jsPDF + jspdf-autotable. Opens directly with Top Info, then Sales
// Summary, then Detailed Auction Result — no printed Selected Filters or
// standalone Summary text block (per task; the underlying dataset is
// still fully filtered upstream, only the PDF-printed filter/summary text
// was removed — Sales Summary's own foot row still carries the totals).
// Landscape so the wide detailed table stays readable — autoTable
// paginates long tables across pages automatically (never a screenshot).
// Built from the same in-memory data as the Excel export above.
// ============================================================
export function exportAuctionResultPdf({ filters, totals, rows, topInfo, detailed }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const marginLeft = 40;
  let y = 44;

  doc.setFont(undefined, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY_RGB);
  doc.text("AUCTION RESULT", marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 26;

  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Top Info", marginLeft, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: marginLeft, right: marginLeft },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: "bold" },
    head: [["Vendor", "Account Executive", "Branch", "Auction Number", "End Date"]],
    body: topInfo.map((t) => [dash(t.vendor), dash(t.account_executive), dash(t.branch), dash(t.auction_number), endDateOnly(t.end_date)]),
  });

  let y2 = doc.lastAutoTable.finalY + 22;
  doc.setFont(undefined, "bold");
  doc.setFontSize(10);
  doc.text("Sales Summary", marginLeft, y2);
  y2 += 4;

  autoTable(doc, {
    startY: y2,
    margin: { left: marginLeft, right: marginLeft },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: "bold" },
    head: [["Payment Status", "For Approval Status", "Count of Lot", "Reserved Price", "Bid Amount"]],
    body: rows.map((r) => [r.payment_status, r.for_approval_status, r.count_of_lot.toLocaleString(), formatPesoPdf(r.reserved_price), formatPesoPdf(r.bid_amount)]),
    foot: [["Total (distinct lots)", "", totals.count_of_lot.toLocaleString(), formatPesoPdf(totals.reserved_price), formatPesoPdf(totals.bid_amount)]],
    footStyles: { fillColor: [230, 230, 235], textColor: NAVY_RGB, fontStyle: "bold" },
  });

  if (detailed) {
    // New page — the detailed table is wide (22 columns) and can run to
    // thousands of rows; autoTable paginates it automatically across as
    // many landscape pages as needed (never a screenshot).
    doc.addPage("a4", "landscape");
    let y3 = 44;
    doc.setFont(undefined, "bold");
    doc.setFontSize(14);
    doc.setTextColor(...NAVY_RGB);
    doc.text("Detailed Auction Result", marginLeft, y3);
    doc.setTextColor(0, 0, 0);
    y3 += 20;

    // Standalone "Total Bid Amount"/"Total Reserved Price" lines removed
    // per task (duplicated the Sales Summary table's own foot row) — the
    // truncation note stays: it's a data-completeness warning, not a
    // decorative summary total.
    if (detailed.truncated) {
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.setTextColor(176, 0, 32);
      doc.text(detailed.truncationNote, marginLeft, y3);
      doc.setTextColor(0, 0, 0);
      y3 += 13;
    }
    y3 += 4;

    autoTable(doc, {
      startY: y3,
      margin: { left: marginLeft, right: marginLeft },
      styles: { fontSize: 6, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: "bold", fontSize: 6 },
      columnStyles: { [DESCRIPTION_COL]: { cellWidth: 90 } }, // Description
      head: [DETAILED_COLUMNS.map(([label]) => label)],
      body: detailed.rows.map((r) => DETAILED_COLUMNS.map(([, get]) => String(get(r)))),
    });
  }

  doc.save(`Auction_Result_${exportDateSuffix(filters)}.pdf`);
}
