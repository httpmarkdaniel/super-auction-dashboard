import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatPeso } from "./format";

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

function buildFilterLines(filters, filterLabels) {
  return [
    ["End Date", filters.endDate],
    ["Branch", filterLabels.branch],
    ["Vendor", filterLabels.vendor],
    ["Auction Number", filterLabels.auctionNumber],
    ["Status", filterLabels.status],
    ["BDM", filterLabels.bdm],
  ];
}

// Detailed export's 22 business-label columns, in order — [label, cell
// value getter]. BP %/SF % pass through as-is (buyers_premium/commission
// are stored as plain percentage numbers already, e.g. 15/17/18 — NEVER
// multiplied by 100 here; see api/overview.js's own comment on this).
const DETAILED_COLUMNS = [
  ["DR Received", (r) => endDateOnly(r.dr_received)],
  ["Receiving Number", (r) => dash(r.receiving_number)],
  ["Vendor", (r) => dash(r.vendor)],
  ["Branch", (r) => dash(r.branch)],
  ["Origin", (r) => dash(r.origin)],
  ["DR Number", (r) => dash(r.dr_number)],
  ["DR PIS", (r) => dash(r.dr_pis)],
  ["Account Executive", (r) => dash(r.account_executive)],
  ["Auction Number", (r) => dash(r.auction_number)],
  ["End Date", (r) => endDateOnly(r.end_date)],
  ["Lot Number", (r) => dash(r.lot_number)],
  ["Item Barcode", (r) => dash(r.item_barcode)],
  ["Qty", (r) => numOrBlank(r.qty)],
  ["Item Status", (r) => dash(r.item_status)],
  ["Client Reference Number", (r) => dash(r.client_reference_number)],
  ["Description", (r) => dash(r.description)],
  ["Payment Status", (r) => dash(r.payment_status)],
  ["BP %", (r) => numOrBlank(r.bp_percent)],
  ["SF %", (r) => numOrBlank(r.sf_percent)],
  ["For Approval Status", (r) => dash(r.for_approval_status)],
  ["Bid Amount", (r) => r.bid_amount ?? 0],
  ["Reserved Price", (r) => r.reserved_price ?? 0],
];
const QTY_COL = 12;
const BP_COL = 17;
const SF_COL = 18;
const BID_COL = 20;
const RESERVED_COL = 21;
const DETAILED_COL_COUNT = DETAILED_COLUMNS.length;

