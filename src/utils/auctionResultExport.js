import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// jsPDF's standard 14 fonts (Helvetica et al.) have no glyph for "₱"
// (U+20B1) — it renders as a garbled "±" in the PDF. Excel/HTML have no
// such issue (real Unicode font support), so the shared formatPeso() in
// ./format.js stays untouched (48 other call sites, all HTML/Excel) —
// this ASCII-only variant is used ONLY inside exportAuctionResultPdf below.
function formatPesoPdf(n) {
  if (n === null || n === undefined) return "—";
  return "PHP " + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

// Dashboard's own navy/orange tokens (src/theme.css light values) — used
// lightly for export headers only, per the task's "do not overdesign it"
// instruction. Not theme-aware (exported files have no dark mode).
const NAVY_HEX = "22304F";
const NAVY_RGB = [0x22, 0x30, 0x4f];

function endDateOnly(value) {
  // end_date/dr_received are UTC-typed ClickHouse columns (see
  // api/overview.js's own comment on end_date) — the raw
  // "YYYY-MM-DD HH:MM:SS.mmm" string's first 10 characters ARE the exact
  // calendar day already used for grouping/filtering, so no timezone math
  // belongs here, just truncation.
  return value ? String(value).slice(0, 10) : "—";
}

function dash(value) {
  return value && String(value).trim() ? value : "—";
}

function numOrBlank(value) {
  return value == null ? "" : value;
}

// Single date when From=To (the default, single-day case), a range
// otherwise — keeps the old single-day filename shape unchanged when
// nothing multi-day was selected.
function exportDateSuffix(filters) {
  return filters.from === filters.to ? filters.from : `${filters.from}_to_${filters.to}`;
}

// XLSX filename: "<Vendor> Auction Summary(<end_date>).xlsx" when a
// Vendor filter is active, "All Vendors Auction Summary(<end_date>).xlsx"
// otherwise — strips characters Windows/macOS both reject in filenames
// (\ / : * ? " < > |), since a real vendor name is free-text and could
// contain any of them.
function sanitizeForFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

function excelFileName(filters) {
  const vendorPart = sanitizeForFilename(filters.vendor || "All Vendors");
  return `${vendorPart} Auction Summary(${exportDateSuffix(filters)}).xlsx`;
}

// Detailed export's 20 business-label columns, in the exact requested
// sequence — [label, cell value getter]. BP %/SF % pass through as-is
// (buyers_premium/commission are stored as plain percentage numbers
// already, e.g. 15/17/18 — NEVER multiplied by 100 here; see
// api/overview.js's own comment on this).
//
// PO Number: NO source field for this exists on xv3.mart_auction_vendor_
// analysis (verified against the table's full column list) — receiving_
// number/dr_number/or_number/client_reference_number are each a distinct,
// already-mapped concept, none proven equivalent to a Purchase Order
// number. Rendered as "—" (the same convention as every other missing
// value in this sheet) rather than silently substituting a wrong field;
// flagged as a real source gap, not fabricated.
//
// Receiving Number/DR PIS/Account Executive: dropped from this sheet per
// the requested column sequence (which excludes them) — still returned
// by the type=auction-result-export API response itself (untouched;
// nothing else reads this file's column list) in case another feature
// needs them later.
const DETAILED_COLUMNS = [
  ["Branch", (r) => dash(r.branch)],
  ["Vendor", (r) => dash(r.vendor)],
  ["Origin", (r) => dash(r.origin)],
  ["DR Number", (r) => dash(r.dr_number)],
  ["DR Received", (r) => endDateOnly(r.dr_received)],
  ["PO Number", () => "—"],
  ["Client Ref No", (r) => dash(r.client_reference_number)],
  ["Item Barcode", (r) => dash(r.item_barcode)],
  ["Qty", (r) => numOrBlank(r.qty)],
  ["Item Status", (r) => dash(r.item_status)],
  ["Auction Number", (r) => dash(r.auction_number)],
  ["End Date", (r) => endDateOnly(r.end_date)],
  ["Lot Number", (r) => dash(r.lot_number)],
  ["Description", (r) => dash(r.description)],
  ["Reserved Price", (r) => r.reserved_price ?? 0],
  ["Bid Amount", (r) => r.bid_amount ?? 0],
  ["BP %", (r) => numOrBlank(r.bp_percent)],
  ["SF %", (r) => numOrBlank(r.sf_percent)],
  ["Payment Status", (r) => dash(r.payment_status)],
  ["For Approval Status", (r) => dash(r.for_approval_status)],
];
const QTY_COL = 8;
const RESERVED_COL = 14;
const BID_COL = 15;
const BP_COL = 16;
const SF_COL = 17;
const DESCRIPTION_COL = 13;
const DETAILED_COL_COUNT = DETAILED_COLUMNS.length;

// ============================================================
// EXCEL — xlsx-js-style (SheetJS fork with cell style support).
// Three sheets: "Auction Result Summary" (the Sales Summary table itself
// — no separate filter/metadata or standalone-totals block above it; the
// table's own total row already carries those totals), "Top Info", and
// "Detailed Auction Result" (the full item-barcode-grain export — see
// api/overview.js's type=auction-result-export). Sheets 1-2 are built
// from the already-loaded on-screen data; Sheet 3's `detailed` argument
// is only ever populated by an on-demand fetch triggered by the Export
// click itself (see useAuctionResult.js's fetchAuctionResultExportData)
// — never fetched on normal page load.
// ============================================================
export function exportAuctionResultExcel({ filters, totals, rows, topInfo, detailed }) {
  const wb = XLSX.utils.book_new();

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: NAVY_HEX } },
  };
  const labelStyle = { font: { bold: true } };

  // --- Sheet 1: Auction Result Summary ---
  // No filter/metadata block or standalone Total Lots/Reserved Price/Bid
  // Amount lines above the table (per task) — the sheet opens directly
  // with the Sales Summary header row; its own total row below still
  // carries the same totals.
  const aoa = [];
  const headerRow = aoa.length;
  aoa.push(["Payment Status", "For Approval Status", "Count of Lot", "Reserved Price", "Bid Amount"]);
  const dataStartRow = aoa.length;
  rows.forEach((r) => aoa.push([r.payment_status, r.for_approval_status, r.count_of_lot, r.reserved_price, r.bid_amount]));
  const totalRowIdx = aoa.length;
  aoa.push(["Total (distinct lots)", "", totals.count_of_lot, totals.reserved_price, totals.bid_amount]);

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);

  const setStyle = (ws, r, c, style) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr]) ws[addr].s = { ...ws[addr].s, ...style };
  };
  const setFormat = (ws, r, c, fmt) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr]) ws[addr].z = fmt;
  };

  for (let c = 0; c < 5; c++) setStyle(ws1, headerRow, c, headerStyle);

  for (let i = 0; i < rows.length; i++) {
    const r = dataStartRow + i;
    setFormat(ws1, r, 2, "#,##0");
    setFormat(ws1, r, 3, '"₱"#,##0.00');
    setFormat(ws1, r, 4, '"₱"#,##0.00');
  }
  setStyle(ws1, totalRowIdx, 0, labelStyle);
  setFormat(ws1, totalRowIdx, 2, "#,##0");
  setFormat(ws1, totalRowIdx, 3, '"₱"#,##0.00');
  setFormat(ws1, totalRowIdx, 4, '"₱"#,##0.00');
  for (let c = 0; c < 5; c++) setStyle(ws1, totalRowIdx, c, { font: { bold: true } });

  ws1["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Auction Result Summary");

  // --- Sheet 2: Top Info ---
  const topInfoAoa = [
    ["Vendor", "Account Executive", "Branch", "Auction Number", "End Date"],
    ...topInfo.map((t) => [dash(t.vendor), dash(t.account_executive), dash(t.branch), dash(t.auction_number), endDateOnly(t.end_date)]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(topInfoAoa);
  for (let c = 0; c < 5; c++) setStyle(ws2, 0, c, headerStyle);
  ws2["!cols"] = [{ wch: 32 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Top Info");

  // --- Sheet 3: Detailed Auction Result ---
  // No title row or standalone Total Bid Amount/Total Reserved Price
  // block above the table (per task) — the sheet opens directly with the
  // detailed header row, except for the truncation warning (kept when
  // present — a data-completeness notice, not a decorative summary total).
  if (detailed) {
    const aoa3 = [];
    if (detailed.truncated) aoa3.push([detailed.truncationNote]);
    const headerRow3 = aoa3.length;
    aoa3.push(DETAILED_COLUMNS.map(([label]) => label));
    const dataStartRow3 = aoa3.length;
    detailed.rows.forEach((r) => aoa3.push(DETAILED_COLUMNS.map(([, get]) => get(r))));

    const ws3 = XLSX.utils.aoa_to_sheet(aoa3);

    if (detailed.truncated) setStyle(ws3, 0, 0, { font: { italic: true, color: { rgb: "B00020" } } });

    for (let c = 0; c < DETAILED_COL_COUNT; c++) setStyle(ws3, headerRow3, c, headerStyle);

    for (let i = 0; i < detailed.rows.length; i++) {
      const r = dataStartRow3 + i;
      setFormat(ws3, r, QTY_COL, "#,##0");
      setFormat(ws3, r, BP_COL, '0.00"%"');
      setFormat(ws3, r, SF_COL, '0.00"%"');
      setFormat(ws3, r, BID_COL, '"₱"#,##0.00');
      setFormat(ws3, r, RESERVED_COL, '"₱"#,##0.00');
    }

    ws3["!cols"] = DETAILED_COLUMNS.map(([label], i) => ({ wch: i === DESCRIPTION_COL ? 44 : Math.max(14, label.length + 2) }));
    ws3["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: headerRow3, c: 0 }, e: { r: dataStartRow3 + detailed.rows.length - 1, c: DETAILED_COL_COUNT - 1 } }),
    };

    XLSX.utils.book_append_sheet(wb, ws3, "Detailed Auction Result");
  }

  XLSX.writeFile(wb, excelFileName(filters));
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