// ============================================================
// EXCEL — xlsx-js-style (SheetJS fork with cell style support).
// Three sheets: "Auction Result Summary" (filter context + totals + Sales
// Summary table), "Top Info", and "Detailed Auction Result" (the full
// item-barcode-grain export — see api/overview.js's type=auction-result-
// export). Sheets 1-2 are built from the already-loaded on-screen data;
// Sheet 3's `detailed` argument is only ever populated by an on-demand
// fetch triggered by the Export click itself (see useAuctionResult.js's
// fetchAuctionResultExportData) — never fetched on normal page load.
// ============================================================
export function exportAuctionResultExcel({ filters, filterLabels, totals, rows, topInfo, detailed }) {
  const wb = XLSX.utils.book_new();

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: NAVY_HEX } },
  };
  const titleStyle = { font: { bold: true, sz: 13 } };
  const labelStyle = { font: { bold: true } };

  // --- Sheet 1: Auction Result Summary ---
  const aoa = [];
  aoa.push(["Auction Result Summary"]);
  aoa.push([]);
  buildFilterLines(filters, filterLabels).forEach(([label, value]) => aoa.push([label, value]));
  aoa.push([]);
  const totalLotsRow = aoa.length;
  aoa.push(["Total Lots", totals.count_of_lot]);
  const totalReservedRow = aoa.length;
  aoa.push(["Total Reserved Price", totals.reserved_price]);
  const totalBidRow = aoa.length;
  aoa.push(["Total Bid Amount", totals.bid_amount]);
  aoa.push([]);
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

  setStyle(ws1, 0, 0, titleStyle);
  buildFilterLines(filters, filterLabels).forEach((_, i) => setStyle(ws1, 2 + i, 0, labelStyle));
  setStyle(ws1, totalLotsRow, 0, labelStyle);
  setStyle(ws1, totalReservedRow, 0, labelStyle);
  setStyle(ws1, totalBidRow, 0, labelStyle);
  setFormat(ws1, totalLotsRow, 1, "#,##0");
  setFormat(ws1, totalReservedRow, 1, '"₱"#,##0.00');
  setFormat(ws1, totalBidRow, 1, '"₱"#,##0.00');

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
  if (detailed) {
    const aoa3 = [];
    aoa3.push(["Detailed Auction Result"]);
    if (detailed.truncated) aoa3.push([detailed.truncationNote]);
    aoa3.push([]);
    const totalBidRow3 = aoa3.length;
    aoa3.push(["Total Bid Amount", detailed.totals.bid_amount]);
    const totalReservedRow3 = aoa3.length;
    aoa3.push(["Total Reserved Price", detailed.totals.reserved_price]);
    aoa3.push([]);
    const headerRow3 = aoa3.length;
    aoa3.push(DETAILED_COLUMNS.map(([label]) => label));
    const dataStartRow3 = aoa3.length;
    detailed.rows.forEach((r) => aoa3.push(DETAILED_COLUMNS.map(([, get]) => get(r))));

    const ws3 = XLSX.utils.aoa_to_sheet(aoa3);

    setStyle(ws3, 0, 0, titleStyle);
    if (detailed.truncated) setStyle(ws3, 1, 0, { font: { italic: true, color: { rgb: "B00020" } } });
    setStyle(ws3, totalBidRow3, 0, labelStyle);
    setStyle(ws3, totalReservedRow3, 0, labelStyle);
    setFormat(ws3, totalBidRow3, 1, '"₱"#,##0.00');
    setFormat(ws3, totalReservedRow3, 1, '"₱"#,##0.00');

    for (let c = 0; c < DETAILED_COL_COUNT; c++) setStyle(ws3, headerRow3, c, headerStyle);

    for (let i = 0; i < detailed.rows.length; i++) {
      const r = dataStartRow3 + i;
      setFormat(ws3, r, QTY_COL, "#,##0");
      setFormat(ws3, r, BP_COL, '0.00"%"');
      setFormat(ws3, r, SF_COL, '0.00"%"');
      setFormat(ws3, r, BID_COL, '"₱"#,##0.00');
      setFormat(ws3, r, RESERVED_COL, '"₱"#,##0.00');
    }

    ws3["!cols"] = DETAILED_COLUMNS.map(([label]) => ({ wch: label === "Description" ? 44 : Math.max(14, label.length + 2) }));
    ws3["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: headerRow3, c: 0 }, e: { r: dataStartRow3 + detailed.rows.length - 1, c: DETAILED_COL_COUNT - 1 } }),
    };

    XLSX.utils.book_append_sheet(wb, ws3, "Detailed Auction Result");
  }

  XLSX.writeFile(wb, `Auction_Result_${filters.endDate}.xlsx`);
}

// ============================================================
// PDF — jsPDF + jspdf-autotable. Compact report (filters, summary, Top
// Info table, Sales Summary table, Detailed Auction Result table),
// landscape so the wide detailed table stays readable — autoTable paginates
// long tables across pages automatically (never a screenshot). Built from
// the same in-memory data as the Excel export above.
// ============================================================
export function exportAuctionResultPdf({ filters, filterLabels, totals, rows, topInfo, detailed }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const marginLeft = 40;
  let y = 44;

  doc.setFont(undefined, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY_RGB);
  doc.text("AUCTION RESULT", marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 22;

  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Selected Filters", marginLeft, y);
  y += 14;
  doc.setFont(undefined, "normal");
  buildFilterLines(filters, filterLabels).forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, marginLeft, y);
    y += 13;
  });

  y += 6;
  doc.setFont(undefined, "bold");
  doc.text("Summary", marginLeft, y);
  y += 14;
  doc.setFont(undefined, "normal");
  [
    `Total Lots: ${totals.count_of_lot.toLocaleString()}`,
    `Total Reserved Price: ${formatPeso(totals.reserved_price)}`,
    `Total Bid Amount: ${formatPeso(totals.bid_amount)}`,
  ].forEach((line) => {
    doc.text(line, marginLeft, y);
    y += 13;
  });

  y += 8;
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
    body: rows.map((r) => [r.payment_status, r.for_approval_status, r.count_of_lot.toLocaleString(), formatPeso(r.reserved_price), formatPeso(r.bid_amount)]),
    foot: [["Total (distinct lots)", "", totals.count_of_lot.toLocaleString(), formatPeso(totals.reserved_price), formatPeso(totals.bid_amount)]],
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

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Total Bid Amount: ${formatPeso(detailed.totals.bid_amount)}`, marginLeft, y3);
    y3 += 13;
    doc.text(`Total Reserved Price: ${formatPeso(detailed.totals.reserved_price)}`, marginLeft, y3);
    y3 += 13;
    if (detailed.truncated) {
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
      columnStyles: { 15: { cellWidth: 90 } }, // Description
      head: [DETAILED_COLUMNS.map(([label]) => label)],
      body: detailed.rows.map((r) => DETAILED_COLUMNS.map(([, get]) => String(get(r)))),
    });
  }

  doc.save(`Auction_Result_${filters.endDate}.pdf`);
}
